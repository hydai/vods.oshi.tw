import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const snapshot = JSON.stringify({
  schemaVersion: "1.0.0",
  streamers: [
    {
      slug: "tester",
      displayName: "測試歌姬",
      youtubeChannelId: "test-channel",
      avatarUrl: null,
      group: null,
      socialLinks: {},
      vods: [
        {
          title: "測試歌回 VOD",
          date: "2026-07-01",
          videoId: "abcDEF12345",
          performances: [
            {
              performanceId: "performance-1",
              songId: "song-1",
              title: "第一首歌",
              originalArtist: null,
              startSeconds: 65,
              endSeconds: 245,
            },
          ],
        },
      ],
    },
  ],
});
const hash = createHash("sha256").update(snapshot).digest("hex");
const manifest = JSON.stringify({
  schemaVersion: "1.0.0",
  snapshotUrl: `https://data.oshi.tw/vod/v1/snapshots/${hash}.json`,
  sha256: hash,
  publishedAt: "2026-07-12T00:00:00.000Z",
  uncompressedBytes: Buffer.byteLength(snapshot),
  counts: { streamers: 1, vods: 1, performances: 1 },
});

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (init?.redirect === "error") {
    throw new TypeError(
      'Invalid redirect value, must be one of "follow" or "manual"',
    );
  }
  if (init?.cache && !["no-store", "no-cache"].includes(init.cache)) {
    throw new TypeError(`Unsupported cache mode: ${init.cache}`);
  }
  const url = typeof input === "string" ? input : input.url;
  if (url === "https://data.oshi.tw/vod/v1/manifest.json") {
    return new Response(manifest, {
      headers: { "content-type": "application/json" },
    });
  }
  if (url === `https://data.oshi.tw/vod/v1/snapshots/${hash}.json`) {
    return new Response(snapshot, {
      headers: { "content-type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

async function render(pathname = "/") {
  const app = await worker();
  return app.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the searchable VOD archive", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /快速找到，想再聽一次的歌/);
  assert.match(html, /測試歌回 VOD/);
  assert.match(html, /第一首歌/);
  assert.match(html, /搜尋 VOD、VTuber、歌曲或原唱/);
  assert.match(html, /href="\/vod\/tester\/abcDEF12345"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("server-renders VOD songs as inline playback buttons", async () => {
  const response = await render("/vod/tester/abcDEF12345");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /測試歌回 VOD/);
  assert.match(html, /測試歌姬/);
  assert.match(html, /歌曲時間軸/);
  assert.match(html, /第一首歌/);
  assert.match(
    html,
    /<button\b(?=[^>]*\btype="button")(?=[^>]*\bclass="[^"]*\bsong-row\b[^"]*")[^>]*>/,
  );
  assert.doesNotMatch(
    html,
    /watch\?v=abcDEF12345(?:&amp;|&)t=65s/,
    "song rows must not navigate to timestamped YouTube watch pages",
  );
});

test("inline YouTube player bounds playback and cleans up resources", async () => {
  const source = await readFile(
    new URL("../app/components/InlineYouTubePlayer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /loadVideoById\s*\(\s*\{[\s\S]*?startSeconds\s*:[\s\S]*?endSeconds\s*:/,
    "segments must pass absolute start and end times through loadVideoById object syntax",
  );
  assert.match(
    source,
    /getCurrentTime\s*\(\s*\)/,
    "a current-time watchdog must guard the segment boundary",
  );
  assert.match(
    source,
    /pauseVideo\s*\(\s*\)/,
    "the watchdog must pause playback at the selected song's end",
  );
  assert.match(source, /(?:window\.)?setInterval\s*\(/);
  assert.match(
    source,
    /(?:window\.)?clearInterval\s*\(/,
    "the end watchdog interval must be cleared",
  );
  assert.match(
    source,
    /\.destroy\s*\(\s*\)/,
    "the YouTube player must be destroyed when its component unmounts",
  );
  assert.match(
    source,
    /onAutoplayBlocked\s*:/,
    "blocked autoplay must be surfaced instead of silently appearing to play",
  );
});

test("removes the disposable starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview", root)));
});
