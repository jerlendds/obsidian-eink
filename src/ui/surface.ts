import { Component, Notice, type MarkdownView } from "obsidian";
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
import { InkRenderer } from "../drawing/ink-renderer";
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
import { AndroidKeyboardGuard } from "./android-keyboard";
import { SelectionHold } from "./selection-hold";
import { recognizeInk } from "../ocr/recognize-ink";
import { insertRecognizedText } from "../ocr/insert";

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
  private renderer: InkRenderer;
  private scroller: HTMLElement;
  private gesture: Gesture | null = null;
  private touchScroll: TouchScroll;
  private paper = this.addChild(new ScrollPaper());
  private history: DrawingHistory;
  private frame = 0;
  private toolbarVisible = true;
  private selection: InkSelection;
  private selectionHold: SelectionHold;
  private keyboardGuard: AndroidKeyboardGuard;
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
    this.keyboardGuard = this.addChild(new AndroidKeyboardGuard(view.contentEl));
    this.selectionHold = this.addChild(new SelectionHold(this.window, () => this.selectHeldShape()));
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
          "Ink drawing layer. Draw with a pen and swipe with two fingers to scroll.",
      },
    });
    const context = this.canvas.getContext("2d", { desynchronized: true });
    if (!context) {
      this.element.remove();
      throw new Error("Canvas is unavailable");
    }
    this.renderer = new InkRenderer(this.canvas, context);
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
        (ids) => this.convertToText(ids),
      ),
    );
    this.touchScroll = this.addChild(
      new TouchScroll(
        this.canvas,
        () => this.scroller,
        () => (this.store.settings.drawWithTouch || this.selection.active) && this.toolbar.tool !== "hand",
        () => this.gesture?.pointerType === "pen" || this.selection.dragPointerType === "pen",
        () => {
          if (this.gesture?.pointerType === "touch" || this.selection.dragPointerType === "touch") this.cancel(false);
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
    this.view.contentEl.toggleClass("eink-touch-guard", this.toolbarVisible);
    this.register(() => {
      this.gesture = null;
      this.renderer.invalidate();
      this.window.cancelAnimationFrame(this.frame);
      this.element.remove();
      this.view.contentEl.removeClass("eink-host", "eink-touch-guard");
    });
    this.registerDomEvent(this.canvas, "contextrestored", () => {
      this.renderer.invalidate();
      this.requestRender();
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
    // The hand tool passes mouse/pen input through, but still guards touch scrolling.
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const) {
      this.registerDomEvent(this.view.contentEl, type, (event) => {
        if (!this.toolbarVisible || this.toolbar.tool !== "hand" || event.pointerType !== "touch") return;
        if (event.target !== this.canvas && this.element.contains(event.target as Node)) return;
        event.stopPropagation();
        if (type === "pointerdown") this.touchScroll.down(event);
        else if (type === "pointermove") this.touchScroll.move(event);
        else this.touchScroll.up(event);
      }, true);
    }
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
    this.keyboardGuard.setEnabled(visible);
    this.view.contentEl.toggleClass("eink-touch-guard", visible);
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
  private point(event: PointerEvent, rect = this.scroller.getBoundingClientRect()): Point {
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
      this.selection.dragPointer !== undefined ||
      !event.isPrimary ||
      (event.button !== 0 && event.button !== 5)
    )
      return;
    const rect = this.scroller.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX >= rect.right ||
      event.clientY < rect.top ||
      event.clientY >= rect.bottom
    )
      return;
    if (event.button === 0 && this.toolbar.tool === "pen" &&
      this.selection.startDrag(event.pointerId, event.pointerType, this.point(event, rect))) {
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.pointerType === "touch" && !this.store.settings.drawWithTouch) return;
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
    const start = this.point(event, rect);
    this.gesture = {
      pointer: event.pointerId,
      pointerType: event.pointerType,
      eraser: this.store.settings.eraserType,
      history: this.history,
      circleLasso: this.store.settings.circleLasso,
      timedPoints: [{ ...start, time: event.timeStamp }],
      scribbleThreshold: this.store.settings.scribbleErase
        ? this.store.settings.scribbleAcceleration
        : null,
      stroke: { id: uniqueId(), tool, pen, points: [start] },
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.renderInput();
  }
  private move(event: PointerEvent): void {
    if (this.touchScroll.move(event)) return;
    if (this.selection.dragPointer === event.pointerId) {
      event.preventDefault();
      this.selection.moveDrag(this.point(event));
      return;
    }
    if (!this.gesture || this.gesture.pointer !== event.pointerId) return;
    event.preventDefault();
    const samples =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    const rect = this.scroller.getBoundingClientRect();
    for (const sample of samples.length ? samples : [event]) {
      const points = this.gesture.stroke.points;
      const point = this.point(sample, rect),
        previous = points[points.length - 1]!;
      if (this.gesture.scribbleThreshold !== null)
        this.gesture.timedPoints.push({ ...point, time: sample.timeStamp });
      if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5)
        this.gesture.stroke.points.push(point);
    }
    this.renderInput();
    if (this.gesture.circleLasso && this.gesture.stroke.tool === "pen")
      this.selectionHold.update(this.gesture.stroke.points);
  }
  private finish(event: PointerEvent): void {
    this.move(event);
    if (this.touchScroll.up(event)) return;
    if (this.selection.dragPointer === event.pointerId) {
      const moved = this.selection.finishDrag();
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (moved && this.history.commit(moved)) this.changed();
      return;
    }
    if (!this.gesture || this.gesture.pointer !== event.pointerId) return;
    const gesture = this.gesture;
    this.selectionHold.reset();
    this.gesture = null;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
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
  private selectHeldShape(): void {
    const gesture = this.gesture;
    if (!gesture || !this.store.settings.circleLasso || !this.selection.select(gesture.stroke.points)) return;
    this.selectionHold.reset();
    // Record drawing and conversion separately: the first undo restores the exact loop.
    const original = gesture.history.strokes;
    gesture.history.commit([...original, gesture.stroke]);
    gesture.history.commit(original);
    this.gesture = null;
    this.renderer.invalidate();
    this.changed();
  }
  /** Replace selected ink with recognized text in the note, at the ink's position. */
  private async convertToText(ids: Set<string>): Promise<void> {
    const history = this.history;
    const selected = history.strokes.filter((stroke) => ids.has(stroke.id));
    try {
      const { text, top } = await recognizeInk(selected, this.window);
      if (!text) {
        new Notice("No text recognized.");
        return;
      }
      // The note or pane may have changed while recognition yielded.
      if (history !== this.history || !this.element.isConnected) return;
      await insertRecognizedText(this.view, this.scroller, top, text);
    } catch (error) {
      console.error("Eink: handwriting recognition failed", error);
      new Notice("Could not convert the ink to text.");
      return;
    }
    this.selection.clear();
    this.cancel();
    if (history.commit(history.strokes.filter((stroke) => !ids.has(stroke.id)))) this.changed();
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
    this.selectionHold.reset();
    this.paper.extend(this.scroller);
    this.ruling.refresh();
    this.requestRender();
  }
  private cancelPointer(event: PointerEvent): void {
    this.touchScroll.up(event);
    if (this.gesture?.pointer === event.pointerId || this.selection.dragPointer === event.pointerId) this.cancel();
  }
  private cancel(releaseCapture = true): void {
    this.selectionHold.reset();
    const pointer = this.gesture?.pointer ?? this.selection.dragPointer;
    this.selection.cancelDrag();
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
    this.renderNow();
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
    const width = Math.max(1, Math.round(this.element.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.element.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.renderer.invalidate();
    }
    this.requestRender();
  }
  private requestRender(): void {
    if (this.frame) return;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }
  private renderInput(): void {
    if (this.gesture?.stroke.tool === "pen" || this.gesture?.eraser === "Pixel") this.renderNow();
    else this.requestRender();
  }
  private renderNow(): void {
    if (this.frame) this.window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.render();
  }
  private render(): void {
    const rect = this.scroller.getBoundingClientRect(),
      canvasRect = this.canvas.getBoundingClientRect();
    const gesture = this.gesture;
    const incremental = gesture && (gesture.stroke.tool === "pen" || gesture.eraser === "Pixel");
    const lasso = gesture?.stroke.tool === "eraser" && gesture.eraser === "Lasso";
    const strokes = gesture && !incremental ? this.preview(gesture) : this.history.strokes;
    this.renderer.render(this.selection.preview(strokes), incremental ? gesture.stroke : null, {
      ratio: this.window.devicePixelRatio || 1,
      left: rect.left - canvasRect.left,
      top: rect.top - canvasRect.top,
      width: rect.width,
      height: rect.height,
      scrollLeft: this.scroller.scrollLeft,
      scrollTop: this.scroller.scrollTop,
    }, this.selection.active || lasso ? (context) => {
      if (lasso) {
        context.save();
        context.strokeStyle = "#000000";
        context.lineWidth = 1;
        context.setLineDash([5, 5]);
        context.beginPath();
        gesture.stroke.points.forEach((point, i) => {
          if (i === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.stroke();
        context.restore();
      }
      this.selection.render(context);
    } : undefined);
  }
}
