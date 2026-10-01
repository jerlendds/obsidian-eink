import { touchesStroke } from "./geometry";
import { MM_TO_PX, type Point, type Stroke } from "./model";

export interface TimedPoint extends Point {
  time: number;
}
export const DEFAULT_SCRIBBLE_ACCELERATION = 15000;
const MIN_SWEEP = 12; // CSS pixels: ignore hand tremor and tiny direction changes.
const MIN_REVERSALS = 3;

/** Classify on pen-up. Acceleration is measured in CSS px/s², not device pixels. */
export function isEraseScribble(
  samples: TimedPoint[],
  threshold: number,
): boolean {
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  const points: TimedPoint[] = [];
  for (const point of samples) {
    if (![point.x, point.y, point.time].every(Number.isFinite)) return false;
    const previous = points[points.length - 1];
    if (previous && point.time < previous.time) return false;
    // A duplicate timestamp cannot provide a meaningful velocity estimate.
    if (!previous || point.time > previous.time) points.push(point);
  }
  if (points.length < 5) return false;
  // Test both axes and local runs: extra passes, a pause, or a different ending
  // must not invalidate an earlier qualifying scratch-out.
  return (
    qualifiesOnAxis(points, "x", threshold) ||
    qualifiesOnAxis(points, "y", threshold)
  );
}

function qualifiesOnAxis(
  points: TimedPoint[],
  axis: "x" | "y",
  threshold: number,
): boolean {
  const first = points[0]!;
  const turns: TimedPoint[] = [first];
  let direction = 0,
    extreme = first;
  for (const point of points.slice(1)) {
    if (direction === 0) {
      if (Math.abs(point[axis] - first[axis]) >= MIN_SWEEP) {
        direction = Math.sign(point[axis] - first[axis]);
        extreme = point;
      }
    } else if (direction * (point[axis] - extreme[axis]) > 0) {
      extreme = point;
    } else if (direction * (point[axis] - extreme[axis]) <= -MIN_SWEEP) {
      turns.push(extreme);
      direction *= -1;
      extreme = point;
    }
  }
  if (direction) turns.push(extreme);
  let consecutive = 0;
  for (let i = 1; i < turns.length - 1; i++) {
    const a = turns[i - 1]!,
      b = turns[i]!,
      c = turns[i + 1]!;
    const before = (b.time - a.time) / 1000,
      after = (c.time - b.time) / 1000;
    if (before < 0.008 || after < 0.008) {
      consecutive = 0;
      continue;
    }
    const deltaX = (c.x - b.x) / after - (b.x - a.x) / before;
    const deltaY = (c.y - b.y) / after - (b.y - a.y) / before;
    const acceleration = Math.hypot(deltaX, deltaY) / ((before + after) / 2);
    consecutive = acceleration >= threshold ? consecutive + 1 : 0;
    if (consecutive >= MIN_REVERSALS) {
      const run = turns.slice(i - MIN_REVERSALS, i + 2);
      const start = run[0]!,
        end = run[run.length - 1]!;
      let minX = start.x,
        maxX = start.x,
        minY = start.y,
        maxY = start.y,
        length = 0;
      for (let j = 1; j < run.length; j++) {
        const point = run[j]!,
          previous = run[j - 1]!;
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
      }
      const extent = Math.max(maxX - minX, maxY - minY);
      if (end.time - start.time >= 120 && length >= Math.max(80, extent * 3))
        return true;
    }
  }
  return false;
}

/** Preserve pixel-erasure masks; remove only older pen strokes crossed by the scratch-out. */
export function eraseScribbledStrokes(
  strokes: Stroke[],
  scribble: Stroke,
): Stroke[] {
  return strokes.filter(
    (stroke) =>
      stroke.tool !== "pen" ||
      !touchesStroke(
        stroke,
        scribble.points,
        (scribble.pen.width * MM_TO_PX) / 2,
      ),
  );
}
