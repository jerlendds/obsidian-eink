import { Notice, type Plugin } from "obsidian";
import { DrawingHistory, type Point, type Stroke } from "./drawing/model";
import {
  normalizePen,
  normalizeSettings,
  record,
  type EinkSettings,
} from "./settings";

function readStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const data = record(entry);
    if (
      typeof data.id !== "string" ||
      !Array.isArray(data.points) ||
      !["pen", "eraser"].includes(String(data.tool))
    )
      return [];
    const points: Point[] = data.points.flatMap((entry: unknown) => {
      const point = record(entry);
      if (
        typeof point.x !== "number" ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      )
        return [];
      return [
        {
          x: point.x,
          y: point.y,
          pressure:
            typeof point.pressure === "number" &&
            Number.isFinite(point.pressure)
              ? Math.max(0, Math.min(1, point.pressure))
              : 0.5,
        },
      ];
    });
    return points.length
      ? [
          {
            id: data.id,
            tool: data.tool as Stroke["tool"],
            pen: normalizePen(data.pen),
            points,
          },
        ]
      : [];
  });
}
export class InkStore {
  settings: EinkSettings = normalizeSettings(null);
  private documents = new Map<string, Stroke[]>();
  private histories = new Map<string, DrawingHistory>();
  private saving: Promise<void> = Promise.resolve();
  constructor(private plugin: Plugin) {}
  async load(): Promise<void> {
    const data = record(await this.plugin.loadData());
    this.settings = normalizeSettings(data.settings);
    for (const [path, strokes] of Object.entries(record(data.drawings)))
      this.documents.set(path, readStrokes(strokes));
  }
  history(path: string): DrawingHistory {
    let history = this.histories.get(path);
    if (!history) {
      history = new DrawingHistory(this.documents.get(path) ?? []);
      this.histories.set(path, history);
    }
    return history;
  }
  async changed(path: string, history: DrawingHistory): Promise<void> {
    this.documents.set(path, history.strokes);
    await this.save();
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    for (const path of [...this.documents.keys()]) {
      if (path !== oldPath && !path.startsWith(`${oldPath}/`)) continue;
      const target = newPath + path.slice(oldPath.length);
      this.documents.set(target, this.documents.get(path)!);
      this.documents.delete(path);
      const history = this.histories.get(path);
      if (history) {
        this.histories.set(target, history);
        this.histories.delete(path);
      }
    }
    await this.save();
  }
  async delete(path: string): Promise<void> {
    for (const key of new Set([
      ...this.documents.keys(),
      ...this.histories.keys(),
    ])) {
      if (key === path || key.startsWith(`${path}/`)) {
        this.documents.delete(key);
        this.histories.delete(key);
      }
    }
    await this.save();
  }
  async save(): Promise<void> {
    // Serialize writes; a slower earlier save must never overwrite a newer drawing.
    this.saving = this.saving
      .then(async () => {
        await this.plugin.saveData({
          version: 1,
          settings: normalizeSettings(this.settings),
          drawings: Object.fromEntries(this.documents),
        });
      })
      .catch((error: unknown) => {
        console.error("Unable to save ink", error);
        new Notice(
          "Could not save ink. Check vault storage; changes remain in memory until the plugin closes.",
        );
      });
    await this.saving;
  }
}
