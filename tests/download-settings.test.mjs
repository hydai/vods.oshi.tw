import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  DOWNLOAD_SETTINGS_STORAGE_KEY,
  detectDownloadPlatform,
  loadDownloadSettings,
  parseDownloadSettings,
  resolveDownloadPlatform,
  saveDownloadSettings,
} from "../lib/download-settings.ts";

test("parses every supported download setting combination", () => {
  for (const profile of [
    "editing-mp4",
    "quality-webm",
    "precise-reencode",
  ]) {
    for (const platform of ["auto", "windows", "macos", "linux"]) {
      assert.deepEqual(
        parseDownloadSettings(JSON.stringify({ version: 1, profile, platform })),
        { profile, platform },
      );
    }
  }
});

test("falls back safely for missing, malformed, or unknown stored settings", () => {
  for (const value of [
    null,
    "{broken",
    JSON.stringify({ version: 2, profile: "quality-webm", platform: "linux" }),
    JSON.stringify({ version: 1, profile: "audio-only", platform: "linux" }),
    JSON.stringify({ version: 1, profile: "editing-mp4", platform: "android" }),
  ]) {
    assert.deepEqual(parseDownloadSettings(value), DEFAULT_DOWNLOAD_SETTINGS);
  }
});

test("loads and saves versioned settings without exposing storage failures", () => {
  let stored = null;
  const storage = {
    getItem(key) {
      assert.equal(key, DOWNLOAD_SETTINGS_STORAGE_KEY);
      return stored;
    },
    setItem(key, value) {
      assert.equal(key, DOWNLOAD_SETTINGS_STORAGE_KEY);
      stored = value;
    },
  };

  const settings = { profile: "quality-webm", platform: "auto" };
  assert.equal(saveDownloadSettings(storage, settings), true);
  assert.deepEqual(JSON.parse(stored), { version: 1, ...settings });
  assert.deepEqual(loadDownloadSettings(storage), settings);

  const blockedStorage = {
    getItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
  };
  assert.deepEqual(
    loadDownloadSettings(blockedStorage),
    DEFAULT_DOWNLOAD_SETTINGS,
  );
  assert.equal(saveDownloadSettings(blockedStorage, settings), false);
});

test("detects desktop platforms with modern hints before legacy values", () => {
  assert.equal(
    detectDownloadPlatform({
      userAgentDataPlatform: "Windows",
      navigatorPlatform: "MacIntel",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    }),
    "windows",
  );
  assert.equal(
    detectDownloadPlatform({ navigatorPlatform: "MacIntel" }),
    "macos",
  );
  assert.equal(
    detectDownloadPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }),
    "linux",
  );
});

test("does not misidentify mobile devices or ChromeOS as desktop Linux/macOS", () => {
  for (const hints of [
    {},
    { navigatorPlatform: "Linux armv8l", userAgent: "Mozilla/5.0 Android" },
    { navigatorPlatform: "iPhone", userAgent: "Mozilla/5.0 iPhone" },
    {
      navigatorPlatform: "MacIntel",
      userAgent: "Mozilla/5.0 Macintosh",
      maxTouchPoints: 5,
    },
    { navigatorPlatform: "Linux x86_64", userAgent: "Mozilla/5.0 CrOS" },
  ]) {
    assert.equal(detectDownloadPlatform(hints), "unknown");
  }
});

test("manual platform selection overrides detection while auto preserves unknown", () => {
  assert.equal(resolveDownloadPlatform("auto", "macos"), "macos");
  assert.equal(resolveDownloadPlatform("auto", "unknown"), "unknown");
  assert.equal(resolveDownloadPlatform("windows", "macos"), "windows");
  assert.equal(resolveDownloadPlatform("linux", "windows"), "linux");
});
