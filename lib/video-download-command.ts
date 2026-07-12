interface VideoDownloadCommandOptions {
  streamerSlug: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  profile?: VideoDownloadProfile;
  platform?: ResolvedDownloadPlatform;
}

export type VideoDownloadProfile =
  | "editing-mp4"
  | "quality-webm"
  | "precise-reencode";

export type ResolvedDownloadPlatform =
  | "windows"
  | "macos"
  | "linux"
  | "unknown";

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const STREAMER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildVideoDownloadCommand({
  streamerSlug,
  videoId,
  startSeconds,
  endSeconds,
  profile = "editing-mp4",
  platform = "unknown",
}: VideoDownloadCommandOptions): string {
  if (!STREAMER_SLUG.test(streamerSlug)) {
    throw new Error("Invalid streamer slug");
  }
  if (!YOUTUBE_VIDEO_ID.test(videoId)) {
    throw new Error("Invalid YouTube video ID");
  }
  if (
    !Number.isSafeInteger(startSeconds) ||
    !Number.isSafeInteger(endSeconds) ||
    startSeconds < 0 ||
    endSeconds <= startSeconds
  ) {
    throw new Error("Invalid video segment");
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = `${streamerSlug}-${videoId}-${startSeconds}-${endSeconds}-${profile}.%(ext)s`;
  const isWindows = platform === "windows";
  const executable = isWindows ? "yt-dlp.exe" : "yt-dlp";
  const quote = (value: string) =>
    isWindows ? `"${value}"` : `'${value}'`;

  let profileArguments: string[];
  switch (profile) {
    case "editing-mp4":
      profileArguments = [
        `--format ${quote(
          "bv[vcodec^=avc1]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a]",
        )}`,
        "--merge-output-format mp4",
        "--remux-video mp4",
        "--no-force-keyframes-at-cuts",
      ];
      break;
    case "quality-webm":
      profileArguments = [
        `--format ${quote(
          isWindows
            ? "bv[vcodec~='^(vp9|av01)']+ba[acodec^=opus]/b[vcodec~='^(vp9|av01)'][acodec^=opus]"
            : 'bv[vcodec~="^(vp9|av01)"]+ba[acodec^=opus]/b[vcodec~="^(vp9|av01)"][acodec^=opus]',
        )}`,
        "--merge-output-format webm",
        "--remux-video webm",
        "--no-force-keyframes-at-cuts",
      ];
      break;
    case "precise-reencode":
      profileArguments = [
        `--format ${quote("bestvideo*+bestaudio/best")}`,
        "--force-keyframes-at-cuts",
      ];
      break;
    default: {
      const exhaustiveProfile: never = profile;
      throw new Error(`Invalid download profile: ${exhaustiveProfile}`);
    }
  }

  if (!(["windows", "macos", "linux", "unknown"] as const).includes(platform)) {
    throw new Error("Invalid download platform");
  }

  return [
    executable,
    ...(isWindows ? ["--%"] : []),
    "--ignore-config",
    "--no-playlist",
    ...profileArguments,
    `--download-sections ${quote(`*${startSeconds}-${endSeconds}`)}`,
    "--no-overwrites",
    `--output ${quote(outputTemplate)}`,
    quote(videoUrl),
  ].join(" ");
}
