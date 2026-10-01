import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BooxAdb,
  parseOptions,
  shellQuote,
  DEFAULT_CONFIG_DIR,
} from "../scripts/boox-adb.mjs";
import { buildOptions } from "../scripts/build-options.mjs";
import { build } from "esbuild";

assert.equal(parseOptions([], {}).configDir, DEFAULT_CONFIG_DIR);
assert.equal(
  parseOptions(["--once", "--serial", "tablet"], {}).serial,
  "tablet",
);
assert.equal(
  parseOptions([], { ANDROID_SERIAL: "env-tablet" }).serial,
  "env-tablet",
);
assert.throws(() => parseOptions(["--config-dir", "/sdcard/../elsewhere"], {}));
assert.throws(() => parseOptions(["--serial"], {}));
assert.throws(() => parseOptions(["--unknown"], {}));
assert.equal(shellQuote("a' b; $(id)"), "'a'\\'' b; $(id)'");
const directory = await mkdtemp(join(tmpdir(), "eink-adb-unit-"));
try {
  for (const file of ["main.js", "manifest.json", "styles.css"])
    await writeFile(join(directory, file), "test");
  const adb = new BooxAdb(parseOptions([], {}));
  const calls = [];
  adb.run = async (args) => {
    calls.push(args);
    if (args[0] === "devices")
      return "List of devices attached\nonly-tablet\tdevice\n";
    if (args.includes("get-state")) return "device";
    return "";
  };
  await adb.connect();
  assert.equal(adb.options.serial, "only-tablet");
  const remote = await adb.deploy(
    directory,
    { id: "sample-plugin" },
    "build-one",
  );
  assert.equal(remote, `${DEFAULT_CONFIG_DIR}/plugins/sample-plugin`);
  const uploads = calls.filter((args) => args[2] === "push");
  assert.equal(uploads.length, 4);
  assert(uploads.every((args) => args.at(-1).endsWith(".adb-upload")));
  const publish = calls.at(-1).at(-1);
  assert(
    publish.endsWith(`${shellQuote(`${remote}/.adb-reload.json`)}`),
    "Reload marker publishes last",
  );
  assert(
    !calls
      .flat()
      .some(
        (arg) =>
          arg.includes("data.json") || arg.includes("community-plugins.json"),
      ),
    "Deployment never replaces user settings or ink",
  );
  const ambiguous = new BooxAdb(parseOptions([], {}));
  ambiguous.run = async () =>
    "List of devices attached\na\tdevice\nb\tdevice\n";
  await assert.rejects(ambiguous.connect(), /select it with --serial/);
  const failed = new BooxAdb(parseOptions(["--serial", "tablet"], {}));
  const failedCalls = [];
  failed.run = async (args) => {
    failedCalls.push(args);
    if (args[2] === "push" && args[3].endsWith("styles.css"))
      throw new Error("Disconnected");
    return "";
  };
  await assert.rejects(
    failed.deploy(directory, { id: "sample-plugin" }, "failed"),
    /Disconnected/,
  );
  assert(
    !failedCalls.flat().some((arg) => arg.startsWith("mv -f")),
    "Failed upload never publishes partial files or reload marker",
  );
  const production = await build({
    ...buildOptions({ production: true }),
    write: false,
    logLevel: "silent",
  });
  const development = await build({
    ...buildOptions({ adbBuildId: "test-build-id" }),
    write: false,
    logLevel: "silent",
  });
  assert(
    !production.outputFiles[0].text.includes(".adb-reload.json"),
    "Production omits development reloader",
  );
  assert(development.outputFiles[0].text.includes(".adb-reload.json"));
  assert(development.outputFiles[0].text.includes("test-build-id"));
  console.log(
    "ADB: options, device selection, staged deployment, upload failure, and production exclusion passed.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
