import type { Stroke } from "../drawing/model";
import { splitLines } from "./lines";
import { recognizeLine } from "./recognizer";

/** Recognize selected ink line by line, yielding between lines so the UI stays responsive. */
export async function recognizeInk(strokes: Stroke[], window: Window): Promise<{ text: string; top: number }> {
  const pen = strokes.filter((stroke) => stroke.tool === "pen");
  let top = Infinity;
  for (const stroke of pen) for (const point of stroke.points) top = Math.min(top, point.y);
  const lines: string[] = [];
  for (const line of splitLines(pen)) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const text = recognizeLine(line.map((stroke) => stroke.points)).trim();
    if (text) lines.push(text);
  }
  return { text: lines.join("\n"), top };
}
