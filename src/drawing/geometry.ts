import { type Point, type Stroke, widthAt } from "./model";

export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
      )
    : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0 &&
    Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
    Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
    Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
    Math.max(c.y, d.y) >= Math.min(a.y, b.y)
  );
}
function segments(points: Point[]): [Point, Point][] {
  return points.map((point, i) => [points[Math.max(0, i - 1)] ?? point, point]);
}
export function touchesStroke(
  stroke: Stroke,
  path: Point[],
  radius: number,
): boolean {
  return segments(stroke.points).some(([a, b]) =>
    segments(path).some(([c, d]) => {
      const limit =
        radius + Math.max(widthAt(stroke.pen, a), widthAt(stroke.pen, b)) / 2;
      return (
        intersects(a, b, c, d) ||
        Math.min(
          distanceToSegment(a, c, d),
          distanceToSegment(b, c, d),
          distanceToSegment(c, a, b),
          distanceToSegment(d, a, b),
        ) <= limit
      );
    }),
  );
}
export function insidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function lassoHits(stroke: Stroke, polygon: Point[]): boolean {
  const first = polygon[0];
  if (!first || polygon.length < 3) return false;
  return (
    stroke.points.some((point) => insidePolygon(point, polygon)) ||
    touchesStroke(stroke, [...polygon, first], 0)
  );
}
