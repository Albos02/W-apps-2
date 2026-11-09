// Only the DOM surface used by the views: no layout engine or browser globals.
const decode = (text) =>
  text.replace(
    /&(amp|lt|gt|quot|#39|nbsp);/g,
    (_, name) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " })[name],
  );
const dataKey = (name) =>
  name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());

class Element {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.ownerDocument = document;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.className = "";
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force = !this.classList.contains(name)) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force) names.add(name);
        else names.delete(name);
        this.className = [...names].join(" ");
        return force;
      },
      add: (...names) =>
        names.forEach((name) => this.classList.toggle(name, true)),
      remove: (...names) =>
        names.forEach((name) => this.classList.toggle(name, false)),
    };
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") this.className = String(value);
    if (name.startsWith("data-")) this.dataset[dataKey(name)] = String(value);
    if (name === "hidden") this.hidden = true;
  }
  getAttribute(name) {
    return name === "class" ? this.className : (this.attributes[name] ?? null);
  }
  appendChild(child) {
    if (child.parentElement) {
      const siblings = child.parentElement.children;
      siblings.splice(siblings.indexOf(child), 1);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  set innerHTML(html) {
    this.children.forEach((child) => {
      if (typeof child !== "string") child.parentElement = null;
    });
    this.children = [];
    this.html = html;
    const stack = [this];
    for (const token of html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) ||
      []) {
      if (token.startsWith("<!")) continue;
      if (token.startsWith("</")) {
        stack.pop();
        continue;
      }
      const parent = stack.at(-1);
      if (!token.startsWith("<")) {
        parent.children.push(decode(token));
        continue;
      }
      const tag = token.match(/^<([\w-]+)/)[1];
      const child = this.ownerDocument.createElement(tag);
      for (const match of token
        .slice(tag.length + 1)
        .matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g)) {
        child.setAttribute(
          match[1],
          decode(match[2] ?? match[3] ?? match[4] ?? ""),
        );
      }
      parent.appendChild(child);
      if (
        !token.endsWith("/>") &&
        !["input", "meta", "link", "br", "hr"].includes(tag)
      )
        stack.push(child);
    }
  }
  get innerHTML() {
    return this.html || "";
  }
  set textContent(text) {
    this.children = [String(text)];
    this.html = "";
  }
  get textContent() {
    return this.children
      .map((child) => (typeof child === "string" ? child : child.textContent))
      .join("");
  }
  matches(selector) {
    return selector.split(",").some((part) => {
      const tag = part.match(/^[\w-]+/)?.[0];
      if (tag && tag !== this.tagName) return false;
      for (const [, name] of part.matchAll(/\.([\w-]+)/g)) {
        if (!this.classList.contains(name)) return false;
      }
      for (const [, name, value] of part.matchAll(
        /\[([\w-]+)(?:="([^"]*)")?\]/g,
      )) {
        const actual = name.startsWith("data-")
          ? this.dataset[dataKey(name)]
          : this.getAttribute(name);
        if (actual == null || (value !== undefined && actual !== value))
          return false;
      }
      return true;
    });
  }
  querySelectorAll(selector) {
    return this.children
      .filter((child) => typeof child !== "string")
      .flatMap((child) => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) {
    return this.matches(selector)
      ? this
      : this.parentElement?.closest(selector) || null;
  }
  contains(node) {
    return (
      node === this ||
      this.children.some(
        (child) => typeof child !== "string" && child.contains(node),
      )
    );
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, properties = {}) {
    const event = { target: this, preventDefault() {}, ...properties };
    for (let node = this; node; node = node.parentElement) {
      for (const listener of node.listeners.get(type) || []) listener(event);
    }
  }
  click() {
    this.dispatch("click");
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  blur() {
    this.ownerDocument.activeElement = null;
  }
  select() {}
  scrollIntoView(options) {
    this.scrolled = options;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 700, height: 250 };
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

export function createDOM(html) {
  const document = new Element("document");
  document.ownerDocument = document;
  document.createElement = (tag) => new Element(tag, document);
  document.getElementById = (id) =>
    document
      .querySelectorAll("[id]")
      .find((node) => node.getAttribute("id") === id) || null;
  document.innerHTML = html;
  document.documentElement = document.querySelector("html");
  const timers = [];
  const window = {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback) => callback(),
    setInterval: () => 1,
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: (id) => {
      if (id > 0 && id <= timers.length) timers[id - 1] = () => {};
    },
  };
  return { document, window, timers };
}
