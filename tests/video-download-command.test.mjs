import assert from "node:assert/strict";
import test from "node:test";
import { buildVideoDownloadCommand } from "../lib/video-download-command.ts";

test("builds a video-output yt-dlp command for the absolute song range", () => {
  const command = buildVideoDownloadCommand({
    streamerSlug: "tester",
    videoId: "abcDEF12345",
    startSeconds: 65,
    endSeconds: 245,
  });

  assert.match(command, /^yt-dlp /);
  assert.match(command, /--ignore-config/);
  assert.match(command, /--format "bestvideo\*\+bestaudio\/best"/);
  assert.match(command, /--download-sections "\*65-245"/);
  assert.match(command, /--force-keyframes-at-cuts/);
  assert.match(command, /--no-overwrites/);
  assert.match(command, /--output "tester-abcDEF12345-65-245\.\%\(ext\)s"/);
  assert.match(command, /watch\?v=abcDEF12345/);
  assert.doesNotMatch(
    command,
    /(?:^|\s)(?:-x|--extract-audio|--audio-format)(?:\s|$)/,
  );
  assert.doesNotMatch(command, /[\r\n]/);
});

test("keeps zero and long VOD timestamps as absolute seconds", () => {
  assert.match(
    buildVideoDownloadCommand({
      streamerSlug: "tester",
      videoId: "abcDEF12345",
      startSeconds: 0,
      endSeconds: 9,
    }),
    /--download-sections "\*0-9"/,
  );
  assert.match(
    buildVideoDownloadCommand({
      streamerSlug: "tester",
      videoId: "abcDEF12345",
      startSeconds: 3661,
      endSeconds: 3905,
    }),
    /--download-sections "\*3661-3905"/,
  );
});

test("rejects invalid video IDs and ranges", () => {
  assert.throws(() =>
    buildVideoDownloadCommand({
      streamerSlug: "tester",
      videoId: "not-a-video-id",
      startSeconds: 65,
      endSeconds: 245,
    }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({
      streamerSlug: "tester",
      videoId: "abcDEF12345",
      startSeconds: 65.5,
      endSeconds: 245,
    }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({
      streamerSlug: "tester",
      videoId: "abcDEF12345",
      startSeconds: 245,
      endSeconds: 65,
    }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({
      streamerSlug: "../../unsafe",
      videoId: "abcDEF12345",
      startSeconds: 65,
      endSeconds: 245,
    }),
  );
});
