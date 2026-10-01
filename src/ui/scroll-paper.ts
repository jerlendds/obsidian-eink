import { Component } from "obsidian";
import type { Stroke } from "../drawing/model";

/** Grow a blank writing tail inside the note's own scroller, without editing Markdown. */
export class ScrollPaper extends Component {
  private content: HTMLElement | null = null;
  private height = 0;
  onload(): void {
    this.register(() => this.detach());
  }
  attach(scroller: HTMLElement, strokes: Stroke[]): void {
    const content = scroller.querySelector<HTMLElement>(
      ".markdown-preview-sizer, .cm-content",
    );
    if (content !== this.content) {
      this.detach();
      this.content = content;
    }
    if (!this.content) return;
    const nativeMinimum = Number.parseFloat(this.content.style.minHeight) || 0;
    let inkBottom = 0;
    for (const stroke of strokes)
      for (const point of stroke.points)
        inkBottom = Math.max(inkBottom, point.y + 32);
    this.height = Math.max(
      this.height,
      nativeMinimum,
      scroller.clientHeight * 2,
      inkBottom + scroller.clientHeight,
    );
    this.content.addClass("eink-scroll-paper");
    this.apply();
  }
  extend(scroller: HTMLElement): void {
    if (!this.content) return;
    const bottom = scroller.scrollTop + scroller.clientHeight;
    if (bottom >= scroller.scrollHeight - scroller.clientHeight / 2) {
      this.height = Math.max(
        this.height,
        scroller.scrollHeight + scroller.clientHeight,
      );
      this.apply();
    }
  }
  private apply(): void {
    this.content?.setCssProps({ "--eink-paper-height": `${this.height}px` });
  }
  private detach(): void {
    this.content?.removeClass("eink-scroll-paper");
    this.content?.style.removeProperty("--eink-paper-height");
    this.content = null;
    this.height = 0;
  }
}
