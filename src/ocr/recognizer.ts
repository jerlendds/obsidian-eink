import packedWeights from "./htr-weights.bin";
import type { Point } from "../drawing/model";

/**
 * Online handwriting recognition: a 3-layer bidirectional LSTM with greedy CTC decoding.
 * Weights: OnlineHTR (MIT, Copyright (c) 2024 Martin Lellep), trained on IAM-OnDB after
 * Carbune et al. 2020; see scripts/export-htr-weights.py. Recognizes one line of text.
 */
const HIDDEN = 64;
const LAYERS = 3;
const ALPHABET = ` !"#&'()*+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZ[]abcdefghijklmnopqrstuvwxyz`;
const OUTPUTS = ALPHABET.length + 1; // index 0 is the CTC blank
const POINTS_PER_UNIT = 20;
// Saved ink has no timestamps; samples arrive at a steady rate, so time follows sample order.
const SECONDS_PER_POINT = 0.008;
const SECONDS_BETWEEN_STROKES = 0.25;

interface Direction { input: Float32Array; recurrent: Float32Array; bias: Float32Array; inputSize: number }
interface Model { layers: [Direction, Direction][]; output: Float32Array; outputBias: Float32Array }
let model: Model | null = null;

function halfToFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1, exponent = (bits >> 10) & 0x1f, fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

/** Decode the bundled float16 weights on first use, keeping plugin startup light. */
function loadModel(): Model {
  if (model) return model;
  const view = new DataView(packedWeights.buffer, packedWeights.byteOffset, packedWeights.byteLength);
  let offset = 0;
  const take = (length: number): Float32Array => {
    const values = new Float32Array(length);
    for (let i = 0; i < length; i++, offset += 2) values[i] = halfToFloat(view.getUint16(offset, true));
    return values;
  };
  const direction = (inputSize: number): Direction => ({
    inputSize,
    input: take(4 * HIDDEN * inputSize),
    recurrent: take(4 * HIDDEN * HIDDEN),
    bias: take(4 * HIDDEN),
  });
  const layers: [Direction, Direction][] = [];
  for (let layer = 0; layer < LAYERS; layer++) {
    const inputSize = layer ? 2 * HIDDEN : 4;
    layers.push([direction(inputSize), direction(inputSize)]);
  }
  const output = take(OUTPUTS * 2 * HIDDEN), outputBias = take(OUTPUTS);
  if (offset !== packedWeights.byteLength) throw new Error("Handwriting model has an unexpected size");
  return (model = { layers, output, outputBias });
}

/** Carbune et al. features: per-stroke resampling to 20 points per unit height, then (dx, dy, dt, n). */
export function inkFeatures(strokes: Point[][]): Float32Array[] {
  const first = strokes[0]?.[0];
  if (!first) return [];
  let minY = Infinity, maxY = -Infinity;
  for (const stroke of strokes) for (const point of stroke) {
    minY = Math.min(minY, -point.y);
    maxY = Math.max(maxY, -point.y);
  }
  const scale = maxY - minY || 1;
  const samples: { x: number; y: number; t: number; stroke: number }[] = [];
  let time = 0;
  strokes.forEach((stroke, index) => {
    // Text faces upward in the training data, so screen y is flipped.
    const points = stroke.map((point, i) => ({
      x: (point.x - first.x) / scale, y: (-point.y - minY) / scale, t: time + i * SECONDS_PER_POINT,
    }));
    time += stroke.length * SECONDS_PER_POINT + SECONDS_BETWEEN_STROKES;
    if (points.length === 1) {
      samples.push({ ...points[0]!, stroke: index });
      return;
    }
    let length = 0;
    for (let i = 1; i < points.length; i++)
      length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    // A zero-length stroke yields no samples, matching the training preprocessing.
    let count = Math.ceil(length * POINTS_PER_UNIT);
    if (count === 1) count = 2;
    // Time is linear in sample index, so time-uniform resampling interpolates by index.
    for (let k = 0; k < count; k++) {
      const position = (k / (count - 1)) * (points.length - 1);
      const i = Math.min(points.length - 2, Math.floor(position)), f = position - i;
      const a = points[i]!, b = points[i + 1]!;
      samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f, stroke: index });
    }
  });
  return samples.map((sample, i) => {
    const previous = samples[i - 1];
    return previous
      ? Float32Array.of(sample.x - previous.x, sample.y - previous.y, sample.t - previous.t, sample.stroke - previous.stroke)
      : Float32Array.of(0, 0, 0, 1);
  });
}

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

/** PyTorch LSTM gate order: input, forget, cell, output. */
function runDirection(weights: Direction, inputs: Float32Array[], reverse: boolean, target: Float32Array[], column: number): void {
  const { input, recurrent, bias, inputSize } = weights;
  const hidden = new Float32Array(HIDDEN), cell = new Float32Array(HIDDEN), gates = new Float32Array(4 * HIDDEN);
  for (let step = 0; step < inputs.length; step++) {
    const t = reverse ? inputs.length - 1 - step : step;
    const x = inputs[t]!;
    for (let row = 0; row < 4 * HIDDEN; row++) {
      let sum = bias[row]!;
      const inputRow = row * inputSize, recurrentRow = row * HIDDEN;
      for (let i = 0; i < inputSize; i++) sum += input[inputRow + i]! * x[i]!;
      for (let i = 0; i < HIDDEN; i++) sum += recurrent[recurrentRow + i]! * hidden[i]!;
      gates[row] = sum;
    }
    const out = target[t]!;
    for (let i = 0; i < HIDDEN; i++) {
      cell[i] = sigmoid(gates[HIDDEN + i]!) * cell[i]! + sigmoid(gates[i]!) * Math.tanh(gates[2 * HIDDEN + i]!);
      hidden[i] = sigmoid(gates[3 * HIDDEN + i]!) * Math.tanh(cell[i]!);
      out[column + i] = hidden[i]!;
    }
  }
}

/** Recognize one line of handwriting, given strokes in drawing order. */
export function recognizeLine(strokes: Point[][]): string {
  const { layers, output, outputBias } = loadModel();
  let sequence = inkFeatures(strokes);
  if (!sequence.length) return "";
  for (const [forward, backward] of layers) {
    const next = sequence.map(() => new Float32Array(2 * HIDDEN));
    runDirection(forward, sequence, false, next, 0);
    runDirection(backward, sequence, true, next, HIDDEN);
    sequence = next;
  }
  // Greedy CTC: best class per step, collapse repeats, drop blanks. Softmax keeps the argmax.
  let text = "", previous = -1;
  for (const features of sequence) {
    let best = 0, bestScore = -Infinity;
    for (let label = 0; label < OUTPUTS; label++) {
      let score = outputBias[label]!;
      const row = label * 2 * HIDDEN;
      for (let i = 0; i < 2 * HIDDEN; i++) score += output[row + i]! * features[i]!;
      if (score > bestScore) { bestScore = score; best = label; }
    }
    if (best !== previous && best !== 0) text += ALPHABET[best - 1];
    previous = best;
  }
  return text;
}
