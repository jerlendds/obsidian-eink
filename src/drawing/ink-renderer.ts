import { type Stroke, widthAt } from "./model";
import { renderStroke } from "./render";

export interface InkViewport {
  ratio: number;
  left: number;
  top: number;
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
}
interface Bounds { left: number; top: number; right: number; bottom: number }

/** Retain ink in the visible bitmap; ordinary pen moves draw only new segments. */
export class InkRenderer {
  private viewport: InkViewport | null = null;
  private strokes: Stroke[] | null = null;
  private live: Stroke | null = null;
  private points = 0;
  private decorated = false;
  private bounds = new WeakMap<Stroke, Bounds>();

  constructor(private canvas: HTMLCanvasElement, private context: CanvasRenderingContext2D) {}

  invalidate(): void {
    this.viewport = null;
    this.strokes = null;
    this.live = null;
    this.points = 0;
  }

  render(strokes: Stroke[], live: Stroke | null, viewport: InkViewport,
    decorate?: (context: CanvasRenderingContext2D) => void): void {
    const previous = this.viewport;
    const unchangedView = previous && Object.keys(viewport).every(
      (key) => viewport[key as keyof InkViewport] === previous[key as keyof InkViewport],
    );
    let incremental: Stroke | null = null;
    let from = 0;
    let replay = true;
    if (unchangedView && !this.decorated && !decorate) {
      if (strokes === this.strokes && (!this.live || this.live === live)) {
        replay = false;
        incremental = live;
        from = this.live === live ? this.points : 0;
      } else if (!live && this.strokes && strokes.length === this.strokes.length + 1 &&
        this.strokes.every((stroke, index) => stroke === strokes[index])) {
        const added = strokes[strokes.length - 1]!;
        if (!this.live || this.live === added) {
          replay = false;
          incremental = added;
          from = this.live === added ? this.points : 0;
        }
      }
    }
    if (replay) {
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.inPage(viewport, () => {
        for (const stroke of strokes) {
          if (this.visible(stroke, viewport)) renderStroke(this.context, stroke);
        }
        if (live) renderStroke(this.context, live, 0, true);
        decorate?.(this.context);
      });
    } else if (incremental && (from < incremental.points.length || incremental !== live)) {
      this.inPage(viewport, () => renderStroke(this.context, incremental, from, incremental === live));
    }
    this.viewport = viewport;
    this.strokes = strokes;
    this.live = live;
    this.points = live?.points.length ?? 0;
    this.decorated = !!decorate;
  }

  private inPage(viewport: InkViewport, draw: () => void): void {
    const { ratio, left, top, width, height, scrollLeft, scrollTop } = viewport;
    const context = this.context;
    context.save();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.beginPath();
    context.rect(left, top, width, height);
    context.clip();
    context.translate(left - scrollLeft, top - scrollTop);
    draw();
    context.restore();
  }

  private visible(stroke: Stroke, viewport: InkViewport): boolean {
    let bounds = this.bounds.get(stroke);
    if (!bounds) {
      bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      let padding = 0;
      for (const point of stroke.points) {
        // Pad the entire extent: a wide segment also covers its narrower starting point.
        padding = Math.max(padding, widthAt(stroke.pen, point) + 2);
        bounds.left = Math.min(bounds.left, point.x);
        bounds.top = Math.min(bounds.top, point.y);
        bounds.right = Math.max(bounds.right, point.x);
        bounds.bottom = Math.max(bounds.bottom, point.y);
      }
      bounds.left -= padding;
      bounds.top -= padding;
      bounds.right += padding;
      bounds.bottom += padding;
      this.bounds.set(stroke, bounds);
    }
    return bounds.right >= viewport.scrollLeft && bounds.left <= viewport.scrollLeft + viewport.width &&
      bounds.bottom >= viewport.scrollTop && bounds.top <= viewport.scrollTop + viewport.height;
  }
}
