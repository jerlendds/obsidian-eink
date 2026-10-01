import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

export async function runBrowser(url, directory) {
  const browser = spawn(
    process.env.CHROMIUM ?? "chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--window-size=1000,800",
      `--user-data-dir=${directory}/profile`,
      "--remote-debugging-pipe",
    ],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
  );
  const pending = new Map();
  let sequence = 0,
    buffer = "";
  const command = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      browser.stdio[3].write(
        JSON.stringify({ id, method, params, sessionId }) + "\0",
      );
    });
  browser.on("error", (error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  });
  browser.stdio[4].on("data", (chunk) => {
    buffer += chunk.toString();
    for (let index; (index = buffer.indexOf("\0")) >= 0; ) {
      const message = JSON.parse(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
      }
    }
  });
  const timeout = setTimeout(() => {
    for (const entry of pending.values())
      entry.reject(new Error("Browser test timed out"));
    browser.kill();
  }, 20000);
  try {
    const { targetId } = await command("Target.createTarget", { url });
    const { sessionId } = await command("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    let text = "RUNNING";
    for (
      let i = 0;
      i < 150 && (text === "RUNNING" || text === "LOADING");
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const result = await command(
        "Runtime.evaluate",
        {
          expression:
            'document.querySelector("#result")?.textContent ?? "LOADING"',
          returnByValue: true,
        },
        sessionId,
      );
      text = result.result?.value ?? "LOADING";
    }
    const screenshot = await command(
      "Page.captureScreenshot",
      { format: "png" },
      sessionId,
    );
    await writeFile(
      "/tmp/obsidian-eink-test.png",
      Buffer.from(screenshot.data, "base64"),
    );
    if (!text.startsWith("PASS:")) throw new Error(text);
    return text;
  } finally {
    clearTimeout(timeout);
    await new Promise((resolve) => {
      browser.once("exit", resolve);
      if (browser.exitCode !== null) resolve();
      else browser.kill();
    });
  }
}
