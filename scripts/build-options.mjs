import { builtinModules } from "node:module";

export function buildOptions({ production = false, adbBuildId = "" } = {}) {
  return {
    banner: { js: "/* Generated bundle. Source: src/main.ts */" },
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
      "obsidian",
      "electron",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      ...builtinModules,
    ],
    format: "cjs",
    target: "es2021",
    logLevel: "info",
    treeShaking: true,
    // Bundled handwriting model weights; release artifacts stay main.js-only.
    loader: { ".bin": "binary" },
    sourcemap: production ? false : "inline",
    outfile: "main.js",
    minify: production,
    define: { __EINK_ADB_BUILD_ID__: JSON.stringify(adbBuildId) },
  };
}
