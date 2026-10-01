import { build } from "esbuild";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildOptions } from "./build-options.mjs";
import { BooxAdb, parseOptions, readManifest } from "./boox-adb.mjs";

const execute = promisify(execFile);
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fingerprint() {
  const hash = createHash("sha256");
  async function scan(directory) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (entry.name.endsWith(".ts"))
        hash.update(path).update(await readFile(path));
    }
  }
  await scan("src");
  for (const file of ["styles.css", "manifest.json"])
    hash.update(file).update(await readFile(file));
  return hash.digest("hex");
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: npm run dev:boox -- [--once] [--serial SERIAL] [--config-dir PATH]

Watches src/**/*.ts, styles.css, and manifest.json, builds, and hot reloads Eink over ADB.
Default config directory: ${options.configDir}
--once         Build and sync once, then exit.
--serial       Select a tablet; also accepts ANDROID_SERIAL.
--config-dir   Override the tablet's .obsidian directory.
ADB            Optional environment variable pointing to the adb executable.

Enable Eink once on the tablet after the first sync. If an older build is already
enabled, toggle it off and on once to load the development reload support.
Keep Obsidian open in the Ink vault for automatic reloads. Ctrl+C stops watching.`);
    return;
  }
  const adb = new BooxAdb(options);
  await adb.connect();
  console.log(`BOOX ${options.serial}: ${options.configDir}`);
  const directory = await mkdtemp(join(tmpdir(), "eink-boox-"));
  let stopped = false,
    previous = "",
    pluginId;
  const stop = () => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    do {
      let revision;
      try {
        revision = await fingerprint();
        if (revision === previous) {
          await sleep(500);
          continue;
        }
        // Editor saves can replace several files in quick succession.
        await sleep(250);
        if (revision !== (await fingerprint())) continue;
        const manifest = await readManifest();
        if (pluginId && manifest.id !== pluginId)
          throw new Error(
            "Manifest ID changed. Restart dev:boox to select the new plugin folder.",
          );
        pluginId = manifest.id;
        const buildId = randomUUID();
        console.log("Type-checking and building…");
        await execute(
          process.execPath,
          ["node_modules/typescript/bin/tsc", "--noEmit", "--skipLibCheck"],
          { timeout: 60000 },
        );
        const bundle = await build({
          ...buildOptions({ adbBuildId: buildId }),
          write: false,
        });
        await writeFile(
          join(directory, "main.js"),
          bundle.outputFiles[0].contents,
        );
        for (const file of ["manifest.json", "styles.css"])
          await writeFile(join(directory, file), await readFile(file));
        if (revision !== (await fingerprint())) continue;
        previous = revision;
        if (stopped) break;
        const remote = await adb.deploy(directory, manifest, buildId);
        console.log(`Synced ${remote}`);
        const ready = await adb.waitForReload(remote, buildId);
        console.log(
          ready
            ? "Tablet confirmed: new development build loaded."
            : "Files synced; reload not confirmed. Enable Eink (or toggle it off/on once) in the Ink vault, and keep Obsidian open.",
        );
        if (options.once) break;
        console.log("Watching for changes…");
      } catch (error) {
        console.error(error.stdout?.trim() || error.message);
        if (options.once) throw error;
        // Keep the last running tablet build. A new edit retries build failures;
        // ADB disconnects also retry automatically after reconnecting.
        previous = error.message.startsWith("ADB failed:")
          ? ""
          : (revision ?? "");
        await sleep(2000);
      }
    } while (!stopped);
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
