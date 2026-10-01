import { build } from "esbuild";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runBrowser } from "./chromium.mjs";
await import("./adb.mjs");
const directory = await mkdtemp(join(tmpdir(), "obsidian-eink-test-"));
try {
  const alias = { obsidian: resolve("tests/obsidian-stub.mjs") };
  await build({
    entryPoints: ["tests/core.mjs"],
    bundle: true,
    platform: "node",
    format: "esm",
    alias,
    outfile: join(directory, "core.mjs"),
  });
  await import(pathToFileURL(join(directory, "core.mjs")).href);
  if (process.argv.includes("--browser")) {
    await build({
      entryPoints: ["tests/browser.mjs"],
      bundle: true,
      platform: "browser",
      format: "iife",
      alias,
      outfile: join(directory, "browser.js"),
    });
    const css = await readFile("styles.css", "utf8");
    await writeFile(
      join(directory, "index.html"),
      `<!doctype html><html><head><style>
      :root { --text-normal: #111; --background-primary: white; --background-secondary: #eee; --background-modifier-border: #888; }
      body { margin: 0; font: 14px sans-serif; } #note { width: 800px; height: 600px; position: relative; }
      .markdown-preview-view { height: 100%; overflow: auto; } article { height: 1500px; padding: 80px 40px; }
      ${css}</style></head><body><div id="note"><div class="markdown-preview-view"><article class="markdown-preview-sizer"><h1>Ink test note</h1><p>Canvas annotations over a scrolling Markdown page.</p></article></div></div><pre id="result">RUNNING</pre><script src="browser.js"></script></body></html>`,
    );
    const result = await runBrowser(
      pathToFileURL(join(directory, "index.html")).href,
      directory,
    );
    console.log(`Browser: ${result}`);
  }
} finally {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
