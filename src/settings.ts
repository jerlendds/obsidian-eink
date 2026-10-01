import { App, PluginSettingTab, Setting } from "obsidian";
import type EinkPlugin from "./main";
import { DEFAULT_SCRIBBLE_ACCELERATION } from "./drawing/scribble";
import {
  clamp,
  DRAWING_TYPES,
  ERASER_TYPES,
  newPen,
  type Pen,
  type EraserType,
} from "./drawing/model";

export interface EinkSettings {
  pens: Pen[];
  selectedPen: string;
  eraserWidth: number;
  eraserType: EraserType;
  ruledLines: boolean;
  drawWithTouch: boolean;
  circleLasso: boolean;
  scribbleErase: boolean;
  scribbleAcceleration: number;
  verticalToolbar: boolean;
  toolbarX: number;
  toolbarY: number;
}
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function numeric(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}
export function normalizePen(value: unknown): Pen {
  const data = record(value),
    fallback = newPen();
  return {
    id: typeof data.id === "string" && data.id ? data.id : fallback.id,
    width: numeric(data.width, 1.75, 0.1, 4),
    color:
      typeof data.color === "string" && /^#[\da-f]{6}$/i.test(data.color)
        ? data.color
        : "#000000",
    pressure: numeric(data.pressure, 30, 0, 100),
    type: DRAWING_TYPES.find((type) => type === data.type) ?? "Pen",
  };
}
export function normalizeSettings(value: unknown): EinkSettings {
  const data = record(value);
  const pens =
    Array.isArray(data.pens) && data.pens.length
      ? data.pens.map(normalizePen)
      : [newPen()];
  const ids = new Set<string>();
  for (const pen of pens) {
    if (ids.has(pen.id)) pen.id = newPen().id;
    ids.add(pen.id);
  }
  return {
    pens,
    selectedPen:
      pens.find((pen) => pen.id === data.selectedPen)?.id ?? pens[0]!.id,
    eraserWidth: numeric(data.eraserWidth, 1.75, 0.1, 4),
    eraserType:
      ERASER_TYPES.find((type) => type === data.eraserType) ?? "Pixel",
    ruledLines: data.ruledLines === true,
    drawWithTouch: data.drawWithTouch === true,
    circleLasso: data.circleLasso !== false,
    scribbleErase: data.scribbleErase !== false,
    scribbleAcceleration: numeric(
      data.scribbleAcceleration,
      DEFAULT_SCRIBBLE_ACCELERATION,
      5000,
      100000,
    ),
    verticalToolbar: data.verticalToolbar === true,
    toolbarX: numeric(data.toolbarX, 16, 0, 10000),
    toolbarY: numeric(data.toolbarY, 16, 0, 10000),
  };
}
export class EinkSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: EinkPlugin,
  ) {
    super(app, plugin);
  }
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Ruled lines")
      .setDesc(
        "Show thin black writing guides spaced to the note’s text line height. Updates when the font size changes.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.store.settings.ruledLines)
          .onChange(async (value) => {
            this.plugin.store.settings.ruledLines = value;
            this.plugin.controller.refreshInk();
            await this.plugin.store.save();
          }),
      );
    new Setting(this.containerEl)
      .setName("Draw with touch")
      .setDesc(
        "Allow drawing with one finger. Scrolling always requires two fingers while the toolbar is open.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.store.settings.drawWithTouch)
          .onChange(async (value) => {
            this.plugin.store.settings.drawWithTouch = value;
            await this.plugin.store.save();
          }),
      );
    new Setting(this.containerEl)
      .setName("Circle to select")
      .setDesc(
        "Draw a closed shape around ink and hold the endpoint for 1.5 seconds to select. Undo restores the shape as ink.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.store.settings.circleLasso)
          .onChange(async (value) => {
            this.plugin.store.settings.circleLasso = value;
            await this.plugin.store.save();
          }),
      );
    new Setting(this.containerEl)
      .setName("Scribble to erase")
      .setDesc(
        "Quickly scribble back and forth over old ink, then lift to erase whole crossed strokes. Undo restores them.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.store.settings.scribbleErase)
          .onChange(async (value) => {
            this.plugin.store.settings.scribbleErase = value;
            await this.plugin.store.save();
          }),
      );
    new Setting(this.containerEl)
      .setName("Scribble acceleration")
      .setDesc(
        "Minimum acceleration in pixels per second squared. Higher values require a sharper scribble and reduce accidental erasing. Default: 15000.",
      )
      .addSlider((slider) =>
        slider
          .setLimits(5000, 100000, 5000)
          .setValue(this.plugin.store.settings.scribbleAcceleration)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.store.settings.scribbleAcceleration = value;
            await this.plugin.store.save();
          }),
      );
    new Setting(this.containerEl)
      .setName("Vertical toolbar")
      .setDesc("Arrange drawing tools in a vertical bar.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.store.settings.verticalToolbar)
          .onChange(async (value) => {
            this.plugin.store.settings.verticalToolbar = value;
            this.plugin.controller.reposition();
            await this.plugin.store.save();
          }),
      );
    new Setting(this.containerEl)
      .setName("Toolbar position")
      .setDesc("Return the toolbar to the top left of the page.")
      .addButton((button) =>
        button.setButtonText("Reset position").onClick(async () => {
          this.plugin.store.settings.toolbarX = 16;
          this.plugin.store.settings.toolbarY = 16;
          this.plugin.controller.reposition();
          await this.plugin.store.save();
        }),
      );
  }
}
