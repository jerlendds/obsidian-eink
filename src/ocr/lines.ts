import type { Stroke } from "../drawing/model";

interface Box { stroke: Stroke; order: number; center: number }

/**
 * Group strokes into text lines by vertical position; each line keeps drawing order,
 * which the stroke-based recognizer relies on. Lines are returned top to bottom.
 */
export function splitLines(strokes: Stroke[]): Stroke[][] {
  const boxes = strokes.filter((stroke) => stroke.points.length).map((stroke, order) => {
    let top = Infinity, bottom = -Infinity;
    for (const point of stroke.points) {
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
    }
    return { stroke, order, center: (top + bottom) / 2, height: bottom - top };
  });
  // Tall strokes define letter height; dots and crossbars are too small to estimate it.
  const heights = boxes.map((box) => box.height).filter((height) => height > 4).sort((a, b) => a - b);
  const letter = heights[Math.floor(heights.length / 2)] ?? 20;
  const lines: { boxes: Box[]; center: number }[] = [];
  const nearest = (box: Box) => lines.reduce<typeof lines[number] | undefined>((best, line) =>
    !best || Math.abs(line.center - box.center) < Math.abs(best.center - box.center) ? line : best, undefined);
  const small = (box: { height: number }) => box.height < letter * 0.4;
  for (const box of boxes.filter((box) => !small(box)).sort((a, b) => a.center - b.center)) {
    // Descenders and ascenders shift a stroke's center by up to about one letter height.
    const line = nearest(box);
    if (!line || Math.abs(line.center - box.center) > letter) {
      lines.push({ boxes: [box], center: box.center });
      continue;
    }
    line.boxes.push(box);
    line.center += (box.center - line.center) / line.boxes.length;
  }
  // Dots, commas and crossbars join the nearest line rather than starting their own.
  for (const box of boxes.filter(small)) {
    const line = nearest(box);
    if (line) line.boxes.push(box);
    else lines.push({ boxes: [box], center: box.center });
  }
  return lines
    .sort((a, b) => a.center - b.center)
    .map((line) => line.boxes.sort((a, b) => a.order - b.order).map((box) => box.stroke));
}
