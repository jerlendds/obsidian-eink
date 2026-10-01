import { checkController } from "./controller-browser.mjs";
import { installDom } from "./obsidian-stub.mjs";
import { InkSurface } from "../src/ui/surface.ts";
import { InkStore } from "../src/storage.ts";
installDom();
const check = (value, label) => {
  if (!value) throw new Error(label);
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 40));
const button = (label) =>
  document.querySelector(`button[aria-label="${label}"]`);
let saved;
async function run() {
  try {
    const store = new InkStore({
      loadData: async () => null,
      saveData: async (data) => {
        saved = structuredClone(data);
      },
    });
    await store.load();
    const host = document.querySelector("#note");
    const view = { contentEl: host, getMode: () => "preview" };
    let surface = new InkSurface(view, "Note.md", store, () =>
      surface.unload(),
    );
    surface.load();
    await pause();
    const canvas = host.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const alpha = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
    const pointer = (type, x, y, extra = {}) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "pen",
          pressure: 0.5,
          isPrimary: true,
          button: 0,
          bubbles: true,
          ...extra,
        }),
      );
    const draw = (points, extra) => {
      pointer("pointerdown", ...points[0], extra);
      for (const point of points.slice(1))
        pointer("pointermove", ...point, extra);
      pointer("pointerup", ...points.at(-1), extra);
    };
    check(button("Undo ink").disabled, "Undo starts disabled");
    const ruling = host.querySelector(".eink-ruled-lines");
    check(ruling.hidden, "Ruled lines default off");
    const textSample = host.querySelector("p");
    textSample.style.fontSize = "20px";
    textSample.style.lineHeight = "30px";
    button("Toggle ruled lines").click();
    await pause();
    check(
      !ruling.hidden &&
        ruling.style.getPropertyValue("--eink-rule-spacing") === "30px",
      "Ruling follows computed note line height",
    );
    check(
      getComputedStyle(ruling).backgroundImage.includes("rgb(0, 0, 0)") &&
        getComputedStyle(ruling).pointerEvents === "none",
      "Guides are black and do not intercept drawing",
    );
    check(saved.settings.ruledLines === true, "Ruling preference persists");
    textSample.style.fontSize = "24px";
    textSample.style.lineHeight = "36px";
    await pause();
    check(
      ruling.style.getPropertyValue("--eink-rule-spacing") === "36px",
      "Changing typography updates ruling without reopening toolbar",
    );
    const rulingScroll = host.querySelector(".markdown-preview-view");
    const phaseBefore = Number.parseFloat(
      getComputedStyle(ruling).backgroundPositionY,
    );
    rulingScroll.scrollTop = 11;
    rulingScroll.dispatchEvent(new Event("scroll"));
    await pause();
    const phaseAfter = Number.parseFloat(
      getComputedStyle(ruling).backgroundPositionY,
    );
    check(
      Math.abs(((phaseBefore - 11 + 36) % 36) - phaseAfter) < 0.01,
      "Rules stay page-anchored during scrolling",
    );
    surface.setToolbarVisible(false);
    await pause();
    check(!ruling.hidden, "Rules remain visible with toolbar closed");
    surface.setToolbarVisible(true);
    rulingScroll.scrollTop = 0;
    rulingScroll.dispatchEvent(new Event("scroll"));
    button("Toggle ruled lines").click();
    await pause();
    check(
      ruling.hidden && store.history("Note.md").strokes.length === 0,
      "Turning rules off does not create ink or history",
    );
    textSample.style.removeProperty("font-size");
    textSample.style.removeProperty("line-height");

    draw([
      [100, 250],
      [300, 250],
    ]);
    await pause();
    check(
      alpha(200, 250) > 0,
      "Pen renders " +
        JSON.stringify({
          width: canvas.width,
          height: canvas.height,
          rect: canvas.getBoundingClientRect(),
          strokes: store.history("Note.md").strokes,
          frame: surface.frame,
        }),
    );
    check(saved.drawings["Note.md"].length === 1, "Drawing persists");
    const circle = (duration = 400, cx = 200, cy = 250, cancel = false) => {
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const event = new PointerEvent(
          i === 0 ? "pointerdown" : "pointermove",
          {
            clientX: cx + Math.cos(angle) * 130,
            clientY: cy + Math.sin(angle) * 60,
            pointerId: 13,
            pointerType: "pen",
            pressure: 0.5,
            isPrimary: true,
            button: 0,
          },
        );
        Object.defineProperty(event, "timeStamp", {
          value: 10000 + (i / 32) * duration,
        });
        canvas.dispatchEvent(event);
      }
      const end = new PointerEvent(cancel ? "pointercancel" : "pointerup", {
        clientX: cx + 130,
        clientY: cy,
        pointerId: 13,
        pointerType: "pen",
        pressure: 0.5,
        isPrimary: true,
        button: 0,
      });
      Object.defineProperty(end, "timeStamp", { value: 10000 + duration + 1 });
      canvas.dispatchEvent(end);
    };
    const selection = host.querySelector(".eink-selection-actions");
    circle();
    await pause();
    check(
      !selection.hidden && selection.textContent.includes("1 stroke selected"),
      "Quick circle creates lasso selection",
    );
    check(
      store.history("Note.md").strokes.length === 1 && alpha(200, 250) > 0,
      "Circle becomes selection without erasing or saving a circle stroke",
    );
    check(
      saved.drawings["Note.md"].length === 1,
      "Selection is transient and does not persist as ink",
    );
    const noteScroll = document.querySelector(".markdown-preview-view");
    noteScroll.scrollTop = 100;
    noteScroll.dispatchEvent(new Event("scroll"));
    await pause();
    check(
      !selection.hidden && alpha(200, 150) > 0,
      "Selection and selected ink survive scrolling",
    );
    noteScroll.scrollTop = 0;
    noteScroll.dispatchEvent(new Event("scroll"));
    selection.querySelector("button").click();
    await pause();
    check(
      selection.hidden && store.history("Note.md").strokes.length === 0,
      "Delete selection removes selected ink",
    );
    surface.undo();
    await pause();
    check(
      store.history("Note.md").strokes.length === 1,
      "Undo restores selected ink in one step without a circle",
    );
    surface.redo();
    await pause();
    check(
      store.history("Note.md").strokes.length === 0,
      "Redo selection deletion",
    );
    surface.undo();
    circle(1800);
    await pause();
    check(
      selection.hidden && store.history("Note.md").strokes.length === 2,
      "Slow circle stays ink",
    );
    surface.undo();
    circle(400, 200, 450);
    await pause();
    check(
      selection.hidden && store.history("Note.md").strokes.length === 2,
      "Circle around blank space remains ink",
    );
    surface.undo();
    circle(400, 200, 250, true);
    await pause();
    check(
      selection.hidden && store.history("Note.md").strokes.length === 1,
      "Canceled circle makes no selection",
    );
    store.settings.circleLasso = false;
    circle();
    await pause();
    check(
      selection.hidden && store.history("Note.md").strokes.length === 2,
      "Disabled circle gesture stays ink",
    );
    surface.undo();
    store.settings.circleLasso = true;
    circle();
    await pause();
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    check(selection.hidden, "Escape clears selection");
    // Explicit timestamps let real PointerEvent handling exercise fast and slow gestures deterministically.
    const scratch = (step, y = 250, cancel = false, passes = 4) => {
      const xs = Array.from({ length: passes + 1 }, (_, i) =>
        i % 2 ? 220 : 180,
      );
      xs.forEach((x, i) => {
        const event = new PointerEvent(
          i === 0 ? "pointerdown" : "pointermove",
          {
            clientX: x,
            clientY: y,
            pointerId: 7,
            pointerType: "pen",
            pressure: 0.5,
            isPrimary: true,
            button: 0,
          },
        );
        Object.defineProperty(event, "timeStamp", { value: 1000 + i * step });
        canvas.dispatchEvent(event);
      });
      const end = new PointerEvent(cancel ? "pointercancel" : "pointerup", {
        clientX: xs.at(-1),
        clientY: y,
        pointerId: 7,
        pointerType: "pen",
        pressure: 0.5,
        isPrimary: true,
        button: 0,
      });
      Object.defineProperty(end, "timeStamp", {
        value: 1000 + passes * step + 1,
      });
      canvas.dispatchEvent(end);
    };
    for (const passes of [5, 40]) {
      scratch(50, 250, false, passes);
      await pause();
      check(
        store.history("Note.md").strokes.length === 0,
        `${passes} scratch passes erase old ink`,
      );
      surface.undo();
      await pause();
      check(
        store.history("Note.md").strokes.length === 1,
        "Long scratch-out restores in one undo",
      );
    }
    scratch(200);
    await pause();
    check(
      store.history("Note.md").strokes.length === 2,
      "Slow scribble remains ink",
    );
    surface.undo();
    scratch(50, 250, true);
    await pause();
    check(
      store.history("Note.md").strokes.length === 1,
      "Canceled scratch-out does not erase",
    );
    scratch(50);
    await pause();
    check(
      alpha(150, 250) === 0 && store.history("Note.md").strokes.length === 0,
      "Accelerated scribble erases crossed stroke, without saving scribble",
    );
    check(saved.drawings["Note.md"].length === 0, "Scratch-out persists");
    surface.undo();
    await pause();
    check(alpha(150, 250) > 0, "Scratch-out undo restores whole stroke");
    surface.redo();
    await pause();
    check(alpha(150, 250) === 0, "Scratch-out redo removes it again");
    surface.undo();
    store.settings.scribbleErase = false;
    scratch(50);
    await pause();
    check(
      store.history("Note.md").strokes.length === 2,
      "Disabled scratch-out remains ink",
    );
    surface.undo();
    store.settings.scribbleErase = true;
    scratch(50, 400);
    await pause();
    check(
      store.history("Note.md").strokes.length === 2,
      "Scribble on blank space remains ink",
    );
    surface.undo();
    button("Eraser").click();
    check(
      document.querySelector(".eink-panel").hidden,
      "First eraser click selects",
    );
    button("Eraser").click();
    check(
      !document.querySelector(".eink-panel").hidden,
      "Second eraser click opens panel",
    );
    draw([
      [200, 230],
      [200, 270],
    ]);
    await pause();
    check(
      alpha(200, 250) === 0 && alpha(150, 250) > 0,
      "Pixel eraser only removes crossed pixels",
    );
    button("Undo ink").click();
    await pause();
    check(alpha(200, 250) > 0, "Undo restores pixels");
    button("Redo ink").click();
    await pause();
    check(alpha(200, 250) === 0, "Redo reapplies eraser");
    button("Undo ink").click();
    const select = document.querySelector('select[aria-label="Eraser type"]');
    select.value = "Stroke";
    select.dispatchEvent(new Event("change"));
    draw([
      [200, 230],
      [200, 270],
    ]);
    await pause();
    check(alpha(150, 250) === 0, "Stroke eraser removes entire stroke");
    button("Undo ink").click();
    select.value = "Lasso";
    select.dispatchEvent(new Event("change"));
    draw([
      [190, 240],
      [210, 240],
      [210, 260],
      [190, 260],
      [190, 240],
    ]);
    await pause();
    check(alpha(150, 250) === 0, "Lasso erases intersecting stroke");
    button("Undo ink").click();
    button("Add pen").click();
    check(store.settings.pens.length === 2, "Add pen appends preset");
    check(
      document.querySelectorAll(".eink-color").length === 9,
      "Nine color swatches",
    );
    check(
      document.querySelector('select[aria-label="Drawing type"]').options
        .length === 7,
      "Seven pen types",
    );
    const width = document.querySelector('input[aria-label="Pen width"]');
    width.value = "4";
    width.dispatchEvent(new Event("input"));
    width.dispatchEvent(new Event("change"));
    check(
      store.settings.pens[1].width === 4,
      "Width slider updates selected pen",
    );
    button("Red").click();
    check(
      store.settings.pens[1].color === "#ff0000",
      "Color selection updates pen",
    );
    const count = store.history("Note.md").strokes.length;
    pointer("pointerdown", 100, 350);
    pointer("pointermove", 200, 350);
    pointer("pointercancel", 200, 350);
    await pause();
    check(
      store.history("Note.md").strokes.length === count,
      "Canceled gesture does not commit",
    );
    draw(
      [
        [100, 350],
        [200, 350],
      ],
      { pointerType: "touch" },
    );
    await pause();
    check(
      store.history("Note.md").strokes.length === count,
      "Finger drawing is disabled by default",
    );
    const scroll = document.querySelector(".markdown-preview-view");
    const touch = (type, x, y, id = 9, primary = true) =>
      pointer(type, x, y, {
        pointerType: "touch",
        pointerId: id,
        isPrimary: primary,
      });
    touch("pointerdown", 400, 450);
    touch("pointermove", 400, 250);
    touch("pointerup", 400, 250);
    await pause();
    check(
      scroll.scrollTop === 200 && surface.toolbar.tool === "pen",
      "One finger scrolls while pen tool remains active",
    );
    check(
      alpha(150, 50) > 0,
      "Old ink moves with the page during finger scroll",
    );
    draw([
      [400, 350],
      [500, 350],
    ]);
    await pause();
    check(
      store.history("Note.md").strokes.at(-1).points[0].y === 550,
      "New ink uses page coordinates after scrolling",
    );
    scroll.scrollTop = 100;
    scroll.dispatchEvent(new Event("scroll"));
    await pause();
    check(
      alpha(450, 450) > 0,
      "New ink stays at its draw position when scrolling back",
    );
    surface.undo();
    const beforePalm = scroll.scrollTop;
    pointer("pointerdown", 400, 350);
    touch("pointerdown", 600, 400, 9, false);
    touch("pointermove", 600, 200, 9, false);
    touch("pointercancel", 600, 200, 9, false);
    pointer("pointermove", 500, 350);
    pointer("pointerup", 500, 350);
    await pause();
    check(
      scroll.scrollTop === beforePalm &&
        store.history("Note.md").strokes.length === count + 1,
      "Palm neither scrolls nor cancels active pen stroke",
    );
    surface.undo();
    store.settings.drawWithTouch = true;
    const beforeTwoFingers = scroll.scrollTop;
    touch("pointerdown", 400, 450, 11);
    touch("pointerdown", 500, 450, 12, false);
    touch("pointermove", 400, 350, 11);
    touch("pointermove", 500, 350, 12, false);
    touch("pointerup", 400, 350, 11);
    touch("pointerup", 500, 350, 12, false);
    await pause();
    check(
      scroll.scrollTop === beforeTwoFingers + 100,
      "Two fingers scroll when finger drawing is enabled",
    );
    check(
      store.history("Note.md").strokes.length === count,
      "Two-finger gesture leaves no accidental ink",
    );
    draw(
      [
        [400, 350],
        [500, 350],
      ],
      { pointerType: "touch" },
    );
    await pause();
    check(
      store.history("Note.md").strokes.length === count + 1,
      "Single finger still draws when enabled",
    );
    surface.undo();
    store.settings.drawWithTouch = false;
    const previousHeight = scroll.scrollHeight;
    scroll.scrollTop = previousHeight - scroll.clientHeight;
    scroll.dispatchEvent(new Event("scroll"));
    await pause();
    check(
      scroll.scrollHeight > previousHeight,
      "Scrolling near bottom extends blank writing space",
    );
    const anchoredY = scroll.scrollTop + 450;
    draw([
      [400, 450],
      [500, 450],
    ]);
    await pause();
    check(
      store.history("Note.md").strokes.at(-1).points[0].y === anchoredY,
      "Ink in extended paper stores absolute page position",
    );
    surface.setToolbarVisible(false);
    await pause();
    check(
      surface.toolbar.element.hidden &&
        alpha(450, 450) > 0 &&
        getComputedStyle(canvas).pointerEvents === "none",
      "Closing toolbar leaves ink visible and permits note interaction",
    );
    surface.setToolbarVisible(true);
    surface.undo();
    scroll.scrollTop = 100;
    scroll.dispatchEvent(new Event("scroll"));
    await pause();
    check(
      alpha(150, 150) > 0 && alpha(150, 250) === 0,
      "Ink follows note scrolling",
    );
    button("Navigate and edit note").click();
    check(
      getComputedStyle(canvas).pointerEvents === "none",
      "Hand tool permits note interaction",
    );
    const handle = button("Move toolbar (drag or arrow keys)");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    check(store.settings.toolbarX === 26, "Keyboard movement updates position");
    surface.unload();
    check(
      !host.querySelector(".eink-surface") &&
        !host.classList.contains("eink-host"),
      "Unload removes overlay and host styles",
    );
    surface = new InkSurface(view, "Note.md", store, () => surface.unload());
    surface.load();
    await pause();
    check(
      host.querySelector("canvas").getContext("2d").getImageData(150, 150, 1, 1)
        .data[3] > 0,
      "Reopen restores drawing",
    );
    button("Pen 2: Pen, 4 mm").click();
    store.settings.toolbarX = 10000;
    store.settings.toolbarY = 10000;
    host.style.width = "320px";
    host.style.height = "480px";
    await pause();
    const toolbarRect = document
      .querySelector(".eink-toolbar")
      .getBoundingClientRect();
    check(
      toolbarRect.left >= 0 &&
        toolbarRect.right <= 320 &&
        toolbarRect.top >= 0 &&
        toolbarRect.bottom <= 480,
      "Toolbar and open panel fit a small viewport: " +
        JSON.stringify(toolbarRect),
    );
    host.style.width = "800px";
    host.style.height = "600px";
    store.settings.toolbarX = 16;
    store.settings.toolbarY = 16;
    surface.toolbar.reposition();
    await pause();
    surface.unload();
    await checkController(store, host, pause, check);
    surface = new InkSurface(view, "Note.md", store, () =>
      surface.setToolbarVisible(false),
    );
    surface.load();
    await pause();
    document.querySelector("#result").textContent =
      "PASS: canvas, pen controls, all erasers, undo/redo, scribble, finger scrolling, anchored paper, persistent ink across panes, palm rejection, unload/reopen";
  } catch (error) {
    document.querySelector("#result").textContent = `FAIL: ${error.stack}`;
  }
}
void run();
