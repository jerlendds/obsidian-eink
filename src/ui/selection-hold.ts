import { Component } from "obsidian";
import { ClosedShapeTracker } from "../drawing/lasso";
import type { Point } from "../drawing/model";

/** Require continuous contact and a stationary endpoint after closing the shape. */
export class SelectionHold extends Component {
  private timer: number | null = null;
  private anchor: Point | null = null;
  private shape = new ClosedShapeTracker();
  constructor(private window: Window, private select: () => void) {
    super();
    this.register(() => this.reset());
  }
  update(points: Point[]): void {
    const last = points[points.length - 1];
    const closed = this.shape.update(points);
    // Once a hold begins, small endpoint wobble must not repeatedly restart it.
    if (last && this.anchor && Math.hypot(last.x - this.anchor.x, last.y - this.anchor.y) <= 12) return;
    if (!last || !closed) {
      this.clearTimer();
      return;
    }
    this.clearTimer();
    this.anchor = { ...last };
    this.timer = this.window.setTimeout(() => {
      this.timer = null;
      this.select();
    }, 1500);
  }
  reset(): void {
    this.shape.reset();
    this.clearTimer();
  }
  private clearTimer(): void {
    if (this.timer !== null) this.window.clearTimeout(this.timer);
    this.timer = null;
    this.anchor = null;
  }
}
