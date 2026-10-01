import { type Point, type Stroke, widthAt } from "./model";

const midpoint = (a: Point, b: Point): Point => ({ ...b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Curves pass through segment midpoints with each sample as the control point, so sparse
 * samples from fast writing stay round. Segment i depends only on samples i-2..i, keeping
 * incremental painting identical to a full replay. A live stroke omits its final half
 * segment (`live`), which is drawn once the stroke is committed.
 */
export function renderStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  fromPoint = 0,
  live = false,
): void {
  context.save();
  context.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.fillStyle = stroke.pen.color;
  context.strokeStyle = stroke.pen.color;
  context.lineCap = "round";
  context.lineJoin = "round";
  const type = stroke.tool === "eraser" ? "Pen" : stroke.pen.type;
  context.globalAlpha = type === "Marker" ? 0.35 : type === "Pencil" ? 0.65 : 1;
  const points = stroke.points;
  const tail = !live && points.length > 1;
  for (let i = fromPoint; i < points.length + (tail ? 1 : 0); i++) {
    const isTail = i === points.length;
    const point = points[isTail ? i - 1 : i]!;
    const previous = points[Math.max(0, i - 1)]!;
    let width = widthAt(stroke.pen, point);
    if (type === "Brush") width *= 0.35 + point.pressure;
    if (type === "Fountain") width *= 0.65 + point.pressure * 0.5;
    if (type === "Calligraphy") {
      // The tail continues the direction of the final sampled segment.
      const from = isTail ? points[i - 2]! : previous;
      const angle = Math.atan2(point.y - from.y, point.x - from.x);
      width *= 0.25 + 0.75 * Math.abs(Math.sin(angle - Math.PI / 4));
    }
    context.lineWidth = Math.max(0.25, width);
    context.beginPath();
    const start = i < 2 ? points[0]! : midpoint(points[i - 2]!, previous);
    const end = isTail ? point : midpoint(previous, point);
    if (i === 0 || (start.x === end.x && start.y === end.y)) {
      context.arc(end.x, end.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(previous.x, previous.y, end.x, end.y);
      context.stroke();
    }
    if (type === "Pencil" && !isTail) {
      // Deterministic paper grain, so redraw and undo reproduce the same mark.
      context.save();
      context.globalAlpha = 0.3;
      context.fillStyle = "#ffffff";
      context.fillRect(
        point.x + (Math.sin(i * 17) * width) / 3,
        point.y + (Math.cos(i * 13) * width) / 3,
        0.7,
        0.7,
      );
      context.restore();
    }
  }
  context.restore();
}
