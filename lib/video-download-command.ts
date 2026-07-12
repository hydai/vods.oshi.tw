interface VideoDownloadCommandOptions {
  streamerSlug: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number;
}

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const STREAMER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildVideoDownloadCommand({
  streamerSlug,
  videoId,
  startSeconds,
  endSeconds,
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
  const outputTemplate = `${streamerSlug}-${videoId}-${startSeconds}-${endSeconds}.%(ext)s`;

  return [
    "yt-dlp",
    "--ignore-config",
    "--no-playlist",
    '--format "bestvideo*+bestaudio/best"',
    `--download-sections "*${startSeconds}-${endSeconds}"`,
    "--no-force-keyframes-at-cuts",
    "--no-overwrites",
    `--output "${outputTemplate}"`,
    `"${videoUrl}"`,
  ].join(" ");
}
