import type { Point } from "./model";

export interface SelectionBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  padding: number;
}
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function selectionCorners(bounds: SelectionBounds): { corner: Corner; x: number; y: number }[] {
  return [
    { corner: "top-left", x: bounds.left, y: bounds.top },
    { corner: "top-right", x: bounds.right, y: bounds.top },
    { corner: "bottom-left", x: bounds.left, y: bounds.bottom },
    { corner: "bottom-right", x: bounds.right, y: bounds.bottom },
  ];
}

/** Keep the opposite corner fixed and retain enough room for the stroke width. */
export function resizedBounds(bounds: SelectionBounds, corner: Corner, dx: number, dy: number): SelectionBounds {
  const result = { ...bounds };
  const minimum = bounds.padding * 2 + 1;
  if (corner.endsWith("left")) result.left = Math.min(bounds.left + dx, bounds.right - minimum);
  else result.right = Math.max(bounds.right + dx, bounds.left + minimum);
  if (corner.startsWith("top")) result.top = Math.min(bounds.top + dy, bounds.bottom - minimum);
  else result.bottom = Math.max(bounds.bottom + dy, bounds.top + minimum);
  return result;
}

/** Scale ink geometry inside the box while preserving pen width and pressure. */
export function resizedPoint(point: Point, source: SelectionBounds, target: SelectionBounds): Point {
  const width = source.right - source.left - source.padding * 2;
  const height = source.bottom - source.top - source.padding * 2;
  return {
    ...point,
    x: width > 0 ? target.left + target.padding + (point.x - source.left - source.padding) *
      (target.right - target.left - target.padding * 2) / width : (target.left + target.right) / 2,
    y: height > 0 ? target.top + target.padding + (point.y - source.top - source.padding) *
      (target.bottom - target.top - target.padding * 2) / height : (target.top + target.bottom) / 2,
  };
}
