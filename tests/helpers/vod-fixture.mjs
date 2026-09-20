import { createHash } from "node:crypto";

export const manifestUrl = "https://data.oshi.tw/vod/v1/manifest.json";

export function createFeed({
  publishedAt = "2026-09-20T00:00:00.000Z",
  socialLinks = {},
  songTitle = "第一首歌",
} = {}) {
  const snapshot = {
    schemaVersion: "1.0.0",
    streamers: [{
      slug: "tester",
      displayName: "測試歌姬",
      youtubeChannelId: "test-channel",
      avatarUrl: null,
      group: null,
      socialLinks,
      vods: [{
        title: "測試歌回 VOD",
        date: "2026-07-01",
        videoId: "abcDEF12345",
        performances: [{
          performanceId: "performance-1",
          songId: "song-1",
          title: songTitle,
          originalArtist: null,
          startSeconds: 65,
          endSeconds: 245,
        }],
      }],
    }],
  };
  const snapshotText = JSON.stringify(snapshot);
  const hash = createHash("sha256").update(snapshotText).digest("hex");
  const manifest = {
    schemaVersion: "1.0.0",
    snapshotUrl: `https://data.oshi.tw/vod/v1/snapshots/${hash}.json`,
    sha256: hash,
    publishedAt,
    uncompressedBytes: Buffer.byteLength(snapshotText),
    counts: { streamers: 1, vods: 1, performances: 1 },
  };
  return {
    manifest,
    snapshot,
    snapshotText,
    respond(input) {
      const url = typeof input === "string" ? input : input.url;
      if (url === manifestUrl) return Response.json(manifest);
      if (url === manifest.snapshotUrl) {
        return new Response(snapshotText, {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected upstream request: ${url}`);
    },
  };
}
