export const DRAWING_TYPES = [
  "Pen",
  "Calligraphy",
  "Fountain",
  "Brush",
  "Ballpoint",
  "Pencil",
  "Marker",
] as const;
export const ERASER_TYPES = ["Pixel", "Stroke", "Lasso"] as const;
export type DrawingType = (typeof DRAWING_TYPES)[number];
export type EraserType = (typeof ERASER_TYPES)[number];
export interface Pen {
  id: string;
  width: number;
  color: string;
  pressure: number;
  type: DrawingType;
}
export interface Point {
  x: number;
  y: number;
  pressure: number;
}
export interface Stroke {
  id: string;
  tool: "pen" | "eraser";
  pen: Pen;
  points: Point[];
}
export const MM_TO_PX = 96 / 25.4;
export const COLORS = [
  ["Red", "#ff0000"],
  ["Black", "#000000"],
  ["Green", "#008000"],
  ["Blue", "#0000ff"],
  ["Yellow", "#ffff00"],
  ["Light green", "#00ff00"],
  ["Light gray", "#bfbfbf"],
  ["Gray", "#808080"],
  ["Dark gray", "#404040"],
] as const;
export function newPen(): Pen {
  return {
    id: uniqueId(),
    width: 1.75,
    color: "#000000",
    pressure: 30,
    type: "Pen",
  };
}
export function uniqueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function widthAt(pen: Pen, point: Point): number {
  const sensitivity = pen.pressure / 100;
  const pressure = 1 - sensitivity + sensitivity * point.pressure * 2;
  const factors: Record<DrawingType, number> = {
    Pen: 1,
    Calligraphy: 1,
    Fountain: 0.85,
    Brush: 1.2,
    Ballpoint: 0.55,
    Pencil: 0.65,
    Marker: 1,
  };
  return pen.width * MM_TO_PX * pressure * factors[pen.type];
}
export class DrawingHistory {
  strokes: Stroke[];
  private past: Stroke[][] = [];
  private future: Stroke[][] = [];
  constructor(strokes: Stroke[] = []) {
    this.strokes = strokes;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  commit(strokes: Stroke[]): boolean {
    if (
      strokes.length === this.strokes.length &&
      strokes.every((stroke, i) => stroke === this.strokes[i])
    )
      return false;
    this.past.push(this.strokes);
    if (this.past.length > 100) this.past.shift();
    this.strokes = strokes;
    this.future = [];
    return true;
  }
  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.strokes);
    this.strokes = previous;
    return true;
  }
  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.strokes);
    this.strokes = next;
    return true;
  }
}
