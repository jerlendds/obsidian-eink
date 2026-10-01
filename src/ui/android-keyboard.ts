import { Component, Platform } from "obsidian";

const TEXT_FIELDS = '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="number"], input[type="password"]';

/** Keep Android's soft keyboard out of the note while the drawing toolbar is open. */
export class AndroidKeyboardGuard extends Component {
  private enabled = false;
  private originals = new Map<HTMLElement, string | null>();
  private observer: MutationObserver | null = null;

  constructor(private host: HTMLElement) {
    super();
  }
  onload(): void {
    this.registerDomEvent(this.host, "focusin", (event) => {
      if (!this.enabled) return;
      const target = event.target as HTMLElement;
      if (this.isNoteField(target)) {
        this.suppress(target);
        target.blur();
      }
    }, true);
    this.register(() => this.setEnabled(false));
  }
  setEnabled(visible: boolean): void {
    const enabled = visible && Platform.isAndroidApp;
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.observer?.disconnect();
      this.observer = null;
      for (const [element, original] of this.originals) this.restore(element, original);
      this.originals.clear();
      return;
    }
    this.refresh();
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(this.host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["inputmode", "contenteditable", "type"],
    });
    const focused = this.host.ownerDocument.activeElement as HTMLElement | null;
    if (focused && this.host.contains(focused) && this.isNoteField(focused)) focused.blur();
  }
  private isNoteField(element: HTMLElement): boolean {
    return element.matches(TEXT_FIELDS) && !element.closest(".eink-surface");
  }
  private suppress(element: HTMLElement): void {
    if (!this.originals.has(element)) this.originals.set(element, element.getAttribute("inputmode"));
    if (element.getAttribute("inputmode") !== "none") element.setAttribute("inputmode", "none");
  }
  private restore(element: HTMLElement, original: string | null): void {
    if (element.getAttribute("inputmode") !== "none") return;
    if (original === null) element.removeAttribute("inputmode");
    else element.setAttribute("inputmode", original);
  }
  private refresh(): void {
    for (const [element, original] of this.originals) {
      if (!this.host.contains(element) || !this.isNoteField(element)) {
        this.restore(element, original);
        this.originals.delete(element);
      }
    }
    for (const element of Array.from(this.host.querySelectorAll<HTMLElement>(TEXT_FIELDS))) {
      if (this.isNoteField(element)) this.suppress(element);
    }
  }
}
