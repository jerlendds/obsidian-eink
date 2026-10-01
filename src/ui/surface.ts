import { Component, type MarkdownView } from "obsidian";
import {
  clamp,
  MM_TO_PX,
  uniqueId,
  type DrawingHistory,
  type Point,
  type Stroke,
  type EraserType,
} from "../drawing/model";
import { lassoHits, touchesStroke } from "../drawing/geometry";
import { renderStroke } from "../drawing/render";
import {
  isEraseScribble,
  eraseScribbledStrokes,
  type TimedPoint,
} from "../drawing/scribble";
import type { InkStore } from "../storage";
import { InkToolbar, type Tool } from "./toolbar";
import { TouchScroll } from "./touch-scroll";
import { ScrollPaper } from "./scroll-paper";
import { InkSelection } from "./selection";
import { RuledLines } from "./ruled-lines";
import { isQuickCircle } from "../drawing/lasso";

interface Gesture {
  pointer: number;
  pointerType: string;
  stroke: Stroke;
  eraser: EraserType;
  history: DrawingHistory;
  circleLasso: boolean;
  timedPoints: TimedPoint[];
  scribbleThreshold: number | null;
}
export class InkSurface extends Component {
  readonly element: HTMLElement;
  readonly toolbar: InkToolbar;
  private canvas: HTMLCanvasElement;
  private ruling: RuledLines;
  private context: CanvasRenderingContext2D;
  private scroller: HTMLElement;
  private gesture: Gesture | null = null;
  private touchScroll: TouchScroll;
  private paper = this.addChild(new ScrollPaper());
  private history: DrawingHistory;
  private frame = 0;
  private toolbarVisible = true;
  private selection: InkSelection;
  private window: Window;
  constructor(
    readonly view: MarkdownView,
    readonly path: string,
    private store: InkStore,
    close: () => void,
    private onChange: () => void = () => {},
  ) {
    super();
    this.history = store.history(path);
    this.window = view.contentEl.win;
    this.element = view.contentEl.createDiv({ cls: "eink-surface" });
    this.ruling = this.addChild(
      new RuledLines(
        this.element,
        () => this.scroller,
        () => this.store.settings.ruledLines,
      ),
    );
    this.canvas = this.element.createEl("canvas", {
      cls: "eink-canvas",
      attr: {
        "aria-label":
          "Ink drawing layer. Draw with a pen and swipe with a finger to scroll.",
      },
    });
    const context = this.canvas.getContext("2d");
    if (!context) {
      this.element.remove();
      throw new Error("Canvas is unavailable");
    }
    this.context = context;
    this.scroller = this.findScroller();
    this.selection = this.addChild(
      new InkSelection(
        this.element,
        () => this.history.strokes,
        () => this.requestRender(),
        (ids) => {
          this.cancel();
          if (
            this.history.commit(
              this.history.strokes.filter((stroke) => !ids.has(stroke.id)),
            )
          )
            this.changed();
        },
      ),
    );
    this.touchScroll = this.addChild(
      new TouchScroll(
        this.canvas,
        () => this.scroller,
        () => this.store.settings.drawWithTouch,
        () => this.gesture?.pointerType === "pen",
        () => {
          if (this.gesture?.pointerType === "touch") this.cancel(false);
        },
        () => this.scrolled(),
      ),
    );
    this.toolbar = this.addChild(
      new InkToolbar(this.element, store, {
        select: (tool) => this.select(tool),
        undo: () => this.undo(),
        redo: () => this.redo(),
        close,
        ruling: () => {
          this.ruling.refresh();
          this.onChange();
        },
      }),
    );
  }
  private findScroller(): HTMLElement {
    const selector =
      this.view.getMode() === "preview"
        ? ".markdown-preview-view"
        : ".cm-scroller";
    return (
      this.view.contentEl.querySelector<HTMLElement>(selector) ??
      this.view.contentEl
    );
  }
  onload(): void {
    this.view.contentEl.addClass("eink-host");
    this.register(() => {
      this.gesture = null;
      this.window.cancelAnimationFrame(this.frame);
      this.element.remove();
      this.view.contentEl.removeClass("eink-host");
    });
    this.registerDomEvent(this.canvas, "pointerdown", (event) =>
      this.start(event),
    );
    this.registerDomEvent(this.canvas, "pointermove", (event) =>
      this.move(event),
    );
    this.registerDomEvent(this.canvas, "pointerup", (event) =>
      this.finish(event),
    );
    this.registerDomEvent(this.canvas, "pointercancel", (event) =>
      this.cancelPointer(event),
    );
    this.registerDomEvent(this.canvas, "lostpointercapture", (event) =>
      this.cancelPointer(event),
    );
    this.registerDomEvent(
      this.canvas,
      "wheel",
      (event) => {
        event.preventDefault();
        const scale =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? this.scroller.clientHeight
              : 1;
        this.scroller.scrollTop += event.deltaY * scale;
        this.scroller.scrollLeft += event.deltaX * scale;
        this.scrolled();
      },
      { passive: false },
    );
    this.registerDomEvent(
      this.view.contentEl,
      "scroll",
      () => this.scrolled(),
      true,
    );
    this.registerDomEvent(this.view.contentEl, "keydown", (event) => {
      if (event.key === "Escape") {
        this.cancel();
        this.selection.clear();
      }
    });
    const observer = new ResizeObserver(() => {
      this.resize();
      this.toolbar.reposition();
    });
    observer.observe(this.view.contentEl);
    this.register(() => observer.disconnect());
    this.paper.attach(this.scroller, this.history.strokes);
    this.resize();
    this.updateHistory();
  }
  refresh(): void {
    this.selection.refresh();
    this.ruling.refresh();
    this.toolbar.syncRuling();
    const scroller = this.findScroller();
    if (scroller !== this.scroller) {
      this.cancel();
      this.touchScroll.reset();
    }
    this.scroller = scroller;
    this.paper.attach(scroller, this.history.strokes);
    this.updateHistory();
    this.resize();
    this.toolbar.reposition();
  }
  setToolbarVisible(visible: boolean): void {
    if (visible !== this.toolbarVisible) {
      this.selection.clear();
      this.cancel();
      this.touchScroll.reset();
    }
    this.toolbarVisible = visible;
    this.toolbar.element.hidden = !visible;
    this.canvas.toggleClass(
      "eink-navigate",
      !visible || this.toolbar.tool === "hand",
    );
    if (visible) this.toolbar.reposition();
  }
  private select(tool: Tool): void {
    this.selection.clear();
    this.cancel();
    this.touchScroll.reset();
    this.canvas.toggleClass("eink-navigate", tool === "hand");
  }
  private point(event: PointerEvent): Point {
    const rect = this.scroller.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + this.scroller.scrollLeft,
      y: event.clientY - rect.top + this.scroller.scrollTop,
      pressure:
        event.pointerType === "pen" ? clamp(event.pressure, 0.01, 1) : 0.5,
    };
  }
  private start(event: PointerEvent): void {
    if (!this.toolbarVisible || this.toolbar.tool === "hand") return;
    if (this.touchScroll.down(event) || this.touchScroll.active) return;
    if (
      this.gesture ||
      !event.isPrimary ||
      (event.button !== 0 && event.button !== 5)
    )
      return;
    if (event.pointerType === "touch" && !this.store.settings.drawWithTouch)
      return;
    const rect = this.scroller.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX >= rect.right ||
      event.clientY < rect.top ||
      event.clientY >= rect.bottom
    )
      return;
    event.preventDefault();
    this.selection.clear();
    const tool =
      this.toolbar.tool === "eraser" || event.button === 5 ? "eraser" : "pen";
    const pen = { ...this.toolbar.pen };
    if (tool === "eraser") {
      pen.width = this.store.settings.eraserWidth;
      pen.pressure = 0;
      pen.type = "Pen";
    }
    this.gesture = {
      pointer: event.pointerId,
      pointerType: event.pointerType,
      eraser: this.store.settings.eraserType,
      history: this.history,
      circleLasso: this.store.settings.circleLasso,
      timedPoints: [{ ...this.point(event), time: event.timeStamp }],
      scribbleThreshold: this.store.settings.scribbleErase
        ? this.store.settings.scribbleAcceleration
        : null,
      stroke: { id: uniqueId(), tool, pen, points: [this.point(event)] },
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.requestRender();
  }
  private move(event: PointerEvent): void {
    if (this.touchScroll.move(event)) return;
    if (!this.gesture || this.gesture.pointer !== event.pointerId) return;
    event.preventDefault();
    const samples =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    for (const sample of samples.length ? samples : [event]) {
      const points = this.gesture.stroke.points;
      const point = this.point(sample),
        previous = points[points.length - 1]!;
      this.gesture.timedPoints.push({ ...point, time: sample.timeStamp });
      if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5)
        this.gesture.stroke.points.push(point);
    }
    this.requestRender();
  }
  private finish(event: PointerEvent): void {
    this.move(event);
    if (this.touchScroll.up(event)) return;
    if (!this.gesture || this.gesture.pointer !== event.pointerId) return;
    const gesture = this.gesture;
    this.gesture = null;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    if (
      gesture.stroke.tool === "pen" &&
      gesture.circleLasso &&
      isQuickCircle(gesture.timedPoints) &&
      this.selection.select(gesture.stroke.points)
    ) {
      this.requestRender();
      return;
    }
    let result = this.preview(gesture);
    if (
      gesture.stroke.tool === "pen" &&
      gesture.scribbleThreshold !== null &&
      isEraseScribble(gesture.timedPoints, gesture.scribbleThreshold)
    ) {
      const erased = eraseScribbledStrokes(
        gesture.history.strokes,
        gesture.stroke,
      );
      // A scribble on blank space remains ink, rather than silently disappearing.
      if (erased.length < gesture.history.strokes.length) result = erased;
    }
    if (gesture.history.commit(result)) this.changed();
    this.requestRender();
  }
  private preview(gesture: Gesture): Stroke[] {
    const { stroke, eraser, history } = gesture;
    if (stroke.tool === "pen" || eraser === "Pixel")
      return [...history.strokes, stroke];
    return history.strokes.filter(
      (existing) =>
        existing.tool === "eraser" ||
        !(eraser === "Stroke"
          ? touchesStroke(
              existing,
              stroke.points,
              (stroke.pen.width * MM_TO_PX) / 2,
            )
          : lassoHits(existing, stroke.points)),
    );
  }
  private scrolled(): void {
    this.paper.extend(this.scroller);
    this.ruling.refresh();
    this.requestRender();
  }
  private cancelPointer(event: PointerEvent): void {
    this.touchScroll.up(event);
    if (this.gesture?.pointer === event.pointerId) this.cancel();
  }
  private cancel(releaseCapture = true): void {
    const pointer = this.gesture?.pointer;
    this.gesture = null;
    if (
      releaseCapture &&
      pointer !== undefined &&
      this.canvas.hasPointerCapture(pointer)
    )
      this.canvas.releasePointerCapture(pointer);
    this.requestRender();
  }
  undo(): void {
    this.selection.clear();
    this.cancel();
    if (this.history.undo()) this.changed();
  }
  redo(): void {
    this.selection.clear();
    this.cancel();
    if (this.history.redo()) this.changed();
  }
  private changed(): void {
    this.paper.attach(this.scroller, this.history.strokes);
    void this.store.changed(this.path, this.history);
    this.updateHistory();
    this.requestRender();
    this.onChange();
  }
  private updateHistory(): void {
    this.toolbar.history(this.history.canUndo, this.history.canRedo);
  }
  private resize(): void {
    this.ruling.refresh();
    const ratio = this.window.devicePixelRatio || 1;
    this.canvas.width = Math.max(
      1,
      Math.round(this.element.clientWidth * ratio),
    );
    this.canvas.height = Math.max(
      1,
      Math.round(this.element.clientHeight * ratio),
    );
    this.requestRender();
  }
  private requestRender(): void {
    if (this.frame) return;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }
  private render(): void {
    const context = this.context,
      ratio = this.window.devicePixelRatio || 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const rect = this.scroller.getBoundingClientRect(),
      canvasRect = this.canvas.getBoundingClientRect();
    context.save();
    context.beginPath();
    context.rect(
      rect.left - canvasRect.left,
      rect.top - canvasRect.top,
      rect.width,
      rect.height,
    );
    context.clip();
    context.translate(
      rect.left - canvasRect.left - this.scroller.scrollLeft,
      rect.top - canvasRect.top - this.scroller.scrollTop,
    );
    for (const stroke of this.gesture
      ? this.preview(this.gesture)
      : this.history.strokes)
      renderStroke(context, stroke);
    if (
      this.gesture?.stroke.tool === "eraser" &&
      this.gesture.eraser === "Lasso"
    ) {
      context.strokeStyle = "#000000";
      context.lineWidth = 1;
      context.setLineDash([5, 5]);
      context.beginPath();
      this.gesture.stroke.points.forEach((point, i) => {
        if (i === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      context.stroke();
    }
    this.selection.render(context);
    context.restore();
  }
}
