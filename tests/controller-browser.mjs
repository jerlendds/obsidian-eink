import { MarkdownView } from "./obsidian-stub.mjs";
import { InkController } from "../src/controller.ts";

export async function checkController(store, host, pause, check) {
  const makeView = (contentEl, path) =>
    Object.assign(new MarkdownView(), {
      contentEl,
      file: { path },
      getMode: () => "preview",
    });
  const secondary = document.body.createDiv();
  secondary.style.cssText =
    "position:absolute;left:810px;top:0;width:300px;height:600px";
  const scroll = secondary.createDiv({ cls: "markdown-preview-view" });
  scroll.createDiv({ cls: "markdown-preview-sizer" });
  const first = makeView(host, "Note.md"),
    second = makeView(secondary, "Note.md");
  let active = first,
    leaves = [{ view: first }, { view: second }];
  const events = new Map();
  const on = (name, callback) => {
    events.set(name, callback);
    return { off: () => events.delete(name) };
  };
  const plugin = {
    app: {
      workspace: {
        on,
        onLayoutReady: (callback) => callback(),
        getActiveViewOfType: () => active,
        getLeavesOfType: () => leaves,
      },
      vault: { on },
    },
  };
  const controller = new InkController(plugin, store);
  controller.load();
  await pause();
  const visibleInk = (el, x, y) =>
    el.querySelector("canvas").getContext("2d").getImageData(x, y, 1, 1)
      .data[3] > 0;
  check(
    host.querySelector(".eink-toolbar").hidden &&
      secondary.querySelector(".eink-toolbar").hidden,
    "Toolbar starts closed in every pane",
  );
  check(
    visibleInk(host, 150, 150) && visibleInk(secondary, 150, 250),
    "Saved ink renders in both panes without opening toolbar",
  );
  controller.toggle();
  check(
    !host.querySelector(".eink-toolbar").hidden,
    "Toggle opens active toolbar",
  );
  active = second;
  events.get("active-leaf-change")();
  await pause();
  check(
    host.querySelector(".eink-toolbar").hidden &&
      !secondary.querySelector(".eink-toolbar").hidden,
    "Only active pane receives drawing toolbar",
  );
  controller.toggle();
  await pause();
  check(
    visibleInk(host, 150, 150) && visibleInk(secondary, 150, 250),
    "Closing toolbar keeps ink in both panes",
  );
  controller.undo();
  await pause();
  check(
    !visibleInk(host, 150, 150) && !visibleInk(secondary, 150, 250),
    "Undo updates every pane showing the note with toolbar closed",
  );
  controller.redo();
  await pause();
  check(
    visibleInk(host, 150, 150) && visibleInk(secondary, 150, 250),
    "Redo restores ink across panes",
  );
  second.file = { path: "Empty.md" };
  events.get("file-open")();
  await pause();
  check(
    !visibleInk(secondary, 150, 250),
    "Switching notes does not leak old ink",
  );
  second.file = { path: "Note.md" };
  events.get("file-open")();
  await pause();
  check(
    visibleInk(secondary, 150, 250),
    "Returning to a note restores ink while toolbar stays closed",
  );
  const longHistory = store.history("Long.md");
  const original = store.history("Note.md").strokes[0];
  longHistory.commit([
    { ...original, points: original.points.map((p) => ({ ...p, y: 5000 })) },
  ]);
  await store.changed("Long.md", longHistory);
  second.file = { path: "Long.md" };
  events.get("file-open")();
  await pause();
  check(
    scroll.scrollHeight > 5500,
    "Opening saved ink beyond the note restores enough paper to reach it",
  );
  scroll.scrollTop = 4700;
  scroll.dispatchEvent(new Event("scroll"));
  await pause();
  check(
    visibleInk(secondary, 150, 300),
    "Saved ink far down the paper renders at its anchored page position",
  );
  leaves = [{ view: first }];
  events.get("layout-change")();
  await pause();
  check(
    !secondary.querySelector(".eink-surface"),
    "Closed panes release their ink layer",
  );
  controller.unload();
  check(
    !host.querySelector(".eink-surface") &&
      !host.querySelector(".eink-scroll-paper"),
    "Plugin unload cleans up visible ink and paper sizing",
  );
  secondary.remove();
}
