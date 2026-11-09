import test from "node:test";
import assert from "node:assert/strict";
import { bindThemeToggle } from "../site.js";

test("shared theme toggle restores and persists the selected theme", () => {
  const document = { documentElement: { dataset: {} } };
  const attributes = new Map();
  const handlers = new Map();
  const values = new Map([["isobar-theme", "dark"]]);
  const button = {
    addEventListener: (name, handler) => handlers.set(name, handler),
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const preferences = {
    read: (key, fallback) => values.get(key) || fallback,
    save: (key, value) => values.set(key, value),
  };

  bindThemeToggle({ document, button, preferences });
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(attributes.get("aria-label"), "Switch to light theme");

  handlers.get("click")();
  assert.equal(document.documentElement.dataset.theme, "light");
  assert.equal(attributes.get("aria-label"), "Switch to dark theme");
  assert.equal(values.get("isobar-theme"), "light");
});
