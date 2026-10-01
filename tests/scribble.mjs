import assert from "node:assert/strict";
import {
  isEraseScribble,
  eraseScribbledStrokes,
  DEFAULT_SCRIBBLE_ACCELERATION,
} from "../src/drawing/scribble.ts";
import { newPen, DrawingHistory } from "../src/drawing/model.ts";
import { normalizeSettings } from "../src/settings.ts";
const point = (x, y, time) => ({ x, y, time, pressure: 0.5 });
const zigzag = (step = 50) =>
  [0, 40, 0, 40, 0].map((x, i) => point(x, 0, i * step));
const classify = (points) =>
  isEraseScribble(points, DEFAULT_SCRIBBLE_ACCELERATION);
const fast = zigzag();
assert(classify(fast), "Fast repeated reversals qualify");
assert(!classify(zigzag(200)), "Slow repeated reversals remain ink");
for (const reversals of [3, 4, 5, 6, 9, 20, 40, 100]) {
  const extended = Array.from({ length: reversals + 2 }, (_, i) =>
    point((i % 2) * 40, 0, i * 50),
  );
  assert(
    classify(extended),
    `${reversals} reversals erase, whether ending on the near or far side`,
  );
  assert(
    !classify(extended.map((p) => ({ ...p, time: p.time * 4 }))),
    "More slow passes do not bypass acceleration",
  );
}
assert(
  classify([...fast, point(0, 0, 5000)]),
  "Holding after a qualifying scribble does not invalidate it",
);
const slowStart = zigzag(400);
assert(
  classify([
    ...slowStart,
    ...fast.slice(1).map((p) => ({ ...p, time: p.time + 1600 })),
  ]),
  "A later fast run qualifies after a slow start",
);

assert(
  !isEraseScribble(fast, 40000),
  "Acceleration threshold can reject the same shape",
);
assert(classify(fast.map((p) => point(0, p.x, p.time))), "Vertical scribble");
assert(
  classify(
    fast.map((p) => point(p.x / Math.sqrt(2), p.x / Math.sqrt(2), p.time)),
  ),
  "Diagonal scribble",
);
assert(
  !classify([0, 40, 80, 120, 160].map((x, i) => point(x, 0, i * 50))),
  "Fast straight strokes remain ink",
);
assert(!classify(fast.slice(0, 3)), "A single reversal remains ink");
assert(
  !classify(fast.map((p, i) => point(i * 20, p.x, p.time))),
  "A progressing zigzag/word remains ink",
);
assert(
  !classify(fast.map((p) => point(p.x / 20, 0, p.time))),
  "Tiny jitter remains ink",
);
assert(!classify(zigzag(1)), "Implausibly brief spike is rejected");
assert(
  !classify(fast.map((p) => ({ ...p, time: 0 }))),
  "Zero-time samples do not imply infinite acceleration",
);
assert(
  !classify(fast.map((p) => ({ ...p, time: -p.time }))),
  "Backwards timestamps rejected",
);
assert(
  !classify([...fast, point(Infinity, 0, 300)]),
  "Nonfinite coordinates rejected",
);
assert(!isEraseScribble(fast, NaN));
const dense = [];
for (let i = 0; i < fast.length - 1; i++) {
  for (let step = 0; step < 10; step++) {
    const a = fast[i],
      b = fast[i + 1],
      t = step / 10;
    dense.push(point(a.x + (b.x - a.x) * t, 0, a.time + (b.time - a.time) * t));
  }
}
dense.push(fast.at(-1));
assert.equal(
  classify(dense),
  classify(fast),
  "Coalesced high-rate input matches sparse input",
);
assert(
  classify([...fast, point(0, 0, 400)]),
  "Brief stationary hold does not change reversal acceleration",
);
const stroke = (id, x) => ({
  id,
  tool: "pen",
  pen: newPen(),
  points: [point(x, -10, 0), point(x, 10, 1)],
});
const left = stroke("left", 10),
  right = stroke("right", 30),
  away = stroke("away", 100);
const mask = { ...stroke("mask", 20), tool: "eraser" };
const scribble = { ...stroke("scratch", 0), points: fast };
const history = new DrawingHistory([left, right, away, mask]);
const erased = eraseScribbledStrokes(history.strokes, scribble);
assert.deepEqual(
  erased,
  [away, mask],
  "Erase all crossed old ink, retaining distant ink and pixel masks",
);
history.commit(erased);
history.undo();
assert.deepEqual(
  history.strokes,
  [left, right, away, mask],
  "Undo restores all erased strokes in one step",
);
history.redo();
assert.deepEqual(history.strokes, [away, mask]);
assert.equal(
  normalizeSettings({}).scribbleAcceleration,
  DEFAULT_SCRIBBLE_ACCELERATION,
);
assert.equal(normalizeSettings({}).scribbleErase, true);
assert.equal(normalizeSettings({ scribbleErase: false }).scribbleErase, false);
assert.equal(
  normalizeSettings({ scribbleAcceleration: Infinity }).scribbleAcceleration,
  DEFAULT_SCRIBBLE_ACCELERATION,
);
assert.equal(
  normalizeSettings({ scribbleAcceleration: -1 }).scribbleAcceleration,
  5000,
);
console.log(
  "Scribble: acceleration, reversals, false positives, input sampling, settings, and undo/redo passed.",
);
