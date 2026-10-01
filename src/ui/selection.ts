import { Component } from "obsidian";
import { lassoSelection } from "../drawing/lasso";
import { resizedBounds, resizedPoint, selectionCorners, type Corner, type SelectionBounds } from "../drawing/selection-transform";
import { type Point, type Stroke, widthAt } from "../drawing/model";

/** Transient selection bounds; the surface records the stroke-to-selection conversion. */
export class InkSelection extends Component {
  private ids = new Set<string>();
  readonly element: HTMLElement;
  private label: HTMLElement;
  private drag: { pointer: number; pointerType: string; origin: Point; dx: number; dy: number; bounds: SelectionBounds; corner: Corner | null } | null = null;

  get active(): boolean { return this.ids.size > 0; }
  get dragPointer(): number | undefined { return this.drag?.pointer; }
  get dragPointerType(): string | undefined { return this.drag?.pointerType; }

  startDrag(pointer: number, pointerType: string, point: Point): boolean {
    const bounds = this.bounds();
    if (!bounds) return false;
    const radius = pointerType === "touch" ? 22 : 12;
    const handle = selectionCorners(bounds)
      .map((entry) => ({ ...entry, distance: Math.hypot(point.x - entry.x, point.y - entry.y) }))
      .filter((entry) => entry.distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!handle && (point.x < bounds.left || point.x > bounds.right ||
      point.y < bounds.top || point.y > bounds.bottom)) return false;
    this.drag = { pointer, pointerType, origin: point, dx: 0, dy: 0, bounds, corner: handle?.corner ?? null };
    return true;
  }
  moveDrag(point: Point): void {
    if (!this.drag) return;
    this.drag.dx = point.x - this.drag.origin.x;
    this.drag.dy = point.y - this.drag.origin.y;
    this.redraw();
  }
  finishDrag(): Stroke[] | null {
    const moved = this.drag && (this.drag.dx !== 0 || this.drag.dy !== 0)
      ? this.preview(this.strokes()) : null;
    this.cancelDrag();
    return moved;
  }
  cancelDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.redraw();
  }
  preview(strokes: Stroke[]): Stroke[] {
    const drag = this.drag;
    if (!drag || (!drag.dx && !drag.dy)) return strokes;
    const target = drag.corner ? resizedBounds(drag.bounds, drag.corner, drag.dx, drag.dy) : null;
    return strokes.map((stroke) => this.ids.has(stroke.id) ? {
      ...stroke,
      points: stroke.points.map((point) => target ? resizedPoint(point, drag.bounds, target) :
        ({ ...point, x: point.x + drag.dx, y: point.y + drag.dy })),
    } : stroke);
  }
  constructor(
    parent: HTMLElement,
    private strokes: () => Stroke[],
    private redraw: () => void,
    private remove: (ids: Set<string>) => void,
    private convert: (ids: Set<string>) => Promise<void>,
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
    const ocr = this.element.createEl("button", {
      text: "OCR",
      attr: { type: "button", "aria-label": "Convert selected ink to text" },
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
    this.registerDomEvent(ocr, "click", () => {
      const ids = new Set(this.ids);
      ocr.disabled = true;
      ocr.setText("Recognizing…");
      void this.convert(ids).finally(() => {
        ocr.disabled = false;
        ocr.setText("OCR");
      });
    });
    this.registerDomEvent(clear, "click", () => this.clear());
    this.element.hidden = true;
    this.register(() => this.element.remove());
  }
  select(polygon: Point[]): boolean {
    const ids = lassoSelection(this.strokes(), polygon);
    if (!ids.size) return false;
    this.ids = ids;
    this.update();
    this.redraw();
    return true;
  }
  clear(): void {
    if (!this.ids.size && !this.drag) return;
    this.cancelDrag();
    this.ids.clear();
    this.update();
    this.redraw();
  }
  refresh(): void {
    if (!this.ids.size) return;
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
  private bounds(): SelectionBounds | null {
    if (!this.ids.size) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, padding = 0;
    for (const stroke of this.preview(this.strokes())) {
      if (!this.ids.has(stroke.id)) continue;
      for (const point of stroke.points) {
        padding = Math.max(padding, widthAt(stroke.pen, point) / 2 + 3);
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
    }
    return Number.isFinite(left) ? { left: left - padding, top: top - padding, right: right + padding, bottom: bottom + padding, padding } : null;
  }
  render(context: CanvasRenderingContext2D): void {
    const bounds = this.bounds();
    if (!bounds) return;
    context.save();
    context.strokeStyle = "#0066cc";
    context.lineWidth = 1.5;
    context.setLineDash([6, 4]);
    context.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    context.setLineDash([]);
    context.fillStyle = "#ffffff";
    for (const corner of selectionCorners(bounds)) {
      context.fillRect(corner.x - 7, corner.y - 7, 14, 14);
      context.strokeRect(corner.x - 7, corner.y - 7, 14, 14);
    }
    context.restore();
  }
}
