// Minimal Obsidian lifecycle/DOM adapter. Canvas and pointer dispatch use Chromium.
export class Component {
  children = [];
  cleanup = [];
  loaded = false;
  load() {
    if (this.loaded) return;
    this.loaded = true;
    this.onload?.();
    this.children.forEach((child) => child.load());
  }
  unload() {
    if (!this.loaded) return;
    this.loaded = false;
    this.onunload?.();
    this.children.forEach((child) => child.unload());
    this.cleanup
      .splice(0)
      .reverse()
      .forEach((fn) => fn());
  }
  addChild(child) {
    this.children.push(child);
    if (this.loaded) child.load();
    return child;
  }
  removeChild(child) {
    child.unload();
    this.children = this.children.filter((entry) => entry !== child);
    return child;
  }
  register(fn) {
    this.cleanup.push(fn);
  }
  registerDomEvent(el, type, fn, options) {
    el.addEventListener(type, fn, options);
    this.register(() => el.removeEventListener(type, fn, options));
  }
  registerEvent(ref) {
    this.register(() => ref.off());
  }
}
export class PluginSettingTab {}
export class Setting {}
export class Notice {
  constructor(message) {
    globalThis.notices ??= [];
    globalThis.notices.push(message);
  }
}
export class MarkdownView {}
export class Plugin extends Component {}
export function setIcon(el, icon) {
  el.dataset.icon = icon;
  el.textContent =
    {
      "pen-tool": "✎",
      eraser: "▱",
      plus: "+",
      "undo-2": "↶",
      "redo-2": "↷",
      hand: "☞",
      x: "×",
      "grip-vertical": "⠿",
    }[icon] ?? icon;
}
export function installDom() {
  Object.defineProperty(HTMLElement.prototype, "win", {
    get() {
      return this.ownerDocument.defaultView;
    },
  });
  HTMLElement.prototype.createEl = function (tag, options = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    for (const key of ["type", "value"])
      if (options[key]) el[key] = options[key];
    for (const [key, value] of Object.entries(options.attr ?? {}))
      el.setAttribute(key, value);
    this.append(el);
    return el;
  };
  HTMLElement.prototype.createDiv = function (options) {
    return this.createEl("div", options);
  };
  HTMLElement.prototype.createSpan = function (options) {
    return this.createEl("span", options);
  };
  HTMLElement.prototype.empty = function () {
    this.replaceChildren();
  };
  HTMLElement.prototype.setText = function (text) {
    this.textContent = text;
  };
  HTMLElement.prototype.addClass = function (cls) {
    this.classList.add(cls);
  };
  HTMLElement.prototype.removeClass = function (cls) {
    this.classList.remove(cls);
  };
  HTMLElement.prototype.toggleClass = function (cls, enabled) {
    this.classList.toggle(cls, enabled);
  };
  HTMLElement.prototype.setCssProps = function (props) {
    for (const [key, value] of Object.entries(props))
      this.style.setProperty(key, value);
  };
  // Synthetic PointerEvents cannot acquire native pointer capture.
  HTMLElement.prototype.setPointerCapture = function (id) {
    this.capture = id;
  };
  HTMLElement.prototype.hasPointerCapture = function (id) {
    return this.capture === id;
  };
  HTMLElement.prototype.releasePointerCapture = function () {
    delete this.capture;
  };
}

export const Platform = { isAndroidApp: false };
