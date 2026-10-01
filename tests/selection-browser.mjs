import { InkSurface } from "../src/ui/surface.ts";
import { InkStore } from "../src/storage.ts";
import { newPen } from "../src/drawing/model.ts";

export async function checkSelectionDrag(check, pause) {
  const host = document.body.createDiv();
  host.style.cssText = "position:relative;width:800px;height:600px";
  const scroller = host.createDiv({ cls: "markdown-preview-view" });
  scroller.createDiv({ cls: "markdown-preview-sizer" });
  let saved;
  const store = new InkStore({
    loadData: async () => null,
    saveData: async (data) => { saved = structuredClone(data); },
  });
  await store.load();
  const history = store.history("Drag.md");
  const point = (x, y) => ({ x, y, pressure: 0.4 });
  const ink = (id, points) => ({ id, points, tool: "pen", pen: newPen() });
  const original = [ink("selected", [point(100, 200), point(200, 200)]), ink("outside", [point(400, 200)])];
  history.commit(original);
  const surface = new InkSurface({ contentEl: host, getMode: () => "preview" }, "Drag.md", store, () => {});
  surface.load();
  await pause();
  const canvas = host.querySelector("canvas");
  const select = () => surface.selection.select([point(90, 180), point(210, 180), point(210, 220), point(90, 220)]);
  const touch = (type, x, y, id = 41, primary = true) => {
    const rect = scroller.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      pointerType: "touch", pointerId: id, clientX: rect.left + x, clientY: rect.top + y,
      isPrimary: primary, button: 0, bubbles: true, cancelable: true,
    }));
  };
  select();
  check(!store.settings.drawWithTouch, "Finger drawing is off during drag tests");
  touch("pointerdown", 150, 200);
  touch("pointermove", 190, 230);
  check(history.strokes === original, "Dragging previews without modifying stored ink");
  const rectangles = [];
  surface.selection.render({ save() {}, restore() {}, setLineDash() {}, fillRect() {}, strokeRect(...args) { rectangles.push(args); } });
  check(rectangles.length === 5 && rectangles[0][0] > 130 && rectangles[0][1] > 220,
    "Bounding box and four handles follow the drag preview");
  touch("pointerup", 190, 230);
  await pause();
  check(history.strokes[0].points[0].x === 140 && history.strokes[0].points[0].y === 230,
    "One finger repositions selection with finger drawing disabled");
  check(history.strokes[0].points[0].pressure === 0.4 && history.strokes[1] === original[1],
    "Movement preserves pressure and leaves unselected ink unchanged");
  check(saved.drawings["Drag.md"][0].points[0].x === 140, "Movement persists");
  check(!surface.selection.element.hidden, "Selection remains available after moving");
  surface.undo();
  check(history.strokes === original, "One undo restores the complete move");
  surface.redo();
  check(history.strokes[0].points[0].x === 140, "Redo restores the move");
  surface.undo();
  select();
  touch("pointerdown", 150, 200);
  touch("pointermove", 180, 220);
  touch("pointercancel", 180, 220);
  check(history.strokes === original && surface.selection.dragPointer === undefined,
    "Canceled dragging preserves the original ink");
  touch("pointerdown", 150, 200);
  touch("pointerup", 150, 200);
  surface.undo();
  check(history.strokes.length === 0, "Tapping a selection adds no undo step");
  surface.redo();
  select();
  touch("pointerdown", 150, 200);
  touch("pointermove", 160, 200);
  touch("pointerdown", 220, 200, 42, false);
  check(surface.selection.dragPointer === undefined, "Second finger cancels the move");
  touch("pointermove", 160, 100);
  touch("pointermove", 220, 100, 42, false);
  touch("pointerup", 160, 100);
  touch("pointerup", 220, 100, 42, false);
  check(history.strokes === original && scroller.scrollTop === 100,
    "Two fingers scroll without moving selected ink");
  touch("pointerdown", 500, 300);
  touch("pointermove", 500, 200);
  touch("pointerup", 500, 200);
  check(history.strokes === original && scroller.scrollTop === 100,
    "One finger outside the selection neither draws nor scrolls");
  scroller.scrollTop = 0;
  scroller.dispatchEvent(new Event("scroll"));
  const resizeOriginal = [ink("shape", [point(100, 200), point(200, 300)]), original[1]];
  history.commit(resizeOriginal);
  const selectShape = () => surface.selection.select([point(90, 180), point(210, 180), point(210, 320), point(90, 320)]);
  selectShape();
  const bounds = surface.selection.bounds();
  const sourceWidth = history.strokes[0].pen.width;
  touch("pointerdown", bounds.right, bounds.bottom);
  touch("pointermove", bounds.right + 100, bounds.bottom + 50);
  check(history.strokes === resizeOriginal, "Corner resizing is previewed without changing stored ink");
  const previewBounds = surface.selection.bounds();
  check(Math.abs(previewBounds.right - bounds.right - 100) < 0.001 &&
    Math.abs(previewBounds.bottom - bounds.bottom - 50) < 0.001 && previewBounds.left === bounds.left,
    "Dragged corner follows the finger while the opposite corner stays fixed");
  touch("pointerup", bounds.right + 100, bounds.bottom + 50);
  const near = (point, x, y) => Math.abs(point.x - x) < 1e-6 && Math.abs(point.y - y) < 1e-6;
  check(near(history.strokes[0].points[1], 300, 350) && near(history.strokes[0].points[0], 100, 200),
    "Corner handle resizes selected ink instead of moving it");
  check(history.strokes[1] === original[1] && history.strokes[0].pen.width === sourceWidth,
    "Resize preserves pen width and unrelated strokes");
  await pause();
  check(saved.drawings["Drag.md"][0].points[1].x === 300, "Resizing persists");
  surface.undo();
  check(history.strokes === resizeOriginal, "Resize is undone in one step");
  surface.redo();
  check(history.strokes[0].points[1].x === 300, "Resize supports redo");
  surface.undo();
  selectShape();
  touch("pointerdown", bounds.left - 6, bounds.top - 6);
  touch("pointermove", bounds.left - 46, bounds.top - 36);
  touch("pointercancel", bounds.left - 46, bounds.top - 36);
  check(history.strokes === resizeOriginal && surface.selection.dragPointer === undefined,
    "Corner handles can be grabbed outside the box and canceled without committing");
  surface.unload();
  host.remove();
}

export async function checkSelectionOcr(check, pause) {
  const fixtures = (await import("./fixtures/handwriting.json")).default;
  const host = document.body.createDiv();
  host.style.cssText = "position:relative;width:800px;height:600px";
  const scroller = host.createDiv({ cls: "markdown-preview-view" });
  const section = scroller.createDiv();
  section.style.height = "40px";
  scroller.createDiv().style.height = "2000px";
  let note = "# Notes\n\nAfter";
  const file = { path: "Ocr.md" };
  const view = {
    contentEl: host, file, getMode: () => "preview",
    previewMode: { renderer: { sections: [{ el: section, lineStart: 0, lineEnd: 0 }] } },
    app: { vault: { process: async (target, fn) => { check(target === file, "OCR edits the open note"); note = fn(note); } } },
  };
  const store = new InkStore({ loadData: async () => null, saveData: async () => {} });
  await store.load();
  const history = store.history("Ocr.md");
  // Shift the fixture line below the first rendered section.
  const ink = fixtures.trigonometry.strokes.map((points, i) => ({
    id: `t${i}`, tool: "pen", pen: newPen(), points: points.map(([x, y]) => ({ x, y: y - 1700, pressure: 0.5 })),
  }));
  const other = { id: "other", tool: "pen", pen: newPen(), points: [{ x: 600, y: 400, pressure: 0.5 }] };
  history.commit([...ink, other]);
  const surface = new InkSurface(view, "Ocr.md", store, () => {});
  surface.load();
  await pause();
  check(surface.selection.select([{ x: 0, y: 20 }, { x: 400, y: 20 }, { x: 400, y: 160 }, { x: 0, y: 160 }]),
    "Handwriting can be selected for OCR");
  const button = [...surface.selection.element.querySelectorAll("button")].find((entry) => entry.textContent === "OCR");
  check(!!button, "Selection actions include OCR");
  button.click();
  check(button.disabled, "OCR shows progress while recognizing");
  for (let i = 0; i < 50 && button.disabled; i++) await pause();
  check(note === `# Notes\n${fixtures.trigonometry.expected}\nAfter`,
    `Recognized text replaces the blank line under the ink: ${JSON.stringify(note)}`);
  check(history.strokes.length === 1 && history.strokes[0] === other && surface.selection.element.hidden,
    "OCR removes only the selected ink and clears the selection");
  surface.undo();
  check(history.strokes.length === ink.length + 1, "Undo ink restores the converted strokes");
  surface.unload();
  host.remove();
}
