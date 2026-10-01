import { InkRenderer } from "../src/drawing/ink-renderer.ts";
import { renderStroke } from "../src/drawing/render.ts";
import { DRAWING_TYPES, newPen } from "../src/drawing/model.ts";

export function checkInkRenderer(check) {
  const canvas = document.createElement("canvas");
  const reference = document.createElement("canvas");
  canvas.width = reference.width = 360;
  canvas.height = reference.height = 260;
  const context = canvas.getContext("2d");
  const expected = reference.getContext("2d");
  const renderer = new InkRenderer(canvas, context);
  const viewport = { ratio: 1, left: 7, top: 5, width: 330, height: 230, scrollLeft: 0, scrollTop: 0 };
  const point = (x, y, pressure = 0.5) => ({ x, y, pressure });
  const stroke = (id, type = "Pen", tool = "pen") => ({ id, tool, pen: { ...newPen(), type, width: 2 }, points: [] });
  const base = stroke("base");
  base.points = [point(20, 70), point(250, 70), point(250, 120), point(20, 120)];
  const referenceRender = (strokes, live, view = viewport) => {
    expected.setTransform(1, 0, 0, 1, 0, 0);
    expected.clearRect(0, 0, reference.width, reference.height);
    expected.save();
    expected.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
    expected.beginPath();
    expected.rect(view.left, view.top, view.width, view.height);
    expected.clip();
    expected.translate(view.left - view.scrollLeft, view.top - view.scrollTop);
    for (const item of strokes) renderStroke(expected, item);
    if (live) renderStroke(expected, live, 0, true);
    expected.restore();
  };
  const compare = (label) => {
    const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const wanted = expected.getImageData(0, 0, reference.width, reference.height).data;
    let differences = 0;
    for (let i = 0; i < actual.length; i++) if (actual[i] !== wanted[i]) differences++;
    check(differences === 0, `${label}: ${differences} differing color channels`);
  };
  for (const type of [...DRAWING_TYPES, "Pixel"]) {
    const saved = [base];
    renderer.invalidate();
    renderer.render(saved, null, viewport);
    const live = stroke(type, type === "Pixel" ? "Pen" : type, type === "Pixel" ? "eraser" : "pen");
    for (let i = 0; i < 30; i++) {
      live.points.push(point(20 + i * 6, 70 + Math.sin(i / 3) * 40, 0.1 + (i % 10) / 10));
      renderer.render(saved, live, viewport);
    }
    referenceRender(saved, live);
    compare(`${type} incremental rendering matches complete replay`);
    // Include a final sample that has not yet been painted when the stroke commits.
    live.points.push(point(240, 110, 0.7));
    const committed = [...saved, live];
    renderer.render(committed, null, viewport);
    referenceRender(committed, null);
    compare(`${type} commit preserves the final sample without double painting`);
    renderer.render(saved, null, viewport);
    referenceRender(saved, null);
    compare(`${type} undo restores ink`);
    renderer.render(committed, null, viewport);
    referenceRender(committed, null);
    compare(`${type} redo restores ink`);
    const canceled = stroke("cancel");
    canceled.points = [point(100, 100), point(170, 160)];
    renderer.render(committed, canceled, viewport);
    renderer.render(committed, null, viewport);
    compare(`${type} cancel restores ink`);
    const scrolled = { ...viewport, scrollTop: 50, scrollLeft: 20 };
    renderer.render(committed, null, scrolled);
    referenceRender(committed, null, scrolled);
    compare(`${type} scrolling replays at correct coordinates`);
  }
  renderer.render([base], null, viewport, (ctx) => ctx.strokeRect(30, 30, 100, 100));
  const undecorated = [base];
  renderer.render(undecorated, null, viewport);
  referenceRender(undecorated, null);
  compare("Removing selection bounds restores the clean bitmap");
  // Long segments with varying widths must not be culled at the viewport edge.
  const edge = stroke("edge", "Brush");
  edge.pen.width = 4;
  edge.pen.pressure = 100;
  edge.points = [point(336, 30, 0.01), point(390, 70, 1)];
  renderer.render([edge], null, viewport);
  referenceRender([edge], null);
  compare("Wide crossing segment is retained at the clipping edge");
  const outside = stroke("outside");
  outside.points = [point(900, 900), point(1000, 950)];
  renderer.render([base, outside], null, viewport);
  referenceRender([base, outside], null);
  compare("Offscreen ink is culled without changing output");
  const resized = { ...viewport, ratio: 2, width: 180, height: 120 };
  canvas.width = reference.width = 400;
  canvas.height = reference.height = 280;
  renderer.invalidate();
  renderer.render([base], null, resized);
  referenceRender([base], null, resized);
  compare("Resize and device pixel ratio invalidate the bitmap");

  // Fast writing yields sparse samples; curves must round them off rather than join with corners.
  const sparse = stroke("sparse");
  sparse.points = [point(20, 20), point(100, 20), point(100, 100)];
  renderer.render([sparse], null, resized);
  // The quadratic's midpoint is (90, 30); the unsmoothed corner sample is (100, 20).
  const at = (x, y) => context.getImageData((resized.left + x) * 2, (resized.top + y) * 2, 1, 1).data[3];
  const cornerAlpha = at(99, 21), curveAlpha = at(90, 30);
  check(cornerAlpha === 0 && curveAlpha > 0,
    `Sparse samples render as a smooth curve (corner=${cornerAlpha}, curve=${curveAlpha})`);
  // Stable work counts are more meaningful than a hardware-dependent timing threshold.
  const dense = Array.from({ length: 100 }, (_, j) => {
    const item = stroke(`dense-${j}`);
    item.points = Array.from({ length: 200 }, (_, i) => point(20 + i, 20 + j));
    return item;
  });
  let segments = 0, clears = 0;
  const originalStroke = context.stroke.bind(context), originalClear = context.clearRect.bind(context);
  context.stroke = (...args) => { segments++; return originalStroke(...args); };
  context.clearRect = (...args) => { clears++; return originalClear(...args); };
  renderer.invalidate();
  renderer.render(dense, null, viewport);
  const live = stroke("long-live");
  live.points = Array.from({ length: 2000 }, (_, i) => point(10 + i % 200, 150 + i % 3));
  renderer.render(dense, live, viewport);
  segments = clears = 0;
  live.points.push(point(220, 155));
  renderer.render(dense, live, viewport);
  check(segments === 1 && clears === 0,
    `Dense-page pen move paints only the new segment (segments=${segments}, clears=${clears})`);
  segments = 0;
  renderer.render([...dense, live], null, viewport);
  check(segments === 1 && clears === 0, "Committing live ink paints only its final half segment");
  return "20,000 saved points + 2,000 live points: next move draws 1 segment, 0 clears";
}
