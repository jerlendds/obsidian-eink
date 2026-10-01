import type { MarkdownView } from "obsidian";
import type { EditorView } from "@codemirror/view";

interface PreviewSection { el: HTMLElement; lineStart: number; lineEnd: number }

/**
 * Fill a blank line with the text, or insert it as new lines after a non-blank one,
 * so recognized text lands where it was written without splitting existing lines.
 */
export function insertAtLine(lines: string[], index: number, text: string): string[] {
  const target = Math.max(0, Math.min(index, lines.length - 1));
  const result = [...lines];
  if (!result[target]?.trim()) result.splice(target, 1, ...text.split("\n"));
  else result.splice(target + 1, 0, ...text.split("\n"));
  return result;
}

/** The 0-based note line drawn under a vertical ink position, or the last line past the end. */
function lineAtInk(view: MarkdownView, scroller: HTMLElement, y: number): number {
  const clientY = y - scroller.scrollTop + scroller.getBoundingClientRect().top;
  // Obsidian exposes CodeMirror and preview sections only internally; fall back to the end.
  if (view.getMode() === "source") {
    const cm = (view.editor as unknown as { cm?: EditorView }).cm;
    if (!cm) return view.editor.lastLine();
    const height = clientY - cm.documentTop;
    if (height > cm.contentHeight) return view.editor.lastLine();
    return cm.state.doc.lineAt(cm.lineBlockAtHeight(Math.max(0, height)).from).number - 1;
  }
  const sections = (view.previewMode as unknown as { renderer?: { sections?: PreviewSection[] } })
    .renderer?.sections ?? [];
  // Ink above every rendered block goes at the top; with no sections known, at the end.
  let line = sections.length ? 0 : Number.MAX_SAFE_INTEGER;
  for (const section of sections) {
    if (!section.el.isConnected || section.el.getBoundingClientRect().top > clientY) continue;
    // A section starting above the ink: write on the line after its block.
    line = section.lineEnd + 1;
  }
  return line;
}

/** Insert recognized text into the note at the ink's position. */
export async function insertRecognizedText(view: MarkdownView, scroller: HTMLElement, top: number, text: string): Promise<void> {
  const index = lineAtInk(view, scroller, top);
  if (view.getMode() === "source") {
    // Editor edits keep the cursor and join the editor's own undo history.
    const editor = view.editor;
    const target = Math.min(index, editor.lastLine());
    const current = editor.getLine(target);
    if (!current.trim()) editor.replaceRange(text, { line: target, ch: 0 }, { line: target, ch: current.length });
    else editor.replaceRange(`\n${text}`, { line: target, ch: current.length });
    return;
  }
  if (!view.file) throw new Error("The note has no file");
  await view.app.vault.process(view.file, (data) => insertAtLine(data.split("\n"), index, text).join("\n"));
}
