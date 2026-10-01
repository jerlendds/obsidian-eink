import { distanceToSegment, lassoHits } from "./geometry";
import type { Point, Stroke } from "./model";

/** Incremental closed-shape recognition for an append-only stroke. */
export class ClosedShapeTracker {
  private points: Point[] | null = null;
  private first: Point | null = null;
  private count = 0;
  private minX = Infinity;
  private maxX = -Infinity;
  private minY = Infinity;
  private maxY = -Infinity;
  private twiceArea = 0;
  private valid = true;
  private joinSegments: [Point, Point][] = [];
  private startLength = 0;

  reset(): void {
    this.points = null;
    this.first = null;
    this.count = 0;
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
    this.twiceArea = 0;
    this.valid = true;
    this.joinSegments = [];
    this.startLength = 0;
  }
  update(points: Point[]): boolean {
    if (points !== this.points || points.length < this.count) this.reset();
    this.points = points;
    this.first ??= points[0] ?? null;
    for (; this.count < points.length; this.count++) {
      const point = points[this.count]!, previous = points[this.count - 1];
      this.valid &&= Number.isFinite(point.x) && Number.isFinite(point.y);
      this.minX = Math.min(this.minX, point.x);
      this.maxX = Math.max(this.maxX, point.x);
      this.minY = Math.min(this.minY, point.y);
      this.maxY = Math.max(this.maxY, point.y);
      if (previous) {
        const first = this.first!;
        // Absolute triangle areas tolerate overlaps and reversals in a rough loop.
        this.twiceArea += Math.abs((previous.x - first.x) * (point.y - first.y) -
          (point.x - first.x) * (previous.y - first.y));
        if (this.startLength < 48 && this.joinSegments.length < 32) {
          this.joinSegments.push([previous, point]);
          this.startLength += Math.hypot(point.x - previous.x, point.y - previous.y);
        }
      }
    }
    if (!this.valid || points.length < 4) return false;
    const first = this.first!, last = points[points.length - 1]!;
    const extent = Math.min(this.maxX - this.minX, this.maxY - this.minY);
    const tolerance = Math.min(48, Math.max(18, extent * 0.3));
    const joinsStart = Math.hypot(last.x - first.x, last.y - first.y) <= tolerance ||
      this.joinSegments.some(([a, b]) => distanceToSegment(last, a, b) <= tolerance);
    return extent >= 24 && this.twiceArea >= 576 && joinsStart;
  }
}

/** A closed shape with enough area to distinguish it from a tap or line. */
export function isClosedShape(points: Point[]): boolean {
  return new ClosedShapeTracker().update(points);
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
