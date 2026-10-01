import assert from "node:assert/strict";
import fixtures from "./fixtures/handwriting.json";
import { recognizeLine } from "../src/ocr/recognizer.ts";
import { splitLines } from "../src/ocr/lines.ts";
import { insertAtLine } from "../src/ocr/insert.ts";
import { newPen } from "../src/drawing/model.ts";

// Expected text comes from the NumPy reference of the original PyTorch model (float16 weights),
// so these checks pin the port, not recognition quality.
const strokes = (name) => fixtures[name].strokes.map(
  (points, i) => ({ id: `${name}-${i}`, tool: "pen", pen: newPen(), points: points.map(([x, y]) => ({ x, y, pressure: 0.5 })) }),
);
const points = (list) => list.map((stroke) => stroke.points);
for (const name of ["trigonometry", "software"])
  assert.equal(recognizeLine(points(strokes(name))), fixtures[name].expected, `${name} matches the reference model`);
assert.deepEqual(splitLines(strokes("software")).map((line) => line.length), [21], "One written line stays one line");
const lines = splitLines(strokes("two-lines"));
assert.equal(lines.length, 2, "Two written lines are recognized separately");
assert(lines[0].every((stroke) => stroke.points[0].y < 935) && lines[1].every((stroke) => stroke.points[0].y > 930),
  "Lines are ordered top to bottom");
const text = lines.map((line) => recognizeLine(points(line)));
assert(text[0].includes("years") && text[1].length > 5, `Split lines recognize words: ${JSON.stringify(text)}`);
assert.equal(recognizeLine([]), "");
assert.deepEqual(insertAtLine(["# Title", "", "After"], 1, "one\ntwo"), ["# Title", "one", "two", "After"],
  "Text fills the blank line under the ink");
assert.deepEqual(insertAtLine(["# Title", "Body"], 1, "text"), ["# Title", "Body", "text"],
  "Text after a written line goes on a new line");
assert.deepEqual(insertAtLine(["a"], 99, "z"), ["a", "z"], "Ink past the end appends");
console.log(`OCR: reference parity, line splitting, insertion, and empty input passed (${JSON.stringify(text)}).`);
