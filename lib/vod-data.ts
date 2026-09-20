import { z } from "zod";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import type {
  VodCardData,
  VodDataset,
  VodExportCounts,
  VodExportManifest,
  VodExportSnapshot,
  VodExportSocialLinks,
  VodExportStreamer,
  VodExportVod,
} from "./vod-types";

const MANIFEST_URL = "https://data.oshi.tw/vod/v1/manifest.json";
const TRUSTED_SNAPSHOT_ORIGIN = "https://data.oshi.tw";
const MAX_MANIFEST_BYTES = 65_536;
const MAX_SNAPSHOT_BYTES = 10_485_760;
const REFRESH_INTERVAL_MS = 60_000;
const FAILED_REFRESH_RETRY_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_PUBLISHED_AT_CLOCK_SKEW_MS = 5 * 60_000;

const V1_VERSION = /^1\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UTC_MILLISECONDS =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const STREAMER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SURROUNDING_WHITESPACE =
  /^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/u;

const safeInteger = z.number().int().safe();
const nonEmptyText = z.string().min(1);
const httpsUrl = z.string().min(1).refine((value) => {
  try {
    return new URL(value).protocol.toLowerCase() === "https:";
  } catch {
    return false;
  }
}, "Expected an HTTPS URL");

const countsSchema = z
  .object({
    streamers: safeInteger.min(0).max(500),
    vods: safeInteger.min(0).max(10_000),
    performances: safeInteger.min(0).max(50_000),
  })
  .passthrough();

const manifestSchema = z
  .object({
    schemaVersion: z.string().regex(V1_VERSION),
    snapshotUrl: z.string().url(),
    sha256: z.string().regex(SHA256),
    publishedAt: z.string().regex(UTC_MILLISECONDS).refine((value) => {
      const date = new Date(value);
      return Number.isFinite(date.getTime()) && date.toISOString() === value;
    }, "Expected a valid canonical UTC timestamp"),
    uncompressedBytes: safeInteger.min(1).max(MAX_SNAPSHOT_BYTES),
    counts: countsSchema,
  })
  .passthrough();

// Unknown providers are forward-compatible data, not renderable links.
const socialLinksSchema = z.object({
  youtube: httpsUrl.optional(),
  twitter: httpsUrl.optional(),
  facebook: httpsUrl.optional(),
  instagram: httpsUrl.optional(),
  twitch: httpsUrl.optional(),
});

const performanceSchema = z
  .object({
    performanceId: nonEmptyText,
    songId: nonEmptyText,
    title: nonEmptyText,
    originalArtist: nonEmptyText.nullable(),
    startSeconds: safeInteger.min(0),
    endSeconds: safeInteger.min(1),
  })
  .passthrough();

const vodSchema = z
  .object({
    title: nonEmptyText,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    videoId: z.string().regex(VIDEO_ID),
    performances: z.array(performanceSchema).min(1).max(50_000),
  })
  .passthrough();

const streamerSchema = z
  .object({
    slug: z.string().min(1).max(50).regex(STREAMER_SLUG),
    displayName: nonEmptyText,
    youtubeChannelId: nonEmptyText,
    avatarUrl: httpsUrl.nullable(),
    group: nonEmptyText.nullable(),
    socialLinks: socialLinksSchema,
    vods: z.array(vodSchema).max(10_000),
  })
  .passthrough();

const snapshotSchema = z
  .object({
    schemaVersion: z.string().regex(V1_VERSION),
    streamers: z.array(streamerSchema).max(500),
  })
  .passthrough();

const socialHostAllowlist: Record<keyof VodExportSocialLinks, Set<string>> = {
  youtube: new Set(["youtube.com", "m.youtube.com", "youtu.be"]),
  twitter: new Set(["twitter.com", "mobile.twitter.com", "x.com"]),
  facebook: new Set(["facebook.com", "m.facebook.com", "fb.com"]),
  instagram: new Set(["instagram.com"]),
  twitch: new Set(["twitch.tv"]),
};

const avatarHosts = new Set([
  "yt3.ggpht.com",
  "yt4.ggpht.com",
  "yt3.googleusercontent.com",
  "lh3.googleusercontent.com",
]);

function parseJson(bytes: Uint8Array, label: string): unknown {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} contains a forbidden UTF-8 BOM`);
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text) as unknown;
}

function assertJsonResponse(
  response: Response,
  label: string,
  expectedUrl: string,
): void {
  if (
    response.redirected ||
    (response.url && response.url !== expectedUrl)
  ) {
    throw new Error(`${label} redirected unexpectedly`);
  }
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  const mediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new Error(`${label} is not JSON`);
  }
}

async function readBytesWithLimit(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) throw new Error("Response body is missing");

  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`Response exceeds ${limit} decoded bytes`);
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", input.buffer),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function assertUnicodeScalars(value: unknown): void {
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) {
          throw new Error("Snapshot contains an unpaired high surrogate");
        }
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        throw new Error("Snapshot contains an unpaired low surrogate");
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(assertUnicodeScalars);
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertUnicodeScalars(key);
      assertUnicodeScalars(child);
    }
  }
}

function assertDisplayText(value: string | null, label: string): void {
  if (value === null) return;
  if (!value || SURROUNDING_WHITESPACE.test(value)) {
    throw new Error(`${label} has invalid surrounding whitespace`);
  }
  if (value !== value.normalize("NFC")) {
    throw new Error(`${label} is not Unicode NFC`);
  }
}

function assertDateOnly(value: string): void {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new Error(`Invalid VOD date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid VOD calendar date: ${value}`);
  }
}

function normalizedHost(url: URL): string {
  const hostname = url.hostname.toLowerCase();
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function assertSafeUrl(
  value: string,
  allowedHosts: Set<string>,
  label: string,
): void {
  const url = new URL(value);
  if (
    url.protocol.toLowerCase() !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowedHosts.has(normalizedHost(url))
  ) {
    throw new Error(`${label} uses an unsupported URL`);
  }
}

function utf8Compare(left: string, right: string): number {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function snapshotCounts(snapshot: VodExportSnapshot): VodExportCounts {
  let vods = 0;
  let performances = 0;
  for (const streamer of snapshot.streamers) {
    vods += streamer.vods.length;
    for (const vod of streamer.vods) performances += vod.performances.length;
  }
  return { streamers: snapshot.streamers.length, vods, performances };
}

function assertCounts(actual: VodExportCounts, expected: VodExportCounts): void {
  if (
    actual.streamers !== expected.streamers ||
    actual.vods !== expected.vods ||
    actual.performances !== expected.performances
  ) {
    throw new Error("Snapshot counts do not match the manifest");
  }
}

function assertVod(
  vod: VodExportVod,
  performanceIds: Set<string>,
): void {
  assertDisplayText(vod.title, "VOD title");
  assertDateOnly(vod.date);

  let previousStart = -1;
  let previousId = "";
  for (const performance of vod.performances) {
    assertDisplayText(performance.title, "Song title");
    assertDisplayText(performance.originalArtist, "Original artist");
    if (performance.endSeconds <= performance.startSeconds) {
      throw new Error("Performance endSeconds must exceed startSeconds");
    }
    if (performanceIds.has(performance.performanceId)) {
      throw new Error("Duplicate performanceId");
    }
    performanceIds.add(performance.performanceId);

    if (
      performance.startSeconds < previousStart ||
      (performance.startSeconds === previousStart &&
        utf8Compare(performance.performanceId, previousId) <= 0)
    ) {
      throw new Error("Performances are not in canonical order");
    }
    previousStart = performance.startSeconds;
    previousId = performance.performanceId;
  }
}

function assertStreamer(
  streamer: VodExportStreamer,
  performanceIds: Set<string>,
): void {
  assertDisplayText(streamer.displayName, "Streamer displayName");
  assertDisplayText(streamer.group, "Streamer group");
  if (streamer.avatarUrl) {
    assertSafeUrl(streamer.avatarUrl, avatarHosts, "Avatar");
  }
  for (const [provider, url] of Object.entries(streamer.socialLinks)) {
    if (!url || !(provider in socialHostAllowlist)) continue;
    assertSafeUrl(
      url,
      socialHostAllowlist[provider as keyof VodExportSocialLinks],
      `${provider} social link`,
    );
    if (provider === "youtube" && new URL(url).pathname === "/redirect") {
      throw new Error("YouTube redirect URLs are not allowed");
    }
  }

  const videoIds = new Set<string>();
  let previousVod: VodExportVod | null = null;
  for (const vod of streamer.vods) {
    if (videoIds.has(vod.videoId)) throw new Error("Duplicate streamer VOD");
    videoIds.add(vod.videoId);
    if (
      previousVod &&
      (vod.date > previousVod.date ||
        (vod.date === previousVod.date &&
          utf8Compare(vod.videoId, previousVod.videoId) <= 0))
    ) {
      throw new Error("VODs are not in canonical order");
    }
    assertVod(vod, performanceIds);
    previousVod = vod;
  }
}

function validateSnapshotSemantics(
  raw: unknown,
  snapshot: VodExportSnapshot,
  manifest: VodExportManifest,
): void {
  assertUnicodeScalars(raw);
  if (snapshot.schemaVersion !== manifest.schemaVersion) {
    throw new Error("Manifest and snapshot versions differ");
  }

  const slugs = new Set<string>();
  const channelIds = new Set<string>();
  const performanceIds = new Set<string>();
  let previousSlug = "";

  for (const streamer of snapshot.streamers) {
    if (slugs.has(streamer.slug)) throw new Error("Duplicate streamer slug");
    if (channelIds.has(streamer.youtubeChannelId)) {
      throw new Error("Duplicate YouTube channel ID");
    }
    if (previousSlug && utf8Compare(streamer.slug, previousSlug) <= 0) {
      throw new Error("Streamers are not in canonical order");
    }
    slugs.add(streamer.slug);
    channelIds.add(streamer.youtubeChannelId);
    assertStreamer(streamer, performanceIds);
    previousSlug = streamer.slug;
  }

  assertCounts(snapshotCounts(snapshot), manifest.counts);
}

function parseManifest(raw: unknown, now: number): VodExportManifest {
  const manifest = manifestSchema.parse(raw) as VodExportManifest;
  // A future publication must not poison the monotonic rollback guard.
  if (Date.parse(manifest.publishedAt) > now + MAX_PUBLISHED_AT_CLOCK_SKEW_MS) {
    throw new Error("Manifest publishedAt is too far in the future");
  }
  const expectedSnapshotUrl = `${TRUSTED_SNAPSHOT_ORIGIN}/vod/v1/snapshots/${manifest.sha256}.json`;
  if (manifest.snapshotUrl !== expectedSnapshotUrl) {
    throw new Error("Manifest contains an unexpected snapshot URL");
  }
  return manifest;
}

async function refreshDataset(
  previous: VodDataset | null,
  fetcher: typeof fetch,
  signal: AbortSignal,
  now: () => number,
): Promise<VodDataset> {
  const manifestResponse = await fetcher(MANIFEST_URL, {
    redirect: "manual",
    headers: { accept: "application/json" },
    signal,
  });
  assertJsonResponse(manifestResponse, "Manifest", MANIFEST_URL);
  const manifestBytes = await readBytesWithLimit(
    manifestResponse,
    MAX_MANIFEST_BYTES,
    signal,
  );
  const manifest = parseManifest(parseJson(manifestBytes, "Manifest"), now());

  if (previous?.manifest.sha256 === manifest.sha256) {
    assertCounts(manifest.counts, previous.manifest.counts);
    if (
      manifest.schemaVersion !== previous.snapshot.schemaVersion ||
      manifest.uncompressedBytes !== previous.manifest.uncompressedBytes
    ) {
      throw new Error("Manifest metadata changed for the same snapshot");
    }
    return previous.manifest.publishedAt > manifest.publishedAt
      ? previous
      : { manifest, snapshot: previous.snapshot };
  }

  const snapshotResponse = await fetcher(manifest.snapshotUrl, {
    redirect: "manual",
    headers: { accept: "application/json" },
    signal,
  });
  assertJsonResponse(snapshotResponse, "Snapshot", manifest.snapshotUrl);
  const snapshotBytes = await readBytesWithLimit(
    snapshotResponse,
    MAX_SNAPSHOT_BYTES,
    signal,
  );
  if (snapshotBytes.byteLength !== manifest.uncompressedBytes) {
    throw new Error("Snapshot byte length does not match the manifest");
  }
  if ((await sha256Hex(snapshotBytes)) !== manifest.sha256) {
    throw new Error("Snapshot hash does not match the manifest");
  }

  const rawSnapshot = parseJson(snapshotBytes, "Snapshot");
  const snapshot = snapshotSchema.parse(rawSnapshot) as VodExportSnapshot;
  validateSnapshotSemantics(rawSnapshot, snapshot, manifest);

  if (
    previous &&
    previous.manifest.publishedAt > manifest.publishedAt
  ) {
    return previous;
  }

  return { manifest, snapshot } satisfies VodDataset;
}

type KeepAlive = (task: Promise<unknown>) => void;

// Each load owns and fully consumes its I/O. Only validated plain data crosses
// requests; the initiating request keeps the load alive even after disconnect.
export function createVodDatasetLoader({
  fetcher = (...args: Parameters<typeof fetch>) => fetch(...args),
  now = () => Date.now(),
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
}: {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
} = {}) {
  let activeDataset: VodDataset | null = null;
  let activeRefresh: Promise<VodDataset> | null = null;
  let nextRefreshAt = 0;
  let lastFailure: unknown;

  return async function load(keepAlive?: KeepAlive): Promise<VodDataset> {
    if (now() < nextRefreshAt) {
      if (activeDataset) return activeDataset;
      throw lastFailure;
    }

    if (!activeRefresh) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("VOD dataset download timed out")),
        timeoutMs,
      );
      activeRefresh = refreshDataset(activeDataset, fetcher, controller.signal, now)
        .then((dataset) => {
          activeDataset = dataset;
          nextRefreshAt = now() + REFRESH_INTERVAL_MS;
          lastFailure = undefined;
          return dataset;
        })
        .catch((error: unknown) => {
          lastFailure = error;
          nextRefreshAt = now() + FAILED_REFRESH_RETRY_MS;
          if (!activeDataset) throw error;
          console.error("VOD dataset refresh failed; keeping last known good data", error);
          return activeDataset;
        })
        .finally(() => {
          clearTimeout(timeout);
          // Header validation may fail before a response body is consumed.
          controller.abort();
          activeRefresh = null;
        });
      // Register with the I/O owner's context, not a later waiting request.
      keepAlive?.(activeRefresh.catch(() => {}));
    }

    // Without an execution context (standalone Node), await the refresh so no
    // asynchronous work is abandoned when the caller finishes.
    if (activeDataset && keepAlive) return activeDataset;
    return activeRefresh;
  };
}

const loadVodDataset = createVodDatasetLoader();

export function getVodDataset(): Promise<VodDataset> {
  const context = getRequestExecutionContext();
  return loadVodDataset(context ? (task) => context.waitUntil(task) : undefined);
}

const cardCache = new WeakMap<VodExportSnapshot, VodCardData[]>();

export function makeVodCards(dataset: VodDataset): VodCardData[] {
  const cached = cardCache.get(dataset.snapshot);
  if (cached) return cached;
  const cards = dataset.snapshot.streamers.flatMap((streamer) =>
    streamer.vods.map((vod) => ({
      id: `${streamer.slug}:${vod.videoId}`,
      streamerSlug: streamer.slug,
      streamerName: streamer.displayName,
      streamerAvatarUrl: streamer.avatarUrl,
      group: streamer.group,
      videoId: vod.videoId,
      title: vod.title,
      date: vod.date,
      songCount: vod.performances.length,
      songPreview: vod.performances.slice(0, 3).map((song) => song.title),
      searchText: [
        streamer.displayName,
        streamer.group ?? "",
        vod.title,
        ...vod.performances.flatMap((song) => [
          song.title,
          song.originalArtist ?? "",
        ]),
      ]
        .join("\u0000")
        .toLocaleLowerCase("zh-TW"),
    })),
  );

  cards.sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      utf8Compare(left.id, right.id),
  );
  cardCache.set(dataset.snapshot, cards);
  return cards;
}

export async function getVodByKey(
  streamerSlug: string,
  videoId: string,
): Promise<{
  dataset: VodDataset;
  streamer: VodExportStreamer;
  vod: VodExportVod;
} | null> {
  const dataset = await getVodDataset();
  const streamer = dataset.snapshot.streamers.find(
    (candidate) => candidate.slug === streamerSlug,
  );
  const vod = streamer?.vods.find((candidate) => candidate.videoId === videoId);
  return streamer && vod ? { dataset, streamer, vod } : null;
}

export { MANIFEST_URL };
