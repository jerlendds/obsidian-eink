import assert from "node:assert/strict";
import { isQuickCircle, lassoSelection } from "../src/drawing/lasso.ts";
import { newPen } from "../src/drawing/model.ts";
import { normalizeSettings } from "../src/settings.ts";
const circle = (duration = 400, direction = 1, radius = 60) =>
  Array.from({ length: 33 }, (_, i) => {
    const angle = ((direction * i) / 32) * 2 * Math.PI;
    return {
      x: 200 + Math.cos(angle) * radius,
      y: 200 + Math.sin(angle) * radius,
      time: (i / 32) * duration,
      pressure: 0.5,
    };
  });
assert(isQuickCircle(circle()), "Fast closed circle selects");
assert(isQuickCircle(circle(400, -1)), "Both directions select");
assert(
  isQuickCircle(circle().map((p) => ({ ...p, x: 200 + (p.x - 200) * 2 }))),
  "Elliptical loops select",
);
assert(!isQuickCircle(circle(1800)), "Slow circle remains ink");
assert(!isQuickCircle(circle(400, 1, 6)), "Small handwriting loops remain ink");
assert(!isQuickCircle(circle().slice(0, 25)), "Open arc remains ink");
assert(
  !isQuickCircle(circle().map((p) => ({ ...p, time: 0 }))),
  "Zero timestamp interval rejected",
);
assert(
  !isQuickCircle(circle().map((p) => ({ ...p, time: -p.time }))),
  "Reversed timestamps rejected",
);
assert(
  !isQuickCircle(circle().map((p) => ({ ...p, x: NaN }))),
  "Malformed points rejected",
);
assert(
  !isQuickCircle(
    Array.from({ length: 33 }, (_, i) => ({
      x: (i % 2) * 80,
      y: i,
      time: i * 10,
      pressure: 0.5,
    })),
  ),
  "Scribble is not a circle",
);
const makeStroke = (id, points, tool = "pen") => ({
  id,
  points,
  tool,
  pen: newPen(),
});
const inside = makeStroke("inside", [{ x: 200, y: 200, pressure: 0.5 }]);
const crossing = makeStroke("crossing", [
  { x: 100, y: 200, pressure: 0.5 },
  { x: 300, y: 200, pressure: 0.5 },
]);
const outside = makeStroke("outside", [{ x: 500, y: 500, pressure: 0.5 }]);
const eraser = { ...inside, id: "mask", tool: "eraser" };
assert.deepEqual(
  [...lassoSelection([inside, crossing, outside, eraser], circle())],
  ["inside", "crossing"],
);
assert.equal(normalizeSettings({}).circleLasso, true);
assert.equal(normalizeSettings({ circleLasso: false }).circleLasso, false);
console.log(
  "Lasso: quick closed loops, slow/open/tiny rejection, both directions, and ink-only selection passed.",
);
