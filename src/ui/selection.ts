import { Component } from "obsidian";
import { lassoSelection } from "../drawing/lasso";
import { type Point, type Stroke, widthAt } from "../drawing/model";

/** Transient selection state: never saved as ink or recorded as an undo step. */
export class InkSelection extends Component {
  private ids = new Set<string>();
  private polygon: Point[] = [];
  readonly element: HTMLElement;
  private label: HTMLElement;
  constructor(
    parent: HTMLElement,
    private strokes: () => Stroke[],
    private redraw: () => void,
    private remove: (ids: Set<string>) => void,
  ) {
    super();
    this.element = parent.createDiv({
      cls: "eink-selection-actions",
      attr: { role: "group", "aria-label": "Ink selection" },
    });
    this.label = this.element.createSpan({
      attr: { role: "status", "aria-live": "polite" },
    });
    const erase = this.element.createEl("button", {
      text: "Delete selection",
      attr: { type: "button" },
    });
    const clear = this.element.createEl("button", {
      text: "Deselect",
      attr: { type: "button" },
    });
    this.registerDomEvent(erase, "click", () => {
      const ids = new Set(this.ids);
      this.clear();
      this.remove(ids);
    });
    this.registerDomEvent(clear, "click", () => this.clear());
    this.element.hidden = true;
    this.register(() => this.element.remove());
  }
  select(polygon: Point[]): boolean {
    const ids = lassoSelection(this.strokes(), polygon);
    if (!ids.size) return false;
    this.ids = ids;
    this.polygon = polygon.map((point) => ({ ...point }));
    this.update();
    this.redraw();
    return true;
  }
  clear(): void {
    this.ids.clear();
    this.polygon = [];
    this.update();
    this.redraw();
  }
  refresh(): void {
    const current = new Set(this.strokes().map((stroke) => stroke.id));
    for (const id of this.ids) if (!current.has(id)) this.ids.delete(id);
    this.update();
  }
  private update(): void {
    this.element.hidden = !this.ids.size;
    this.label.setText(
      `${this.ids.size} ${this.ids.size === 1 ? "stroke" : "strokes"} selected`,
    );
  }
  render(context: CanvasRenderingContext2D): void {
    if (!this.ids.size) return;
    context.save();
    context.strokeStyle = "#0066cc";
    context.lineWidth = 1.5;
    context.setLineDash([6, 4]);
    context.beginPath();
    this.polygon.forEach((point, i) => {
      if (i) context.lineTo(point.x, point.y);
      else context.moveTo(point.x, point.y);
    });
    context.closePath();
    context.stroke();
    context.setLineDash([3, 3]);
    for (const stroke of this.strokes()) {
      if (!this.ids.has(stroke.id)) continue;
      let left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      for (const point of stroke.points) {
        const radius = widthAt(stroke.pen, point) / 2 + 3;
        left = Math.min(left, point.x - radius);
        top = Math.min(top, point.y - radius);
        right = Math.max(right, point.x + radius);
        bottom = Math.max(bottom, point.y + radius);
      }
      if (Number.isFinite(left))
        context.strokeRect(left, top, right - left, bottom - top);
    }
    context.restore();
  }
}
