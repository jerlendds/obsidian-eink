import { Notice, normalizePath } from "obsidian";
import type EinkPlugin from "../main";

interface DevelopmentPluginManager {
  disablePlugin(id: string): Promise<void>;
  enablePlugin(id: string): Promise<void>;
}

/** Included only in `dev:boox` bundles. Obsidian exposes no public plugin reload API. */
export function registerAdbReload(plugin: EinkPlugin, buildId: string): void {
  const directory =
    plugin.manifest.dir ??
    `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
  const marker = normalizePath(`${directory}/.adb-reload.json`);
  const status = normalizePath(`${directory}/.adb-status.json`);
  const adapter = plugin.app.vault.adapter;
  let busy = false,
    disposed = false;
  plugin.register(() => {
    disposed = true;
  });
  const report = async (state: string, error?: string): Promise<void> => {
    await adapter.write(status, JSON.stringify({ buildId, state, error }));
  };
  void report("ready").catch((error: unknown) =>
    console.error("ADB reload status could not be written", error),
  );
  const check = async (): Promise<void> => {
    if (busy || disposed) return;
    busy = true;
    try {
      if (!(await adapter.exists(marker))) return;
      const next: unknown = JSON.parse(await adapter.read(marker));
      if (
        !next ||
        typeof next !== "object" ||
        !("buildId" in next) ||
        typeof next.buildId !== "string" ||
        next.buildId === buildId ||
        disposed
      )
        return;
      // Internal API, also used by hot-reload plugins. Guard it for version changes.
      const manager = (
        plugin.app as unknown as { plugins?: DevelopmentPluginManager }
      ).plugins;
      if (
        !manager ||
        typeof manager.disablePlugin !== "function" ||
        typeof manager.enablePlugin !== "function"
      ) {
        await report(
          "error",
          "Plugin reload API is unavailable. Toggle Eink off and on.",
        );
        return;
      }
      await plugin.store.save();
      if (disposed) return;
      await report("reloading");
      await manager.disablePlugin(plugin.manifest.id);
      await manager.enablePlugin(plugin.manifest.id);
    } catch (error) {
      console.error("ADB development reload failed", error);
      new Notice(
        "Development reload failed. Toggle the plugin off and on in community plugins.",
      );
      await report("error", String(error)).catch((error: unknown) =>
        console.error("ADB reload status could not be written", error),
      );
    } finally {
      busy = false;
    }
  };
  plugin.registerInterval(
    window.setInterval(() => {
      void check();
    }, 1000),
  );
}
