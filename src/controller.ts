import { Component, MarkdownView, Notice, type Plugin } from "obsidian";
import type { InkStore } from "./storage";
import { InkSurface } from "./ui/surface";

export class InkController extends Component {
  private surfaces = new Map<MarkdownView, InkSurface>();
  private toolbarOpen = false;
  private disposed = false;
  constructor(
    private plugin: Plugin,
    private store: InkStore,
  ) {
    super();
  }
  onload(): void {
    this.register(() => {
      this.disposed = true;
      this.surfaces.clear();
    });
    this.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", () => this.sync()),
    );
    this.registerEvent(
      this.plugin.app.workspace.on("file-open", () => this.sync()),
    );
    this.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => this.sync()),
    );
    this.registerEvent(
      this.plugin.app.workspace.on("css-change", () => this.refreshInk()),
    );
    this.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => {
        void this.store.rename(oldPath, file.path);
        this.sync();
      }),
    );
    this.registerEvent(
      this.plugin.app.vault.on("delete", (file) => {
        for (const [view, surface] of this.surfaces) {
          if (
            surface.path === file.path ||
            surface.path.startsWith(`${file.path}/`)
          )
            this.detach(view);
        }
        void this.store.delete(file.path);
      }),
    );
    this.plugin.app.workspace.onLayoutReady(() => {
      if (!this.disposed) this.sync();
    });
  }
  toggle(): void {
    if (
      !this.toolbarOpen &&
      !this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file
    ) {
      new Notice("Open a Markdown note to draw.");
      return;
    }
    this.toolbarOpen = !this.toolbarOpen;
    this.sync();
  }
  private sync(): void {
    if (this.disposed) return;
    const active = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const views = new Set(
      this.plugin.app.workspace
        .getLeavesOfType("markdown")
        .map((leaf) => leaf.view)
        .filter(
          (view): view is MarkdownView =>
            view instanceof MarkdownView && !!view.file,
        ),
    );
    for (const [view, surface] of this.surfaces) {
      if (!views.has(view) || view.file?.path !== surface.path)
        this.detach(view);
    }
    for (const view of views) {
      let surface = this.surfaces.get(view);
      if (!surface) {
        try {
          surface = this.addChild(
            new InkSurface(
              view,
              view.file!.path,
              this.store,
              () => this.toggle(),
              () => this.refreshInk(),
            ),
          );
          this.surfaces.set(view, surface);
        } catch (error) {
          console.error("Unable to open ink layer", error);
          new Notice("Could not open the drawing layer.");
          continue;
        }
      } else surface.refresh();
      surface.setToolbarVisible(this.toolbarOpen && view === active);
    }
  }
  refreshInk(): void {
    for (const surface of this.surfaces.values()) surface.refresh();
  }
  private detach(view: MarkdownView): void {
    const surface = this.surfaces.get(view);
    if (surface) {
      this.removeChild(surface);
      this.surfaces.delete(view);
    }
  }
  private activeSurface(): InkSurface | undefined {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    return view ? this.surfaces.get(view) : undefined;
  }
  reposition(): void {
    for (const surface of this.surfaces.values()) surface.toolbar.reposition();
  }
  undo(): void {
    this.activeSurface()?.undo();
  }
  redo(): void {
    this.activeSurface()?.redo();
  }
}
