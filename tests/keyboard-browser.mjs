import { Platform } from "./obsidian-stub.mjs";
import { AndroidKeyboardGuard } from "../src/ui/android-keyboard.ts";

export async function checkAndroidKeyboard(check, pause) {
  const previousAndroid = Platform.isAndroidApp;
  const host = document.body.createDiv();
  const editor = host.createDiv({ attr: { contenteditable: "true" } });
  const outside = document.body.createEl("textarea");
  const controls = host.createDiv({ cls: "eink-surface" });
  const control = controls.createEl("input", { type: "text" });
  const guard = new AndroidKeyboardGuard(host);
  guard.load();
  try {
    Platform.isAndroidApp = false;
    editor.focus();
    guard.setEnabled(true);
    check(document.activeElement === editor && !editor.hasAttribute("inputmode"),
      "Desktop focus and input mode are unchanged");
    Platform.isAndroidApp = true;
    guard.setEnabled(true);
    check(document.activeElement !== editor && editor.getAttribute("inputmode") === "none",
      "Android keyboard is suppressed on opening");
    const replacement = host.createDiv({ attr: { contenteditable: "true", inputmode: "text" } });
    await pause();
    check(replacement.getAttribute("inputmode") === "none", "Recreated editors inherit suppression");
    replacement.focus();
    check(document.activeElement !== replacement, "Replacement editor cannot keep focus");
    outside.focus();
    check(document.activeElement === outside && !outside.hasAttribute("inputmode"),
      "Other panes and dialogs can still accept input");
    control.focus();
    check(document.activeElement === control && !control.hasAttribute("inputmode"),
      "Toolbar controls remain usable");
    guard.setEnabled(false);
    check(!editor.hasAttribute("inputmode") && replacement.getAttribute("inputmode") === "text",
      "Closing restores original attributes exactly");
    editor.focus();
    check(document.activeElement === editor, "Editor can focus again after closing");
    guard.setEnabled(true);
    guard.unload();
    check(!editor.hasAttribute("inputmode"), "Unloading restores editor input mode");
    editor.focus();
    check(document.activeElement === editor, "Unloading removes the focus guard");
  } finally {
    guard.unload();
    host.remove();
    outside.remove();
    Platform.isAndroidApp = previousAndroid;
  }
}
