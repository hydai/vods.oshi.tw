import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare, Response as MiniflareResponse } from "miniflare";
import { createFeed, manifestUrl } from "./helpers/vod-fixture.mjs";

test("the built Worker survives an initiating client disconnect, shares data, and serves bound assets", { timeout: 20_000 }, async (t) => {
  const server = new URL("../dist/server/", import.meta.url);
  const config = JSON.parse(await readFile(new URL("wrangler.json", server), "utf8"));
  const feed = createFeed({ socialLinks: { futureProvider: "https://example.com/tester" } });
  const calls = [];
  const upstreamStarted = Promise.withResolvers();
  const releaseUpstream = Promise.withResolvers();
  const modulePaths = (await readdir(server, { recursive: true }))
    .filter((path) => /\.m?js$/.test(path));
  const modules = Object.fromEntries(await Promise.all(modulePaths.map(async (path) =>
    [path, { type: "esm", contents: await readFile(new URL(path, server), "utf8") }])));
  const runtime = new Miniflare({
    cf: false,
    workers: [{
      config: {
        type: "worker",
        name: config.name,
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        manifest: { mainModule: config.main, modulesRoot: fileURLToPath(server), modules },
        assets: {
          directory: fileURLToPath(new URL(`${config.assets.directory}/`, server)),
          hasUserWorker: true,
        },
        env: { [config.assets.binding]: { type: "assets" } },
      },
      dev: {
        outboundService: {
          type: "fetcher",
          handler: async (request) => {
            calls.push(request.url);
            upstreamStarted.resolve();
            // Hold I/O while its initiating client disconnects. Other Worker
            // requests must still receive fully consumed, validated data.
            await releaseUpstream.promise;
            const response = feed.respond(request);
            return new MiniflareResponse(await response.arrayBuffer(), {
              status: response.status,
              headers: Object.fromEntries(response.headers),
            });
          },
        },
      },
    }],
  });
  t.after(() => {
    releaseUpstream.resolve();
    return runtime.dispose();
  });

  for (const protocol of ["http:", "https:"]) {
    for (const pathname of ["/", "/_vinext/image?url=%2Fog.png&w=64"]) {
      const response = await runtime.dispatchFetch(`${protocol}//vods.oshi.tw${pathname}`, {
        method: "POST",
        redirect: "manual",
      });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "GET, HEAD");
      assert.equal(response.headers.get("location"), null);
      await response.text();
    }
  }
  assert.deepEqual(calls, [], "rejected methods must not start a dataset download");

  const controller = new AbortController();
  const disconnected = runtime.dispatchFetch("https://vods.oshi.tw/", {
    signal: controller.signal,
  }).then((response) => response.text()).catch((error) => error);
  await upstreamStarted.promise;
  const pendingPages = Promise.all(Array.from({ length: 8 }, async () => {
    const response = await runtime.dispatchFetch("https://vods.oshi.tw/", {
      headers: { accept: "text/html" },
    });
    assert.equal(response.status, 200);
    return response.text();
  }));
  controller.abort();
  const disconnectedResult = await disconnected;
  assert.equal(disconnectedResult.name, "AbortError");
  releaseUpstream.resolve();
  const pages = await pendingPages;
  pages.forEach((html) => assert.match(html, /測試歌回 VOD/));
  assert.deepEqual(calls, [manifestUrl, feed.manifest.snapshotUrl]);

  const detail = await runtime.dispatchFetch("https://vods.oshi.tw/vod/tester/abcDEF12345");
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /歌曲時間軸/);

  assert.equal(config.assets.binding, "ASSETS");
  const image = await runtime.dispatchFetch("https://vods.oshi.tw/_vinext/image?url=%2Fog.png&w=64");
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /^image\/png/);
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  const expectedImage = await readFile(new URL("../public/og.png", import.meta.url));
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), expectedImage);

  const asset = await runtime.dispatchFetch("https://vods.oshi.tw/og.png");
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
  assert.equal(asset.headers.get("x-frame-options"), "DENY");
  await asset.arrayBuffer();

  const head = await runtime.dispatchFetch("https://vods.oshi.tw/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
