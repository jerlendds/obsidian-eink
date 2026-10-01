import { lassoHits } from "./geometry";
import type { Point, Stroke } from "./model";
import type { TimedPoint } from "./scribble";

/** A single fast, nearly closed loop; reject tiny letters, open arcs and scratch-outs. */
export function isQuickCircle(samples: TimedPoint[]): boolean {
  const points: TimedPoint[] = [];
  for (const point of samples) {
    if (![point.x, point.y, point.time].every(Number.isFinite)) return false;
    const previous = points[points.length - 1];
    if (previous && point.time < previous.time) return false;
    if (!previous || point.time > previous.time) points.push(point);
  }
  const first = points[0],
    last = points[points.length - 1];
  if (!first || !last || points.length < 8) return false;
  const duration = last.time - first.time;
  if (duration < 80 || duration > 1000) return false;
  let minX = first.x,
    maxX = first.x,
    minY = first.y,
    maxY = first.y,
    length = 0,
    twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!,
      next = points[(i + 1) % points.length]!;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    length += Math.hypot(next.x - point.x, next.y - point.y);
    twiceArea += point.x * next.y - next.x * point.y;
  }
  const smallerExtent = Math.min(maxX - minX, maxY - minY);
  if (
    smallerExtent < 24 ||
    Math.hypot(last.x - first.x, last.y - first.y) >
      Math.min(32, Math.max(12, smallerExtent * 0.2))
  )
    return false;
  const circularity = (2 * Math.PI * Math.abs(twiceArea)) / (length * length);
  return circularity >= 0.55 && length / (duration / 1000) >= 250;
}

export function lassoSelection(
  strokes: Stroke[],
  polygon: Point[],
): Set<string> {
  return new Set(
    strokes
      .filter((stroke) => stroke.tool === "pen" && lassoHits(stroke, polygon))
      .map((stroke) => stroke.id),
  );
}
