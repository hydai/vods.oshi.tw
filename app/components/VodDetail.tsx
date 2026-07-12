"use client";

/* eslint-disable @next/next/no-img-element -- YouTube thumbnail URLs are derived from validated video IDs. */

import {
  AudioLines,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Facebook,
  Instagram,
  Music2,
  Play,
  Search,
  Share2,
  Terminal,
  Twitch,
  Twitter,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildVideoDownloadCommand } from "../../lib/video-download-command";
import type {
  VodCardData,
  VodExportManifest,
  VodExportSocialLinks,
  VodExportStreamer,
  VodExportVod,
} from "../../lib/vod-types";
import { Avatar } from "./Avatar";
import { Brand } from "./Brand";
import { DownloadSettings, useDownloadSettings } from "./DownloadSettings";
import {
  InlineYouTubePlayer,
  type InlineYouTubePlayerHandle,
  type PlaybackRequest,
  type PlaybackStatus,
} from "./InlineYouTubePlayer";
import { ThemeToggle } from "./ThemeToggle";

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatDateOnly(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function watchUrl(videoId: string, startSeconds?: number): string {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return startSeconds === undefined ? base : `${base}&t=${startSeconds}s`;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for browsers that expose Clipboard API but deny the write.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error("Clipboard write failed");
}

function SocialIcon({ provider }: { provider: keyof VodExportSocialLinks }) {
  const icons = {
    youtube: Youtube,
    twitter: Twitter,
    facebook: Facebook,
    instagram: Instagram,
    twitch: Twitch,
  };
  const Icon = icons[provider];
  return <Icon aria-hidden="true" />;
}

function RelatedCard({ card }: { card: VodCardData }) {
  return (
    <Link
      href={`/vod/${encodeURIComponent(card.streamerSlug)}/${encodeURIComponent(card.videoId)}`}
      className="related-card"
    >
      <span className="related-thumbnail">
        <img
          src={`https://i.ytimg.com/vi/${encodeURIComponent(card.videoId)}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <span>{card.songCount} 首</span>
      </span>
      <span className="related-copy">
        <strong>{card.title}</strong>
        <small>{card.date.replaceAll("-", ".")}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </Link>
  );
}

interface VodDetailProps {
  streamer: VodExportStreamer;
  vod: VodExportVod;
  manifest: VodExportManifest;
  relatedVods: VodCardData[];
}

export function VodDetail({
  streamer,
  vod,
  manifest,
  relatedVods,
}: VodDetailProps) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [commandCopyFeedback, setCommandCopyFeedback] = useState<{
    performanceId: string;
    status: "copied" | "error";
  } | null>(null);
  const [playbackRequest, setPlaybackRequest] =
    useState<PlaybackRequest | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const requestSequence = useRef(0);
  const playerAnchor = useRef<HTMLDivElement>(null);
  const inlinePlayer = useRef<InlineYouTubePlayerHandle>(null);
  const commandCopyTimer = useRef<number | null>(null);
  const {
    settings: downloadSettings,
    detectedPlatform,
    resolvedPlatform,
    updateSettings: updateDownloadSettings,
  } = useDownloadSettings();

  useEffect(
    () => () => {
      if (commandCopyTimer.current !== null) {
        window.clearTimeout(commandCopyTimer.current);
      }
    },
    [],
  );

  const songs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-TW");
    if (!normalized) return vod.performances;
    return vod.performances.filter((song) =>
      `${song.title}\u0000${song.originalArtist ?? ""}`
        .toLocaleLowerCase("zh-TW")
        .includes(normalized),
    );
  }, [query, vod.performances]);

  async function share() {
    const data = { title: vod.title, url: window.location.href };
    if (navigator.share) {
      await navigator.share(data).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(data.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function playInPage(request: Omit<PlaybackRequest, "requestId">) {
    requestSequence.current += 1;
    const nextRequest = { ...request, requestId: requestSequence.current };
    setPlaybackStatus("loading");
    setPlaybackRequest(nextRequest);
    inlinePlayer.current?.play(nextRequest);

    window.requestAnimationFrame(() => {
      playerAnchor.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function playFullVod() {
    playInPage({
      performanceId: null,
      title: vod.title,
      startSeconds: 0,
    });
  }

  async function copyVideoCommand(
    song: VodExportVod["performances"][number],
  ) {
    const command = buildVideoDownloadCommand({
      streamerSlug: streamer.slug,
      videoId: vod.videoId,
      startSeconds: song.startSeconds,
      endSeconds: song.endSeconds,
      profile: downloadSettings.profile,
      platform: resolvedPlatform,
    });

    let status: "copied" | "error" = "copied";
    try {
      await copyText(command);
    } catch {
      status = "error";
    }

    setCommandCopyFeedback({ performanceId: song.performanceId, status });
    if (commandCopyTimer.current !== null) {
      window.clearTimeout(commandCopyTimer.current);
    }
    commandCopyTimer.current = window.setTimeout(
      () => setCommandCopyFeedback(null),
      2200,
    );
  }

  return (
    <div className="detail-page">
      <header className="detail-header">
        <div className="detail-header-inner">
          <Brand />
          <div className="detail-header-actions">
            <Link href="/" className="header-back-link">
              <ArrowLeft aria-hidden="true" />
              <span>回到封存庫</span>
            </Link>
            <DownloadSettings
              settings={downloadSettings}
              detectedPlatform={detectedPlatform}
              resolvedPlatform={resolvedPlatform}
              onChange={updateDownloadSettings}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="detail-main">
        <nav className="breadcrumbs" aria-label="麵包屑">
          <Link href="/">VOD 封存庫</Link>
          <ChevronRight aria-hidden="true" />
          <span>{streamer.displayName}</span>
        </nav>

        <section className="vod-hero">
          <div className="hero-player-anchor" ref={playerAnchor}>
            <InlineYouTubePlayer
              ref={inlinePlayer}
              videoId={vod.videoId}
              title={vod.title}
              thumbnailUrl={`https://i.ytimg.com/vi/${encodeURIComponent(vod.videoId)}/hqdefault.jpg`}
              request={playbackRequest}
              onRequestFullVod={playFullVod}
              onStatusChange={setPlaybackStatus}
            />
          </div>

          <div className="vod-hero-copy">
            <div className="creator-block">
              <Avatar
                src={streamer.avatarUrl}
                name={streamer.displayName}
                size="large"
                eager
              />
              <div>
                <strong>{streamer.displayName}</strong>
                <span>{streamer.group ?? "獨立創作者"}</span>
              </div>
            </div>

            <h1>{vod.title}</h1>

            <div className="vod-metadata">
              <span>
                <CalendarDays aria-hidden="true" />
                {formatDateOnly(vod.date)}
              </span>
              <span>
                <Music2 aria-hidden="true" />
                {vod.performances.length} 首歌曲
              </span>
            </div>

            <div className="vod-actions">
              <button
                type="button"
                className="primary-button"
                onClick={playFullVod}
              >
                <Play fill="currentColor" aria-hidden="true" />
                {playbackRequest?.performanceId === null
                  ? "重新播放完整 VOD"
                  : "在此頁播放完整 VOD"}
              </button>
              <a
                href={watchUrl(vod.videoId)}
                target="_blank"
                rel="noreferrer"
                className="secondary-button"
              >
                <Youtube aria-hidden="true" />
                YouTube
                <ExternalLink aria-hidden="true" />
              </a>
              <button type="button" className="secondary-button icon-copy" onClick={share}>
                {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
                {copied ? "已複製連結" : "分享"}
              </button>
            </div>

            {Object.keys(streamer.socialLinks).length > 0 && (
              <div className="social-links" aria-label={`${streamer.displayName} 社群連結`}>
                {Object.entries(streamer.socialLinks).map(([provider, url]) => (
                  <a
                    key={provider}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${streamer.displayName} 的 ${provider}`}
                    title={provider}
                  >
                    <SocialIcon provider={provider as keyof VodExportSocialLinks} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="song-index" aria-labelledby="song-index-heading">
          <div className="song-index-heading">
            <div>
              <p className="section-kicker">Song index</p>
              <h2 id="song-index-heading">歌曲時間軸</h2>
              <p>點選歌曲可頁內播放；右側按鈕會複製影片片段下載指令。</p>
            </div>
            <label className="song-search">
              <Search aria-hidden="true" />
              <span className="sr-only">篩選歌曲</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋歌曲或原唱…"
              />
            </label>
          </div>

          <div className="song-command-note">
            <Terminal aria-hidden="true" />
            <span>
              {downloadSettings.profile === "editing-mp4"
                ? "目前複製剪輯相容的 MP4 快速切片；切點可能受關鍵影格影響。"
                : downloadSettings.profile === "quality-webm"
                  ? "目前複製高畫質 WebM 快速切片；切點可能受關鍵影格影響。"
                  : "目前複製較精準切點的重新編碼指令；執行較慢，並會增加耗電與發熱。"}
              需先安裝 yt-dlp 與 ffmpeg。
            </span>
            <a
              href="https://github.com/yt-dlp/yt-dlp/wiki/Installation"
              target="_blank"
              rel="noreferrer"
            >
              安裝說明
              <ExternalLink aria-hidden="true" />
            </a>
          </div>

          <div className="song-list">
            {songs.map((song, index) => {
              const isActive =
                playbackRequest?.performanceId === song.performanceId;
              const isPlaying = isActive && playbackStatus === "playing";
              const copyFeedback =
                commandCopyFeedback?.performanceId === song.performanceId
                  ? commandCopyFeedback.status
                  : null;

              return (
                <div className="song-row-item" key={song.performanceId}>
                  <button
                    type="button"
                    className={`song-row${isActive ? " is-active" : ""}`}
                    onClick={() =>
                      playInPage({
                        performanceId: song.performanceId,
                        title: song.title,
                        startSeconds: song.startSeconds,
                        endSeconds: song.endSeconds,
                      })
                    }
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`在此頁播放 ${song.title}，${formatTimestamp(song.startSeconds)} 到 ${formatTimestamp(song.endSeconds)}`}
                  >
                    <span className="song-index-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="song-play-icon">
                      {isPlaying ? (
                        <AudioLines aria-hidden="true" />
                      ) : (
                        <Play fill="currentColor" aria-hidden="true" />
                      )}
                    </span>
                    <span className="song-copy">
                      <strong>{song.title}</strong>
                      <small>
                        {isActive
                          ? playbackStatus === "finished"
                            ? "曲目播放完畢"
                            : "已選取 · 在上方播放器播放"
                          : song.originalArtist ?? "原唱資料未提供"}
                      </small>
                    </span>
                    <span className="song-time">
                      <span>
                        <Clock3 aria-hidden="true" />
                        {formatTimestamp(song.startSeconds)}
                      </span>
                      <small>
                        {formatTimestamp(song.endSeconds - song.startSeconds)}
                      </small>
                    </span>
                    <ChevronRight className="song-external" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`song-command-button${copyFeedback === "copied" ? " is-copied" : ""}${copyFeedback === "error" ? " is-error" : ""}`}
                    onClick={() => copyVideoCommand(song)}
                    aria-label={`複製「${song.title}」的影片片段下載指令`}
                    title={
                      copyFeedback === "copied"
                        ? "已複製影片下載指令"
                        : copyFeedback === "error"
                          ? "複製失敗，請再試一次"
                          : "複製影片片段下載指令"
                    }
                  >
                    {copyFeedback === "copied" ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Copy aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {commandCopyFeedback?.status === "copied"
              ? "已複製影片片段下載指令"
              : commandCopyFeedback?.status === "error"
                ? "下載指令複製失敗，請再試一次"
                : ""}
          </p>

          {!songs.length && (
            <div className="song-empty">
              <Search aria-hidden="true" />
              找不到符合「{query}」的歌曲
            </div>
          )}
        </section>

        {relatedVods.length > 0 && (
          <section className="related-section" aria-labelledby="related-heading">
            <div className="section-heading compact">
              <div>
                <p className="section-kicker">More from {streamer.displayName}</p>
                <h2 id="related-heading">更多封存 VOD</h2>
              </div>
            </div>
            <div className="related-grid">
              {relatedVods.map((card) => (
                <RelatedCard card={card} key={card.id} />
              ))}
            </div>
          </section>
        )}

        <footer className="detail-footer">
          <span>資料版本 {manifest.schemaVersion}</span>
          <span>VODs by oshi.tw</span>
        </footer>
      </main>
    </div>
  );
}
