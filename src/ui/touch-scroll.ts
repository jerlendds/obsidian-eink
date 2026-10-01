import { Component } from "obsidian";

/** Route finger gestures to the note underneath the drawing canvas. */
export class TouchScroll extends Component {
  private fingers = new Map<number, { x: number; y: number }>();
  private scrolling = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private scroller: () => HTMLElement,
    private drawWithTouch: () => boolean,
    private penDown: () => boolean,
    private cancelFingerInk: () => void,
    private redraw: () => void,
  ) {
    super();
  }
  down(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    if (this.penDown()) return true; // Palm contact must not move the page beneath a pen.
    this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!this.drawWithTouch() || this.fingers.size > 1 || this.scrolling) {
      this.scrolling = true;
      this.cancelFingerInk();
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      return true;
    }
    return false;
  }
  move(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    const previous = this.fingers.get(event.pointerId);
    if (!previous) return true;
    this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!this.scrolling) return false;
    event.preventDefault();
    const scroller = this.scroller();
    // Averaging each finger's delta moves by the gesture's centroid.
    scroller.scrollLeft += (previous.x - event.clientX) / this.fingers.size;
    scroller.scrollTop += (previous.y - event.clientY) / this.fingers.size;
    this.redraw();
    return true;
  }
  up(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    const consumed = this.scrolling || !this.fingers.has(event.pointerId);
    this.fingers.delete(event.pointerId);
    if (this.fingers.size === 0) this.scrolling = false;
    if (consumed && this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    return consumed;
  }
  get active(): boolean {
    return this.scrolling;
  }
  reset(): void {
    this.fingers.clear();
    this.scrolling = false;
  }
}
