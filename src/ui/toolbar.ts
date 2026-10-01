import { Component, setIcon } from "obsidian";
import {
  COLORS,
  DRAWING_TYPES,
  ERASER_TYPES,
  newPen,
  type Pen,
} from "../drawing/model";
import type { InkStore } from "../storage";

export type Tool = "pen" | "eraser" | "hand";
export interface ToolbarActions {
  select(tool: Tool): void;
  undo(): void;
  redo(): void;
  close(): void;
  ruling(): void;
}
export class InkToolbar extends Component {
  readonly element: HTMLElement;
  tool: Tool = "pen";
  private row: HTMLElement;
  private panel: HTMLElement;
  private buttons = new Component();
  private controls = new Component();
  private dropdown: string | null = null;
  private undoButton!: HTMLButtonElement;
  private redoButton!: HTMLButtonElement;
  private rulingButton!: HTMLButtonElement;
  private canUndo = false;
  private canRedo = false;
  constructor(
    parent: HTMLElement,
    private store: InkStore,
    private actions: ToolbarActions,
  ) {
    super();
    this.element = parent.createDiv({
      cls: "eink-toolbar",
      attr: { role: "toolbar", "aria-label": "Drawing tools" },
    });
    this.row = this.element.createDiv({ cls: "eink-toolbar-row" });
    this.panel = this.element.createDiv({ cls: "eink-panel" });
    this.addChild(this.buttons);
    this.addChild(this.controls);
  }
  onload(): void {
    this.render();
    this.reposition();
    this.register(() => this.element.remove());
    this.registerDomEvent(this.element, "keydown", (event) => {
      if (event.key === "Escape") {
        this.dropdown = null;
        this.renderPanel();
        event.stopPropagation();
      }
    });
  }
  get pen(): Pen {
    return (
      this.store.settings.pens.find(
        (pen) => pen.id === this.store.settings.selectedPen,
      ) ?? this.store.settings.pens[0]!
    );
  }
  private button(
    icon: string,
    label: string,
    action: () => void,
  ): HTMLButtonElement {
    const button = this.row.createEl("button", {
      attr: { "aria-label": label, title: label, type: "button" },
    });
    setIcon(button, icon);
    this.buttons.registerDomEvent(button, "click", action);
    return button;
  }
  private render(): void {
    this.buttons.unload();
    this.buttons.load();
    this.row.empty();
    const handle = this.button(
      "grip-vertical",
      "Move toolbar (drag or arrow keys)",
      () => {},
    );
    handle.addClass("eink-drag-handle");
    this.installDrag(handle);
    const add = this.button("plus", "Add pen", () => {
      const pen = newPen();
      this.store.settings.pens.push(pen);
      this.store.settings.selectedPen = pen.id;
      this.tool = "pen";
      this.dropdown = pen.id;
      this.actions.select("pen");
      this.render();
      void this.store.save();
    });
    setIcon(add.createSpan(), "pen-tool");
    for (const [index, pen] of this.store.settings.pens.entries()) {
      const selected = this.tool === "pen" && pen.id === this.pen.id;
      const button = this.button(
        "pen-tool",
        `Pen ${index + 1}: ${pen.type}, ${pen.width} mm`,
        () => {
          this.dropdown = selected && this.dropdown !== pen.id ? pen.id : null;
          this.store.settings.selectedPen = pen.id;
          this.tool = "pen";
          this.actions.select("pen");
          this.render();
          void this.store.save();
        },
      );
      button.setCssProps({ "--eink-pen-color": pen.color });
      button.addClass("eink-pen-button");
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-expanded", String(this.dropdown === pen.id));
    }
    const eraser = this.button("eraser", "Eraser", () => {
      this.dropdown =
        this.tool === "eraser" && this.dropdown !== "eraser" ? "eraser" : null;
      this.tool = "eraser";
      this.actions.select("eraser");
      this.render();
    });
    eraser.setAttribute("aria-pressed", String(this.tool === "eraser"));
    eraser.setAttribute("aria-expanded", String(this.dropdown === "eraser"));
    const hand = this.button("hand", "Navigate and edit note", () => {
      this.tool = "hand";
      this.dropdown = null;
      this.actions.select("hand");
      this.render();
    });
    hand.setAttribute("aria-pressed", String(this.tool === "hand"));
    this.undoButton = this.button("undo-2", "Undo ink", () =>
      this.actions.undo(),
    );
    this.redoButton = this.button("redo-2", "Redo ink", () =>
      this.actions.redo(),
    );
    this.rulingButton = this.button(
      "notebook-pen",
      "Toggle ruled lines",
      () => {
        this.store.settings.ruledLines = !this.store.settings.ruledLines;
        this.syncRuling();
        this.actions.ruling();
        void this.store.save();
      },
    );
    this.syncRuling();
    this.button("x", "Close drawing toolbar", () => this.actions.close());
    this.history(this.canUndo, this.canRedo);
    this.renderPanel();
    this.reposition();
  }
  syncRuling(): void {
    this.rulingButton?.setAttribute(
      "aria-pressed",
      String(this.store.settings.ruledLines),
    );
  }
  history(undo: boolean, redo: boolean): void {
    this.canUndo = undo;
    this.canRedo = redo;
    if (this.undoButton) this.undoButton.disabled = !undo;
    if (this.redoButton) this.redoButton.disabled = !redo;
  }
  private range(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    changed: (value: number) => void,
  ): void {
    const wrapper = this.panel.createEl("label", { cls: "eink-control" });
    const text = wrapper.createSpan({ text: `${label}: ${value}${unit}` });
    if (unit === " mm")
      wrapper.createDiv({
        cls: "eink-width-taper",
        attr: { "aria-hidden": "true" },
      });
    const input = wrapper.createEl("input", {
      type: "range",
      attr: {
        min: String(min),
        max: String(max),
        step: String(step),
        "aria-label": label,
      },
    });
    input.value = String(value);
    const preview =
      unit === " mm" ? wrapper.createDiv({ cls: "eink-width-preview" }) : null;
    preview?.setCssProps({ height: `${value}mm` });
    this.controls.registerDomEvent(input, "input", () => {
      const value = Number(input.value);
      text.setText(`${label}: ${value}${unit}`);
      preview?.setCssProps({ height: `${value}mm` });
      changed(value);
    });
    this.controls.registerDomEvent(input, "change", () => {
      void this.store.save();
    });
  }
  private choices(
    label: string,
    values: readonly string[],
    value: string,
    changed: (value: string) => void,
  ): void {
    const wrapper = this.panel.createEl("label", {
      cls: "eink-control",
      text: label,
    });
    const select = wrapper.createEl("select", {
      attr: { "aria-label": label },
    });
    for (const option of values)
      select.createEl("option", { value: option, text: option });
    select.value = value;
    this.controls.registerDomEvent(select, "change", () => {
      changed(select.value);
      void this.store.save();
    });
  }
  private renderPanel(): void {
    this.controls.unload();
    this.controls.load();
    this.panel.empty();
    this.panel.hidden = this.dropdown === null;
    if (!this.dropdown) return;
    if (this.dropdown === "eraser") {
      this.range(
        "Eraser width",
        this.store.settings.eraserWidth,
        0.1,
        4,
        0.05,
        " mm",
        (value) => {
          this.store.settings.eraserWidth = value;
        },
      );
      this.choices(
        "Eraser type",
        ERASER_TYPES,
        this.store.settings.eraserType,
        (value) => {
          this.store.settings.eraserType =
            ERASER_TYPES.find((type) => type === value) ?? "Pixel";
        },
      );
      this.panel.createEl("p", {
        text: "Lasso removes strokes inside or crossing the loop.",
      });
      return;
    }
    const pen = this.pen;
    this.range("Pen width", pen.width, 0.1, 4, 0.05, " mm", (value) => {
      pen.width = value;
    });
    const colors = this.panel.createDiv({
      cls: "eink-colors",
      attr: { role: "group", "aria-label": "Pen color" },
    });
    for (const [name, color] of COLORS) {
      const button = colors.createEl("button", {
        cls: "eink-color",
        attr: {
          type: "button",
          "aria-label": name,
          title: name,
          "aria-pressed": String(pen.color === color),
        },
      });
      button.setCssProps({ "--eink-swatch": color });
      this.controls.registerDomEvent(button, "click", () => {
        pen.color = color;
        this.render();
        void this.store.save();
      });
    }
    this.range(
      "Pressure sensitivity",
      pen.pressure,
      0,
      100,
      1,
      "%",
      (value) => {
        pen.pressure = value;
      },
    );
    this.choices("Drawing type", DRAWING_TYPES, pen.type, (value) => {
      pen.type = DRAWING_TYPES.find((type) => type === value) ?? "Pen";
    });
  }
  reposition(): void {
    const parent = this.element.parentElement;
    if (!parent) return;
    this.element.setCssProps({
      "--eink-panel-height": `${Math.max(40, parent.clientHeight - this.row.offsetHeight - 12)}px`,
    });
    const x = Math.max(
      0,
      Math.min(
        this.store.settings.toolbarX,
        parent.clientWidth -
          Math.ceil(this.element.getBoundingClientRect().width),
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        this.store.settings.toolbarY,
        parent.clientHeight -
          Math.ceil(this.element.getBoundingClientRect().height),
      ),
    );
    this.element.setCssProps({ left: `${x}px`, top: `${y}px` });
  }
  private installDrag(handle: HTMLElement): void {
    let drag: {
      id: number;
      x: number;
      y: number;
      left: number;
      top: number;
    } | null = null;
    this.buttons.registerDomEvent(handle, "pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: this.element.offsetLeft,
        top: this.element.offsetTop,
      };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    this.buttons.registerDomEvent(handle, "pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      this.store.settings.toolbarX = Math.max(
        0,
        drag.left + event.clientX - drag.x,
      );
      this.store.settings.toolbarY = Math.max(
        0,
        drag.top + event.clientY - drag.y,
      );
      this.reposition();
    });
    const finish = (): void => {
      if (drag) {
        drag = null;
        void this.store.save();
      }
    };
    this.buttons.registerDomEvent(handle, "pointerup", finish);
    this.buttons.registerDomEvent(handle, "pointercancel", finish);
    this.buttons.registerDomEvent(handle, "lostpointercapture", finish);
    this.buttons.registerDomEvent(handle, "keydown", (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      this.store.settings.toolbarX =
        this.element.offsetLeft +
        (event.key === "ArrowRight" ? 10 : event.key === "ArrowLeft" ? -10 : 0);
      this.store.settings.toolbarY =
        this.element.offsetTop +
        (event.key === "ArrowDown" ? 10 : event.key === "ArrowUp" ? -10 : 0);
      this.reposition();
      void this.store.save();
    });
  }
}
