import { Component } from "obsidian";

/** A separate page-anchored guide layer, so pixel erasing cannot erase the rules. */
export class RuledLines extends Component {
  readonly element: HTMLElement;
  private frame = 0;
  private sample: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  constructor(
    private host: HTMLElement,
    private scroller: () => HTMLElement,
    private enabled: () => boolean,
  ) {
    super();
    this.element = host.createDiv({
      cls: "eink-ruled-lines",
      attr: { "aria-hidden": "true" },
    });
    this.element.hidden = true;
  }
  onload(): void {
    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.target.nodeType !== 1 ||
            !(record.target as Element).closest(".eink-surface"),
        )
      )
        this.refresh();
    });
    mutations.observe(this.host.parentElement!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    mutations.observe(this.host.ownerDocument.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    mutations.observe(this.host.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    this.resizeObserver = new ResizeObserver(() => this.refresh());
    this.register(() => {
      mutations.disconnect();
      this.resizeObserver?.disconnect();
      this.host.win.cancelAnimationFrame(this.frame);
      this.element.remove();
    });
    this.refresh();
  }
  refresh(): void {
    if (this.frame) return;
    this.frame = this.host.win.requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  }
  private update(): void {
    this.element.hidden = !this.enabled();
    if (!this.enabled()) return;
    const scroller = this.scroller();
    const content =
      scroller.querySelector<HTMLElement>(
        ".cm-content, .markdown-preview-sizer",
      ) ?? scroller;
    const sample =
      content.querySelector<HTMLElement>(".cm-line:not(.HyperMD-header), p") ??
      content;
    if (sample !== this.sample) {
      this.resizeObserver?.disconnect();
      this.resizeObserver?.observe(sample);
      this.sample = sample;
    }
    const win = this.host.win,
      style = win.getComputedStyle(sample);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const spacing = Math.max(
      1,
      Number.parseFloat(style.lineHeight) || fontSize * 1.5,
    );
    const rect = scroller.getBoundingClientRect(),
      hostRect = this.host.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const padding =
      Number.parseFloat(win.getComputedStyle(content).paddingTop) || 0;
    const origin =
      contentRect.top -
      rect.top -
      scroller.clientTop +
      scroller.scrollTop +
      padding;
    const phase =
      (((origin - scroller.scrollTop) % spacing) + spacing) % spacing;
    this.element.setCssProps({
      left: `${rect.left - hostRect.left + scroller.clientLeft}px`,
      top: `${rect.top - hostRect.top + scroller.clientTop}px`,
      width: `${scroller.clientWidth}px`,
      height: `${scroller.clientHeight}px`,
      "--eink-rule-spacing": `${spacing}px`,
      "--eink-rule-offset": `${phase}px`,
    });
  }
}
