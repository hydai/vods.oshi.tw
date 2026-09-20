import assert from "node:assert/strict";
import test from "node:test";
import { createVodDatasetLoader, makeVodCards } from "../lib/vod-data.ts";
import { createFeed, manifestUrl } from "./helpers/vod-fixture.mjs";

test("concurrent cold requests share one fully consumed dataset download", async () => {
  const feed = createFeed();
  const calls = [];
  const backgroundTasks = [];
  const load = createVodDatasetLoader({
    fetcher: async (url, init) => {
      calls.push(url);
      assert.equal(init.redirect, "manual");
      return feed.respond(url);
    },
  });
  const results = await Promise.all(Array.from({ length: 25 }, () =>
    load((task) => backgroundTasks.push(task))));
  assert.deepEqual(calls, [manifestUrl, feed.manifest.snapshotUrl]);
  assert.equal(backgroundTasks.length, 1);
  results.forEach((result) => assert.equal(result, results[0]));
  assert.deepEqual(results[0].snapshot, feed.snapshot);
  await Promise.all(backgroundTasks);
});

test("cold failures respect the retry delay even without cached data", async () => {
  let now = 0;
  let calls = 0;
  const load = createVodDatasetLoader({
    now: () => now,
    fetcher: async () => {
      calls++;
      throw new Error("upstream unavailable");
    },
  });
  for (let index = 0; index < 3; index++) {
    await assert.rejects(load(), /upstream unavailable/);
  }
  assert.equal(calls, 1);
  now = 15_000;
  await assert.rejects(load(), /upstream unavailable/);
  assert.equal(calls, 2);
});

test("a stalled fetch is aborted by the download deadline", async () => {
  let aborted = false;
  const load = createVodDatasetLoader({
    timeoutMs: 20,
    fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
  });
  await assert.rejects(load(), /download timed out/);
  assert.equal(aborted, true);
});

test("invalid response headers abort the unread body instead of leaving I/O open", async () => {
  for (const options of [
    { headers: { "content-type": "text/html" } },
    { status: 503, headers: { "content-type": "application/json" } },
  ]) {
    let cancelled = false;
    let requestSignal;
    const load = createVodDatasetLoader({
      fetcher: async (_url, { signal }) => {
        requestSignal = signal;
        const response = new Response(new ReadableStream({
          cancel() { cancelled = true; },
        }), options);
        // Model fetch's connection between its signal and the response body.
        signal.addEventListener("abort", () => { void response.body.cancel(); }, { once: true });
        return response;
      },
    });
    await assert.rejects(load(), /not JSON|HTTP 503/);
    assert.equal(requestSignal.aborted, true);
    assert.equal(cancelled, true);
  }
});

test("expired data is served immediately while a stalled body times out in the background", async (t) => {
  t.mock.method(console, "error", () => {});
  const feed = createFeed();
  let now = 0;
  let stalled = false;
  let cancelled = false;
  let calls = 0;
  const load = createVodDatasetLoader({
    now: () => now,
    timeoutMs: 20,
    fetcher: async (url) => {
      calls++;
      if (!stalled) return feed.respond(url);
      return new Response(new ReadableStream({
        cancel() { cancelled = true; },
      }), { headers: { "content-type": "application/json" } });
    },
  });
  const original = await load();
  now = 60_000;
  stalled = true;
  const backgroundTasks = [];
  assert.equal(await load((task) => backgroundTasks.push(task)), original);
  assert.equal(cancelled, false, "the visitor must not wait for the deadline");
  assert.equal(await load((task) => backgroundTasks.push(task)), original);
  assert.equal(backgroundTasks.length, 1);
  await Promise.all(backgroundTasks);
  assert.equal(cancelled, true);
  assert.equal(await load(), original);
  assert.equal(calls, 3, "failed background refresh must also respect backoff");
});

test("invalid calendar timestamps cannot enter the cache, including the same-hash path", async (t) => {
  t.mock.method(console, "error", () => {});
  let feed = createFeed({ publishedAt: "2026-99-99T00:00:00.000Z" });
  let now = 0;
  const load = createVodDatasetLoader({
    now: () => now,
    fetcher: async (url) => feed.respond(url),
  });
  await assert.rejects(load(), /valid canonical UTC timestamp/);
  now = 15_000;
  feed = createFeed();
  const valid = await load();
  now += 60_000;
  feed = createFeed({ publishedAt: "2026-02-29T00:00:00.000Z" });
  assert.equal(await load(), valid);
  now += 15_000;
  feed = createFeed({ publishedAt: "2026-09-21T00:00:00.000Z" });
  const updated = await load();
  assert.equal(updated.snapshot, valid.snapshot);
  assert.equal(updated.manifest.publishedAt, "2026-09-21T00:00:00.000Z");
});

test("same-hash metadata mismatches and older snapshots preserve validated data", async (t) => {
  t.mock.method(console, "error", () => {});
  let feed = createFeed();
  let now = 0;
  const load = createVodDatasetLoader({ now: () => now, fetcher: async (url) => feed.respond(url) });
  const original = await load();
  now += 60_000;
  feed = createFeed();
  feed.manifest.counts.vods++;
  assert.equal(await load(), original);
  now += 15_000;
  feed = createFeed({ publishedAt: "2026-09-19T00:00:00.000Z", songTitle: "較舊的歌曲" });
  assert.equal(await load(), original);
});

test("unknown social providers are stripped and supported providers still enforce their host allowlist", async () => {
  const feed = createFeed({ socialLinks: {
    youtube: "https://www.youtube.com/@tester",
    futureProvider: "https://example.com/tester",
  } });
  const dataset = await createVodDatasetLoader({ fetcher: async (url) => feed.respond(url) })();
  assert.deepEqual(dataset.snapshot.streamers[0].socialLinks, {
    youtube: "https://www.youtube.com/@tester",
  });
  const unsafe = createFeed({ socialLinks: { youtube: "https://example.com/tester" } });
  await assert.rejects(
    createVodDatasetLoader({ fetcher: async (url) => unsafe.respond(url) })(),
    /unsupported URL/,
  );
});

test("integrity and redirect checks still reject invalid upstream responses", async () => {
  const feed = createFeed();
  await assert.rejects(createVodDatasetLoader({ fetcher: async (url) =>
    url === manifestUrl ? feed.respond(url) : new Response(feed.snapshotText.replace("第一首歌", "第二首歌"), {
      headers: { "content-type": "application/json" },
    }),
  })(), /hash does not match/);
  await assert.rejects(createVodDatasetLoader({ fetcher: async () =>
    new Response(null, { status: 302, headers: { location: "https://example.com" } }),
  })(), /HTTP 302/);
});

test("derived cards are reused per validated snapshot and change when the snapshot changes", async () => {
  const feed = createFeed();
  const dataset = await createVodDatasetLoader({ fetcher: async (url) => feed.respond(url) })();
  assert.equal(makeVodCards(dataset), makeVodCards({ ...dataset }));
  const newer = createFeed({ songTitle: "更新歌曲" });
  const next = await createVodDatasetLoader({ fetcher: async (url) => newer.respond(url) })();
  assert.notEqual(makeVodCards(next), makeVodCards(dataset));
  assert.match(makeVodCards(next)[0].searchText, /更新歌曲/);
});
