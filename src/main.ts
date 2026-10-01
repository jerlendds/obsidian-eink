import { Plugin } from "obsidian";
import { InkController } from "./controller";
import { EinkSettingTab } from "./settings";
import { InkStore } from "./storage";
import { registerAdbReload } from "./dev/adb-reload";

declare const __EINK_ADB_BUILD_ID__: string;

export default class EinkPlugin extends Plugin {
  store!: InkStore;
  controller!: InkController;
  async onload(): Promise<void> {
    this.store = new InkStore(this);
    await this.store.load();
    this.controller = this.addChild(new InkController(this, this.store));
    this.addRibbonIcon("pen-tool", "Toggle drawing toolbar", () =>
      this.controller.toggle(),
    );
    this.addCommand({
      id: "toggle-drawing-toolbar",
      name: "Toggle drawing toolbar",
      callback: () => this.controller.toggle(),
    });
    this.addCommand({
      id: "undo-ink",
      name: "Undo ink",
      callback: () => this.controller.undo(),
    });
    this.addCommand({
      id: "redo-ink",
      name: "Redo ink",
      callback: () => this.controller.redo(),
    });
    this.addSettingTab(new EinkSettingTab(this.app, this));
    if (__EINK_ADB_BUILD_ID__) registerAdbReload(this, __EINK_ADB_BUILD_ID__);
  }
}
