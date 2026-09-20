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
      socialLinks: { futureProvider: "https://example.com/tester" },
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

async function render(pathname = "/", { origin = "http://localhost", method = "GET", headers = {} } = {}) {
  const app = await worker();
  return app.fetch(
    new Request(`${origin}${pathname}`, {
      method,
      headers: { accept: "text/html", ...headers },
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

test("redirects plain-HTTP GET and HEAD visitors to HTTPS permanently", async () => {
  for (const method of ["GET", "HEAD"]) {
    const response = await render("/vod/tester/abcDEF12345?list=1", {
      origin: "http://vods.oshi.tw",
      method,
    });
    assert.equal(response.status, 301);
    assert.equal(
      response.headers.get("location"),
      "https://vods.oshi.tw/vod/tester/abcDEF12345?list=1",
    );
  }
});

test("keeps localhost HTTP for dev and stamps HSTS on responses", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("strict-transport-security") ?? "",
    /max-age=31536000/,
  );
});

test("HTML responses use fresh nonces for every inline script and disallow framing", async () => {
  const nonces = new Set();
  for (const pathname of ["/", "/vod/tester/abcDEF12345", "/does-not-exist"]) {
    const response = await render(pathname, { headers: {
      "content-security-policy": "script-src 'unsafe-inline'",
      "x-nonce": "attacker-supplied",
    } });
    const policy = response.headers.get("content-security-policy");
    const scriptPolicy = policy.split(";").find((part) => part.trim().startsWith("script-src "));
    const nonce = /'nonce-([a-f0-9]{32})'/.exec(scriptPolicy)?.[1];
    assert.ok(nonce);
    assert.doesNotMatch(scriptPolicy, /unsafe-inline|unsafe-eval|attacker-supplied/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    assert.match(policy, /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.ok(!nonces.has(nonce), "each response must receive a new nonce");
    nonces.add(nonce);
    const html = await response.text();
    const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attributes]) => !/\bsrc=/.test(attributes));
    assert.ok(inlineScripts.length > 1, "check both the theme bootstrap and RSC scripts");
    for (const [, attributes] of inlineScripts) {
      assert.ok(attributes.includes(`nonce="${nonce}"`), `missing CSP nonce: ${attributes}`);
    }
  }
});

test("forwarded host headers cannot change social image URLs", async () => {
  const response = await render("/", { headers: {
    "x-forwarded-host": "attacker.example",
    "x-forwarded-proto": "http",
  } });
  const html = await response.text();
  assert.match(html, /content="https:\/\/vods\.oshi\.tw\/og\.png"/);
  assert.doesNotMatch(html, /attacker\.example/);
});

test("the read-only site rejects unsupported methods on HTTP and HTTPS before redirects or routing", async () => {
  for (const origin of ["http://localhost", "http://vods.oshi.tw", "https://vods.oshi.tw"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await render("/", { origin, method });
      assert.equal(response.status, 405, `${method} ${origin}`);
      assert.equal(response.headers.get("allow"), "GET, HEAD");
      assert.equal(response.headers.get("location"), null);
    }
  }
});

test("server-renders the searchable VOD archive", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /快速找到，想再聽一次的歌/);
  assert.match(html, /src="\/apple-icon\.png"/);
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
  assert.match(html, /複製「第一首歌」的影片片段下載指令/);
  assert.match(html, /下載指令設定/);
  assert.match(html, /剪輯相容 MP4/);
  assert.match(html, /高畫質 WebM/);
  assert.match(html, /較精準切點/);
  assert.match(html, /目前複製剪輯相容的 MP4 快速切片/);

  const playButton = html.indexOf('class="song-row"');
  const playButtonEnd = html.indexOf("</button>", playButton);
  const commandButton = html.indexOf(
    'class="song-command-button"',
    playButtonEnd,
  );
  assert.ok(playButton >= 0 && playButtonEnd > playButton);
  assert.ok(
    commandButton > playButtonEnd,
    "the command action must be a sibling, not nested inside the play button",
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
