import assert from "node:assert/strict";
import test from "node:test";
import { buildVideoDownloadCommand } from "../lib/video-download-command.ts";

const platforms = ["windows", "macos", "linux", "unknown"];
const profiles = ["editing-mp4", "quality-webm", "precise-reencode"];

for (const platform of platforms) {
  for (const profile of profiles) {
    test(`builds the ${profile} video command for ${platform}`, () => {
      const command = buildVideoDownloadCommand({
        streamerSlug: "tester",
        videoId: "abcDEF12345",
        startSeconds: 65,
        endSeconds: 245,
        profile,
        platform,
      });

      assert.match(
        command,
        platform === "windows" ? /^yt-dlp\.exe --% / : /^yt-dlp /,
      );
      assert.match(command, /--ignore-config/);
      assert.match(command, /--no-playlist/);
      assert.match(command, /--download-sections ['"]\*65-245['"]/);
      assert.match(command, /--no-overwrites/);
      assert.ok(
        command.includes(
          `tester-abcDEF12345-65-245-${profile}.%(ext)s`,
        ),
      );
      assert.match(command, /watch\?v=abcDEF12345/);
      assert.doesNotMatch(
        command,
        /(?:^|\s)(?:-x|--extract-audio|--audio-format)(?:\s|$)/,
      );
      assert.doesNotMatch(command, /[\r\n]/);
      if (platform === "windows") {
        assert.ok(command.includes("%(ext)s"));
        assert.ok(!command.includes("%%(ext)s"));
      }

      if (profile === "editing-mp4") {
        assert.ok(
          command.includes(
            "bv[vcodec^=avc1]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a]",
          ),
        );
        assert.match(command, /--merge-output-format mp4/);
        assert.match(command, /--remux-video mp4/);
        assert.match(command, /--no-force-keyframes-at-cuts/);
        assert.doesNotMatch(
          command,
          /(?:^|\s)--force-keyframes-at-cuts(?:\s|$)/,
        );
      } else if (profile === "quality-webm") {
        assert.ok(command.includes("vp9|av01"));
        assert.ok(command.includes("ba[acodec^=opus]"));
        assert.match(command, /--merge-output-format webm/);
        assert.match(command, /--remux-video webm/);
        assert.match(command, /--no-force-keyframes-at-cuts/);
        assert.doesNotMatch(
          command,
          /(?:^|\s)--force-keyframes-at-cuts(?:\s|$)/,
        );
      } else {
        assert.ok(command.includes("bestvideo*+bestaudio/best"));
        assert.match(command, /(?:^|\s)--force-keyframes-at-cuts(?:\s|$)/);
        assert.doesNotMatch(command, /--no-force-keyframes-at-cuts/);
        assert.doesNotMatch(command, /--merge-output-format|--remux-video/);
      }
    });
  }
}

test("defaults to the editing-friendly MP4 portable command", () => {
  const command = buildVideoDownloadCommand({
    streamerSlug: "tester",
    videoId: "abcDEF12345",
    startSeconds: 0,
    endSeconds: 9,
  });

  assert.match(command, /^yt-dlp /);
  assert.match(command, /--merge-output-format mp4/);
  assert.match(command, /--download-sections '\*0-9'/);
  assert.ok(command.includes("-editing-mp4.%(ext)s"));
});

test("keeps long VOD timestamps as absolute seconds", () => {
  assert.match(
    buildVideoDownloadCommand({
      streamerSlug: "tester",
      videoId: "abcDEF12345",
      startSeconds: 3661,
      endSeconds: 3905,
    }),
    /--download-sections '\*3661-3905'/,
  );
});

test("rejects invalid IDs, ranges, profiles, platforms, and slugs", () => {
  const valid = {
    streamerSlug: "tester",
    videoId: "abcDEF12345",
    startSeconds: 65,
    endSeconds: 245,
  };

  assert.throws(() =>
    buildVideoDownloadCommand({ ...valid, videoId: "not-a-video-id" }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({ ...valid, startSeconds: 65.5 }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({ ...valid, startSeconds: 245, endSeconds: 65 }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({ ...valid, streamerSlug: "../../unsafe" }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({ ...valid, profile: "audio-only" }),
  );
  assert.throws(() =>
    buildVideoDownloadCommand({ ...valid, platform: "cmd.exe & whoami" }),
  );
});
