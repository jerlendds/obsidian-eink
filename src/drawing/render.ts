import { type Stroke, widthAt } from "./model";

export function renderStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
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
  for (let i = 0; i < stroke.points.length; i++) {
    const point = stroke.points[i]!;
    const previous = stroke.points[Math.max(0, i - 1)]!;
    let width = widthAt(stroke.pen, point);
    if (type === "Brush") width *= 0.35 + point.pressure;
    if (type === "Fountain") width *= 0.65 + point.pressure * 0.5;
    if (type === "Calligraphy") {
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
      width *= 0.25 + 0.75 * Math.abs(Math.sin(angle - Math.PI / 4));
    }
    context.lineWidth = Math.max(0.25, width);
    context.beginPath();
    if (i === 0 || (point.x === previous.x && point.y === previous.y)) {
      context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    if (type === "Pencil") {
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
