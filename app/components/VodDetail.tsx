"use client";

/* eslint-disable @next/next/no-img-element -- YouTube thumbnail URLs are derived from validated video IDs. */

import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Facebook,
  Instagram,
  Music2,
  Play,
  Search,
  Share2,
  Twitch,
  Twitter,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  VodCardData,
  VodExportManifest,
  VodExportSocialLinks,
  VodExportStreamer,
  VodExportVod,
} from "../../lib/vod-types";
import { Avatar } from "./Avatar";
import { Brand } from "./Brand";
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
          <a
            className="hero-video"
            href={watchUrl(vod.videoId)}
            target="_blank"
            rel="noreferrer"
            aria-label="在 YouTube 觀看完整 VOD"
          >
            <img
              src={`https://i.ytimg.com/vi/${encodeURIComponent(vod.videoId)}/hqdefault.jpg`}
              alt={`${vod.title} 的 YouTube 縮圖`}
              referrerPolicy="no-referrer"
            />
            <span className="hero-video-scrim" />
            <span className="hero-play">
              <Play fill="currentColor" aria-hidden="true" />
            </span>
            <span className="hero-source">
              <Youtube aria-hidden="true" /> 在 YouTube 觀看
            </span>
          </a>

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
              <a
                href={watchUrl(vod.videoId)}
                target="_blank"
                rel="noreferrer"
                className="primary-button"
              >
                <Youtube aria-hidden="true" />
                播放完整 VOD
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
              <p>點選歌曲，直接從對應時間開始播放。</p>
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

          <div className="song-list">
            {songs.map((song, index) => (
              <a
                key={song.performanceId}
                className="song-row"
                href={watchUrl(vod.videoId, song.startSeconds)}
                target="_blank"
                rel="noreferrer"
              >
                <span className="song-index-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="song-play-icon">
                  <Play fill="currentColor" aria-hidden="true" />
                </span>
                <span className="song-copy">
                  <strong>{song.title}</strong>
                  <small>{song.originalArtist ?? "原唱資料未提供"}</small>
                </span>
                <span className="song-time">
                  <span>
                    <Clock3 aria-hidden="true" />
                    {formatTimestamp(song.startSeconds)}
                  </span>
                  <small>{formatTimestamp(song.endSeconds - song.startSeconds)}</small>
                </span>
                <ExternalLink className="song-external" aria-hidden="true" />
              </a>
            ))}
          </div>

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
