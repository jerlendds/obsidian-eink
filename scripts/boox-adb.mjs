import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const execute = promisify(execFile);
export const DEFAULT_CONFIG_DIR = "/sdcard/Documents/Notebooks/Ink/.obsidian";
export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
export function parseOptions(args, env = process.env) {
  const options = {
    configDir: DEFAULT_CONFIG_DIR,
    serial: env.ANDROID_SERIAL,
    once: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--once") options.once = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--serial" || arg === "--config-dir") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`Missing value for ${arg}`);
      options[arg === "--serial" ? "serial" : "configDir"] = value;
    } else throw new Error(`Unknown option: ${arg}. Use --help.`);
  }
  options.configDir = options.configDir.replace(/\/+$/, "");
  if (
    !options.configDir.startsWith("/") ||
    options.configDir.includes("\0") ||
    options.configDir.includes("\n") ||
    options.configDir.split("/").some((part) => part === "..") ||
    options.configDir === ""
  ) {
    throw new Error(
      "--config-dir must be an absolute Android configuration directory without parent traversal.",
    );
  }
  return options;
}
export class BooxAdb {
  constructor(options, executable = process.env.ADB ?? "adb") {
    this.options = options;
    this.executable = executable;
  }
  async run(args, timeout = 30000) {
    try {
      const result = await execute(this.executable, args, {
        encoding: "utf8",
        timeout,
        maxBuffer: 1024 * 1024,
      });
      return result.stdout.trim();
    } catch (error) {
      if (error.code === "ENOENT")
        throw new Error(
          "ADB is not installed. Install Android platform-tools or set ADB to its executable.",
        );
      throw new Error(`ADB failed: ${error.stderr?.trim() || error.message}`);
    }
  }
  async connect() {
    if (!this.options.serial) {
      const output = await this.run(["devices"]);
      const devices = output
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts[1] === "device");
      if (devices.length !== 1)
        throw new Error(
          "Connect and authorize one tablet, or select it with --serial SERIAL (or ANDROID_SERIAL).",
        );
      this.options.serial = devices[0][0];
    }
    const state = await this.device(["get-state"]);
    if (state !== "device")
      throw new Error(`Tablet ${this.options.serial} is not ready: ${state}`);
    await this.shell(`test -d ${shellQuote(this.options.configDir)}`);
  }
  device(args) {
    return this.run(["-s", this.options.serial, ...args]);
  }
  shell(command) {
    return this.device(["shell", command]);
  }
  async deploy(directory, manifest, buildId) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id))
      throw new Error("Manifest ID must be a safe plugin folder name.");
    const remote = `${this.options.configDir}/plugins/${manifest.id}`;
    await this.shell(`mkdir -p ${shellQuote(remote)}`);
    const marker = ".adb-reload.json";
    await writeFile(
      join(directory, marker),
      JSON.stringify({ version: 1, buildId }),
    );
    const files = ["main.js", "manifest.json", "styles.css", marker];
    for (const file of files)
      await this.device([
        "push",
        join(directory, file),
        `${remote}/.${file}.adb-upload`,
      ]);
    // Publish only after every upload succeeds. The reload marker is committed last.
    await this.shell(
      files
        .map(
          (file) =>
            `mv -f ${shellQuote(`${remote}/.${file}.adb-upload`)} ${shellQuote(`${remote}/${file}`)}`,
        )
        .join(" && "),
    );
    return remote;
  }
  async waitForReload(remote, buildId, timeout = 6000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const statusFile = shellQuote(`${remote}/.adb-status.json`);
      const text = await this.shell(
        `if test -f ${statusFile}; then cat ${statusFile}; fi`,
      );
      if (text) {
        let status;
        try {
          status = JSON.parse(text);
        } catch {
          /* Poll again if a status write is in progress. */
        }
        if (status?.state === "error")
          throw new Error(`Tablet reload failed: ${status.error}`);
        if (status?.state === "ready" && status.buildId === buildId)
          return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }
}
export async function readManifest() {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  if (
    typeof manifest.id !== "string" ||
    !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)
  )
    throw new Error("Invalid manifest ID.");
  return manifest;
}
