# Eink

Pressure-sensitive drawing tools for Markdown pages in Obsidian, designed for use on a BOOX e-ink device. Works locally with a stylus or mouse; finger drawing is optional.

## Features

- [x] A draggable toolbar that can be opened and closed on Markdown pages.
  - [x] A **+ pen** button that appends a new, independently configurable pen.
  - [x] A default black pen with **1.75 mm** width, a **0.1–4 mm** slider, a tapered width guide, and a live width preview.
  - [x] Red, black, green, blue, yellow, light green, and three gray shades.
  - [x] Pressure sensitivity, defaulting to **30%**.
  - [x] **Pen**, **Calligraphy**, **Fountain**, **Brush**, **Ballpoint**, **Pencil**, and **Marker** drawing styles.
  - [x] An eraser that selects on the first click and opens its settings on a second click, with a width slider and **Stroke**, **Lasso**, and **Pixel** modes. Pixel is the default.
  - [x] Backward/forward history buttons for undo and redo.
- [x] Optional thin black ruled lines, spaced to the note’s text line height.
- [x] Closed shapes held for 1.5 seconds select ink, with undoable selection and deletion.
- [x] Offline handwriting-to-text (**OCR**) for selected ink, inserted into the note where you wrote.
- [x] Accelerated scribble-to-erase gestures, with an adjustable threshold and undo.
- [x] Per-note saved ink, saved pen presets, and a saved toolbar position.
- [x] A hand tool for scrolling, selecting text, and editing the underlying note.

## Use

1. Open a Markdown note in reading view or the editor.
2. Select the pen ribbon icon or run **Eink: Toggle drawing toolbar** from the command palette.
3. Draw with a stylus or the primary mouse button. Select **Add pen** to create another preset. Select an already selected pen to open or close its settings.
4. Select **Eraser** to erase, then select it again to change its width or mode:
   - **Pixel** removes just the ink under the eraser, leaving the rest of each stroke intact.
   - **Stroke** removes whole strokes touched by the eraser.
   - **Lasso** removes strokes inside or crossing a loop; the loop closes when you lift the pen. It needs at least three points.
5. Select **Undo ink** or **Redo ink**. These commands are also available in the command palette, so you can assign hotkeys without replacing the editor's text undo.
6. Swipe with two fingers to scroll while the toolbar is open, including with the hand tool selected. Scrolling stops when either finger lifts. Mouse-wheel and trackpad scrolling also work. Select the hand tool to interact with or edit the underlying note.
7. Drag the dotted handle to move the toolbar. A focused handle also accepts arrow keys. Close with **×** or the toggle command; closing hides the toolbar and stops drawing input; ink stays visible on the page. On Android, opening the toolbar dismisses the note keyboard and prevents editor focus from reopening it until the toolbar closes.

Enable **Settings → Eink → Vertical toolbar** to stack the tools vertically. The toolbar has fully rounded ends in either orientation, and tool settings open beside the vertical bar.

In **Settings → Eink**, enable **Draw with touch** to draw with a finger, or reset the toolbar position. By default, two fingers scroll and the stylus draws. Touches that begin while the pen is down are ignored to reduce palm interference. With finger drawing enabled, one finger draws and two fingers scroll.

## Ruled lines

Select **Toggle ruled lines** on the drawing toolbar, or enable **Settings → Eink → Ruled lines**, to show thin black horizontal writing guides. The preference is saved and applies across Markdown panes. Rules stay visible with the toolbar closed, scroll with the page, and extend through the blank writing area.

Spacing follows the computed body text line height in the current reading/editor view and updates with font-size and theme changes. If the theme uses `line-height: normal`, spacing falls back to 1.5 times the font size. This is a uniform writing guide, not a separate baseline for every heading or paragraph. Rules are a separate visual layer beneath ink: they do not change Markdown, become selected, get erased, or consume undo steps. Changing their spacing does not resize existing ink.

## Circle to select

With a pen selected, draw one continuous closed shape around existing ink, then keep the pen or finger down at the endpoint for **1.5 seconds**. Circles, ovals, and other closed shapes work at any drawing speed. The shape disappears and one dashed bounding box appears around the selected ink, before you lift. Strokes enclosed by or crossing the shape are selected; pixel-erasure masks are not selectable.

Drag inside the bounding box with **one finger** to reposition the selected ink, even when **Draw with touch** is off. The box and ink move together. Adding a second finger cancels the move and scrolls instead. Moving is saved as one undo step.

Select **Undo ink** (the back arrow) to undo the selection and restore the exact stroke you drew. Another undo removes that stroke. **Delete selection** removes the selected ink; undo restores it. **Deselect** or Escape clears the bounding box.

Lifting before 1.5 seconds keeps the shape as ordinary ink. Moving more than 4 CSS pixels restarts the hold; opening the shape cancels it. Shapes must be nearly closed and at least 24 CSS pixels across both dimensions. Shapes around blank space remain ink. Disable **Settings → Eink → Circle to select** to turn recognition off. BOOX's native preview may clear after its normal repaint delay.

## Convert handwriting to text

Select ink with a closed shape (see **Circle to select**), then select **OCR**. The selected ink is recognized line by line, the text is inserted into the note at the line under the top of the selection, and the ink is removed. If that line is blank, the text fills it; otherwise the text goes on new lines after it. In reading view the text goes after the rendered block above the ink. **Undo ink** restores the strokes; the inserted text is undone separately with the editor's undo.

Recognition runs entirely on the device; no ink or text leaves it. It uses a small (245,000 parameter) stroke-based model that reads pen movement rather than an image, so it needs no WebAssembly or downloads and adds about 650 KB to `main.js`. Expect roughly 70–80% of characters to be right on everyday English handwriting; check the result. It recognizes English letters, digits and common punctuation (`!"#&'()*+,-./:;?[]`), not other scripts or math notation. On a BOOX Note Air5 C a three-word line takes about 0.25 seconds (0.5 seconds the first time, while the model loads).

The model and weights are from [OnlineHTR](https://github.com/PellelNitram/OnlineHTR) (MIT License, Copyright (c) 2024 Martin Lellep), an implementation of Carbune et al., *Fast multi-language LSTM-based online handwriting recognition* (2020), trained on IAM-OnDB. `scripts/export-htr-weights.py` converts its checkpoint into `src/ocr/htr-weights.bin`.

## Scribble to erase

With a pen tool selected, quickly scratch back and forth over old ink at least four times, then lift. Keep scribbling for as many passes as you need; you can finish on either side. A qualifying gesture removes **whole strokes it crosses**, including all crossed strokes in that gesture. The scratch itself is discarded. **Undo ink** restores the entire erase in one step.

Recognition requires **at least three** consecutive accelerating direction reversals in a compact run, with sweeps of at least 12 CSS pixels, at least 80 CSS pixels of movement, and at least 120 ms for that run. There is no maximum reversal count or overall gesture duration; additional passes and a pause before lifting do not invalidate a qualifying run. The default minimum acceleration is **15,000 CSS pixels/second²**, calculated from the change in average sweep velocity. Slow zigzags, tiny jitter, and strokes progressing across the page stay as ink. A scratch over blank space also stays as ink. Recognition occurs on lift; a canceled gesture erases nothing.

Use **Settings → Eink → Scribble to erase** to disable recognition, or raise **Scribble acceleration** if your handwriting triggers it accidentally. Lower it if deliberate scratch-outs are difficult to trigger. The default is a starting point that needs calibration with your BOOX pen; recognition is heuristic, so fast repeated handwriting can still resemble an erase gesture. BOOX's native black preview may remain visible until its normal repaint handoff.

## Storage and behavior

- Drawings and settings are saved in this plugin's `data.json` inside the vault's configuration folder. Markdown contents are not modified. No network requests, telemetry, or external services are used.
- Drawings follow note and folder renames performed in Obsidian. Deleting a note removes its saved drawing. Include plugin data in your backups; copying a Markdown file alone does not copy its ink.
- Ink uses page coordinates and follows scrolling. It is **not anchored to text**: changing the note's contents, font size, pane width, or reading/editing mode can change alignment. Use a consistent layout when annotating.
- Saved ink stays visible in every open Markdown pane while the plugin is enabled, including after startup and with the toolbar closed. Only the active pane receives the drawing toolbar. Switching notes restores each note's drawing. Other file types are not supported.
- Ink is stored in page coordinates, so marks drawn before and after scrolling stay at their original page positions. Blank writing space extends as you approach the bottom of the note. On reopening, the page expands far enough to reach saved ink. This does not add blank lines or other changes to the Markdown file.
- Each note retains up to 100 undo steps during the plugin session. The resulting drawing survives reloads; undo/redo history does not.
- Widths are CSS millimeters (`96 / 25.4` pixels per millimeter). Display scaling may change their physical size. Pressure varies stroke width around the chosen size; mouse and finger input use a neutral pressure. Styles are lightweight canvas approximations: angled calligraphy, pressure-varying fountain/brush strokes, thinner ballpoint, textured pencil, and translucent marker.
- This is a standard canvas plugin, not a native BOOX low-latency ink integration. Actual device pressure, palm behavior, and e-ink refresh latency still need hardware testing.

## Development

Use Node.js 18+ and npm:

```sh
npm install
npm run dev
```

Build and check:

```sh
npm run build
npm run lint
npm test
npm run test:browser
```

The browser test requires Chromium on `PATH`, or a `CHROMIUM` environment variable pointing to its executable. It runs real canvas rendering with a minimal Obsidian API adapter, checks toolbar interactions and all eraser modes, and writes a screenshot to `/tmp/obsidian-eink-test.png`. Core tests cover history, pressure, geometry, settings validation, serialized persistence, and rename/delete behavior. These tests supplement testing inside Obsidian; they do not emulate BOOX hardware. The current API dependency uses the classic settings tab; lint may report a settings-search advisory for newer Obsidian versions.

## Drawing performance

Strokes are drawn as curves through the midpoints between pen samples, so fast writing, which produces fewer samples, stays round instead of showing angled corners. The last half-segment of a stroke appears when you lift the pen.

Pen and pixel-eraser input paints new segments immediately, without waiting for an animation frame. The canvas retains completed ink, so extending a stroke does not replay the page or earlier portions of that stroke. Committing ordinary strokes preserves the existing bitmap. A low-latency canvas hint is enabled where supported by the WebView.

Scrolling, resizing, undo, canceled strokes, and selection edits rebuild the bitmap when needed; saved strokes outside the viewport are skipped. Whole-stroke and lasso eraser previews remain frame-batched. Shape-hold recognition processes only newly added points, and page sizing caches completed stroke extents. These changes reduce app rendering work; BOOX's native preview and post-lift refresh delay still depend on the device configuration.

The browser suite compares incremental output pixel-for-pixel against full replay for every pen style and pixel erasing. It also verifies that extending a 2,000-point live stroke over 20,000 saved points draws one new segment without clearing the canvas. This is a rendering-work check, not a measurement of physical e-ink latency.

## BOOX development over ADB

Connect the tablet with USB debugging authorized, then run:

```sh
npm run dev:boox
```

The script watches `src/**/*.ts`, `styles.css`, and `manifest.json`; type-checks and builds changes; and syncs to `/sdcard/Documents/Notebooks/Ink/.obsidian/plugins/sample-plugin/`. Failed builds leave the installed bundle in place. Files are staged before publishing, with a reload marker published last. The script leaves `data.json` and the enabled-plugin list alone.

After the first upload, enable **Eink** in **Settings → Community plugins** on the tablet. If a regular build was already enabled, toggle it off and on once. Keep Obsidian open in the **Ink** vault. The development bundle polls the marker, saves ink, and reloads itself. The terminal reports when the new build confirms it has loaded. Automatic reloading uses Obsidian's internal plugin manager; if that API changes or a new build fails to load, fix the code and toggle the plugin manually. Production builds exclude this development hook.

```sh
npm run dev:boox -- --once
npm run dev:boox -- --serial ed7da93f
npm run dev:boox -- --config-dir /sdcard/AnotherVault/.obsidian
npm run dev:boox -- --help
```

`ANDROID_SERIAL` also selects a device; `ADB` can point to a custom executable. Without a serial, exactly one authorized device must be connected. Stop watching with **Ctrl+C**. Restart the watcher after editing build configuration or changing the plugin ID. ADB development builds are staged in a temporary local directory, so they do not replace the normal local release bundle.

For the reviewed BOOX handwriting configuration, see [the configuration notes](docs/boox-configuration.md).

## Manual installation

1. Run `npm run build`.
2. Copy `main.js`, `manifest.json`, and `styles.css` into `<Vault>/.obsidian/plugins/sample-plugin/`.
3. Reload Obsidian, then enable **Eink** in **Settings → Community plugins**.

The existing manifest ID, `sample-plugin`, is preserved to avoid changing the plugin's identity. Generated `main.js` and `node_modules/` are ignored by version control.

# BOOX configuration

Change the supplied `md.obsidian` app profile via [Onyx (BOOX) MMKV Editor](https://github.com/l-althueser/OnyxMMKVEditor) to `onyx.mmkv.json`, for a rooted Note Air 5 C for optimizing this plugin.

In particular, `repaintLatency` changes to `150`, `strokeWidth` is 4, some false values are set to true. 

## Handwriting compatibility

The configured `com.getcapacitor.CapacitorWebView` is the reported Obsidian view key. Handwriting enable flags and the fixed black native stroke are already populated. `repaintLatency` controls the post-pen-lift handoff from native preview to the app's rendered line; it is not the plugin's pointer sampling rate. See the [firsthand handwriting-optimization notes](https://gist.github.com/calliecameron/b3c62c601d255630468bd493380e3b7e).

## Applying the app entry later

This JSON is one app profile, not an MMKV database image. The MMKV editor documents changing app configurations in `/onyxconfig/mmkv/onyx_config` and rebooting afterward. Use its app-profile editing path for `md.obsidian`; do not replace the binary MMKV file with this JSON. See [OnyxMMKVEditor](https://github.com/l-althueser/OnyxMMKVEditor).

