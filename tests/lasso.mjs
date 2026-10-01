import assert from "node:assert/strict";
import { ClosedShapeTracker, isClosedShape, lassoSelection } from "../src/drawing/lasso.ts";
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
assert(isClosedShape(circle()), "Closed circle qualifies for holding");
assert(isClosedShape(circle(400, -1)), "Both directions select");
assert(
  isClosedShape(circle().map((p) => ({ ...p, x: 200 + (p.x - 200) * 2 }))),
  "Elliptical loops select",
);
assert(isClosedShape(circle(1800)), "Slow closed shapes also qualify");
assert(!isClosedShape(circle(400, 1, 6)), "Small handwriting loops remain ink");
assert(!isClosedShape(circle().slice(0, 25)), "Open arc remains ink");
const rough = circle().map((p, i) => ({ ...p, x: p.x + (i % 3 - 1) * 6, y: p.y + (i % 4 - 2) * 4 }));
rough[rough.length - 1] = { ...rough[0], x: rough[0].x + 22, y: rough[0].y + 20 };
assert(isClosedShape(rough), "Rough loop with an imprecise join qualifies");
const crossed = [...circle(), ...circle(400, -1).slice(1)];
assert(isClosedShape(crossed), "Overlapping opposite-direction loops do not cancel their area");

assert(isClosedShape([[0, 0], [150, 0], [150, 30], [0, 30], [0, 0]].map(([x, y]) => ({ x, y, pressure: 0.5 }))), "Noncircular closed shapes qualify");
assert(
  !isClosedShape(circle().map((p) => ({ ...p, x: NaN }))),
  "Malformed points rejected",
);
assert(
  !isClosedShape(
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
  "Lasso: closed shapes at any speed, open/tiny rejection, both directions, and ink-only selection passed.",
);

// Deterministic clock: verify hold timing and cancellation without sleeping.
const { SelectionHold } = await import("../src/ui/selection-hold.ts");
let now = 0, nextId = 0, selections = 0;
const timers = new Map();
const clock = {
  setTimeout(callback, delay) {
    const id = ++nextId;
    timers.set(id, { callback, due: now + delay });
    return id;
  },
  clearTimeout(id) { timers.delete(id); },
};
const advance = (duration) => {
  now += duration;
  for (const [id, timer] of timers) {
    if (timer.due <= now) {
      timers.delete(id);
      timer.callback();
    }
  }
};
const hold = new SelectionHold(clock, () => selections++);
hold.load();
hold.update(circle());
advance(1499);
assert.equal(selections, 0, "Must hold for a full 1.5 seconds");
hold.update(circle());
advance(1);
assert.equal(selections, 1, "Stationary events do not restart the hold");
hold.reset();
hold.update(circle());
advance(750);
const jittered = circle();
jittered.at(-1).y += 9;
hold.update(jittered);
advance(750);
assert.equal(selections, 2, "Small pen wobble does not restart a valid hold");
selections = 1;

hold.reset();
hold.update(circle());
advance(750);
const moved = circle();
moved.at(-1).y += 16;
hold.update(moved);
advance(750);
assert.equal(selections, 1, "Movement restarts the hold");
advance(750);
assert.equal(selections, 2);
hold.reset();
hold.update(circle());
advance(750);
hold.update(circle().slice(0, 25));
advance(2000);
assert.equal(selections, 2, "Opening the shape cancels the hold");
hold.update(circle());
hold.reset();
advance(2000);
assert.equal(selections, 2, "Lifting or canceling before the deadline prevents selection");
hold.update(circle());
hold.unload();
advance(2000);
assert.equal(selections, 2, "Unload cancels the timer");
console.log("Selection hold: timing, motion, opening, cancellation, and unload passed.");

const tracker = new ClosedShapeTracker();
let reads = 0;
const trackedPoints = new Proxy(circle(), {
  get(target, key) {
    if (typeof key === "string" && /^\d+$/.test(key)) reads++;
    return Reflect.get(target, key);
  },
});
assert(tracker.update(trackedPoints));
trackedPoints.push({ ...trackedPoints.at(-1), y: 201 });
reads = 0;
assert(tracker.update(trackedPoints));
assert(reads <= 4, "Holding checks only newly appended points and endpoints");
