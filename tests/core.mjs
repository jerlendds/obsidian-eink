import "./lasso.mjs";
import "./scribble.mjs";
import "./ocr.mjs";
import assert from "node:assert/strict";
import { DrawingHistory, newPen, widthAt } from "../src/drawing/model.ts";
import { lassoHits, touchesStroke } from "../src/drawing/geometry.ts";
import { normalizeSettings } from "../src/settings.ts";
import { InkStore } from "../src/storage.ts";

const point = (x, y, pressure = 0.5) => ({ x, y, pressure });
const stroke = {
  id: "one",
  tool: "pen",
  pen: newPen(),
  points: [point(0, 50), point(100, 50)],
};
const history = new DrawingHistory();
assert.equal(history.undo(), false);
history.commit([stroke]);
assert.equal(history.canUndo, true);
history.undo();
assert.equal(history.strokes.length, 0);
history.redo();
assert.equal(history.strokes[0], stroke);
history.undo();
history.commit([{ ...stroke, id: "two" }]);
assert.equal(history.canRedo, false);
assert.equal(history.commit(history.strokes.slice()), false);
assert.equal(
  touchesStroke(stroke, [point(50, 0), point(50, 100)], 1),
  true,
  "Sparse crossing segments erase",
);
assert.equal(touchesStroke(stroke, [point(200, 0)], 1), false);
assert.equal(
  lassoHits(stroke, [
    point(40, 40),
    point(60, 40),
    point(60, 60),
    point(40, 60),
  ]),
  true,
  "Lasso crossing without contained samples",
);
assert.equal(
  lassoHits(stroke, [point(140, 40), point(160, 40), point(160, 60)]),
  false,
);
assert.equal(lassoHits(stroke, [point(10, 10)]), false);
assert(
  widthAt(stroke.pen, point(0, 0, 1)) > widthAt(stroke.pen, point(0, 0, 0.1)),
);
assert.equal(
  widthAt({ ...stroke.pen, pressure: 0 }, point(0, 0, 0.1)),
  widthAt({ ...stroke.pen, pressure: 0 }, point(0, 0, 1)),
);
const defaults = normalizeSettings(null);
assert.equal(defaults.ruledLines, false);
assert.equal(normalizeSettings({ ruledLines: true }).ruledLines, true);
assert.equal(normalizeSettings({ ruledLines: "yes" }).ruledLines, false);
assert.equal(defaults.pens[0].width, 1.75);
assert.equal(defaults.pens[0].pressure, 30);
assert.equal(defaults.eraserType, "Pixel");
const invalid = normalizeSettings({
  pens: [
    { id: "a", width: Infinity, color: "url(evil)", type: "unknown" },
    { id: "a", width: 100 },
  ],
  eraserWidth: -1,
});
assert.equal(invalid.pens[0].width, 1.75);
assert.equal(invalid.pens[1].width, 4);
assert.notEqual(invalid.pens[0].id, invalid.pens[1].id);
assert.equal(invalid.pens[0].color, "#000000");
assert.equal(invalid.eraserWidth, 0.1);
let disk = null,
  active = 0,
  maxActive = 0;
const plugin = {
  loadData: async () => disk,
  saveData: async (data) => {
    active++;
    maxActive = Math.max(active, maxActive);
    await new Promise((resolve) => setTimeout(resolve, 5));
    disk = structuredClone(data);
    active--;
  },
};
const store = new InkStore(plugin);
await store.load();
const note = store.history("Folder/Note.md");
note.commit([stroke]);
await Promise.all([
  store.changed("Folder/Note.md", note),
  store.save(),
  store.save(),
]);
assert.equal(maxActive, 1, "Saves are serialized");
await store.rename("Folder", "Moved");
assert.equal(store.history("Moved/Note.md"), note);
const reloaded = new InkStore(plugin);
await reloaded.load();
assert.deepEqual(reloaded.history("Moved/Note.md").strokes, [stroke]);
assert.equal(reloaded.history("Folder/Note.md").strokes.length, 0);
await reloaded.delete("Moved");
const deleted = new InkStore(plugin);
await deleted.load();
assert.equal(deleted.history("Moved/Note.md").strokes.length, 0);
console.log(
  "Core: history, eraser geometry, pressure, validation, persistence, rename/delete passed.",
);
