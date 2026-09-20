import assert from "node:assert/strict";
import test from "node:test";

let moduleId = 0;
function freshModule(path) {
  return import(new URL(`${path}?test=${moduleId++}`, import.meta.url).href);
}

function installGlobals(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
}

function youtubeEnvironment(t) {
  const scripts = [];
  const timers = new Map();
  let timerId = 0;
  const window = {
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  const document = {
    querySelector() { return scripts.find((script) => !script.removed) ?? null; },
    createElement() {
      return new class extends EventTarget {
        remove() { this.removed = true; }
      }();
    },
    head: { append(script) { scripts.push(script); } },
  };
  installGlobals(t, { window, document });
  return { window, scripts, timers };
}

test("a failed YouTube script is removed and a fresh attempt can initialize successfully", async (t) => {
  const { window, scripts, timers } = youtubeEnvironment(t);
  let previousCalls = 0;
  const previous = () => { previousCalls++; };
  window.onYouTubeIframeAPIReady = previous;
  const { loadYouTubeApi } = await freshModule("../lib/youtube-api.ts");
  const failed = loadYouTubeApi();
  assert.equal(loadYouTubeApi(), failed);
  const rejection = assert.rejects(failed, /failed to load/);
  scripts[0].dispatchEvent(new Event("error"));
  await rejection;
  assert.equal(scripts[0].removed, true);
  assert.equal(timers.size, 0);
  assert.equal(window.onYouTubeIframeAPIReady, previous);

  const retried = loadYouTubeApi();
  assert.equal(scripts.length, 2);
  window.YT = { Player: class {} };
  window.onYouTubeIframeAPIReady();
  assert.equal(await retried, window.YT);
  assert.equal(previousCalls, 1);
  assert.equal(timers.size, 0);
  assert.equal(window.onYouTubeIframeAPIReady, previous);
});

test("a timed-out YouTube script also permits a new attempt", async (t) => {
  const { scripts, timers } = youtubeEnvironment(t);
  const { loadYouTubeApi } = await freshModule("../lib/youtube-api.ts");
  const failed = loadYouTubeApi();
  const rejection = assert.rejects(failed, /timed out/);
  [...timers.values()][0]();
  await rejection;
  assert.equal(scripts[0].removed, true);
  const retried = loadYouTubeApi();
  assert.equal(scripts.length, 2);
  const retryRejection = assert.rejects(retried, /failed to load/);
  scripts[1].dispatchEvent(new Event("error"));
  await retryRejection;
});

function themeEnvironment(t, blockedStorage = false) {
  const storage = new Map();
  const classes = new Set();
  const media = new EventTarget();
  media.matches = false;
  const window = new EventTarget();
  window.matchMedia = () => media;
  window.localStorage = {
    getItem(key) {
      if (blockedStorage) throw new Error("storage blocked");
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (blockedStorage) throw new Error("storage blocked");
      storage.set(key, value);
    },
  };
  const document = { documentElement: { classList: {
    contains: (name) => classes.has(name),
    toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
  } } };
  installGlobals(t, { window, document });
  return { storage, media, window };
}

test("theme toggles share state and system changes do not overwrite a manual preference", async (t) => {
  const stops = [];
  t.after(() => stops.forEach((stop) => stop()));
  const { storage, media, window } = themeEnvironment(t);
  const { getTheme, subscribeTheme, toggleTheme } = await freshModule("../lib/theme.ts");
  let first = 0;
  let second = 0;
  stops.push(subscribeTheme(() => { first++; }));
  stops.push(subscribeTheme(() => { second++; }));
  first = second = 0;
  toggleTheme();
  assert.equal(getTheme(), "dark");
  assert.equal(storage.get("theme"), "dark");
  assert.equal(first, 1);
  assert.equal(second, 1);
  media.dispatchEvent(new Event("change"));
  assert.equal(getTheme(), "dark");
  assert.equal(first, 1);

  storage.set("theme", "light");
  window.dispatchEvent(Object.assign(new Event("storage"), { key: "theme" }));
  assert.equal(getTheme(), "light");
  storage.delete("theme");
  window.dispatchEvent(Object.assign(new Event("storage"), { key: "theme" }));
  media.matches = true;
  media.dispatchEvent(new Event("change"));
  assert.equal(getTheme(), "dark", "removing a preference restores system following");
});

test("a manual theme still takes precedence when local storage is blocked", async (t) => {
  let stop;
  t.after(() => stop?.());
  const { media } = themeEnvironment(t, true);
  const { getTheme, subscribeTheme, toggleTheme } = await freshModule("../lib/theme.ts");
  stop = subscribeTheme(() => {});
  toggleTheme();
  media.dispatchEvent(new Event("change"));
  assert.equal(getTheme(), "dark");
});
