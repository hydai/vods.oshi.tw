"use client";

/* eslint-disable @next/next/no-img-element -- YouTube thumbnail URLs are derived at runtime and include an explicit fallback. */

import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarDays,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  Library,
  ListFilter,
  Music2,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { VodCardData, VodExportCounts } from "../../lib/vod-types";
import { Avatar } from "./Avatar";
import { Brand } from "./Brand";
import { DownloadSettings, useDownloadSettings } from "./DownloadSettings";
import { ThemeToggle } from "./ThemeToggle";

const PAGE_SIZE = 24;

type SortMode = "newest" | "oldest" | "songs";

interface StreamerOption {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  vodCount: number;
}

interface InitialFilters {
  query: string;
  group: string;
  streamer: string;
  year: string;
  sort: SortMode;
}

interface VodBrowserProps {
  cards: VodCardData[];
  streamers: StreamerOption[];
  groups: string[];
  counts: VodExportCounts;
  publishedAt: string;
  initialFilters: InitialFilters;
}

function dateLabel(date: string): string {
  return date.replaceAll("-", ".");
}

function publishedLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function Thumbnail({ videoId, title }: { videoId: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="vod-thumbnail">
      {failed ? (
        <span className="thumbnail-fallback">
          <Clapperboard aria-hidden="true" />
          <span>無法載入縮圖</span>
        </span>
      ) : (
        <img
          src={`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`}
          alt={`${title} 的 YouTube 縮圖`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <span className="thumbnail-scrim" />
      <span className="thumbnail-play" aria-hidden="true">
        <Play fill="currentColor" />
      </span>
    </span>
  );
}

function VodCard({ card }: { card: VodCardData }) {
  return (
    <article className="vod-card">
      <Link
        href={`/vod/${encodeURIComponent(card.streamerSlug)}/${encodeURIComponent(card.videoId)}`}
        className="vod-card-link"
        aria-label={`查看 ${card.streamerName} 的 ${card.title}`}
      >
        <Thumbnail videoId={card.videoId} title={card.title} />
        <span className="song-count-badge">
          <Music2 aria-hidden="true" />
          {card.songCount} 首
        </span>
        <div className="vod-card-body">
          <div className="vod-card-creator">
            <Avatar
              src={card.streamerAvatarUrl}
              name={card.streamerName}
              size="small"
            />
            <span>{card.streamerName}</span>
            <time dateTime={card.date}>{dateLabel(card.date)}</time>
          </div>
          <h3>{card.title}</h3>
          <p className="song-preview" title={card.songPreview.join("、")}>
            {card.songPreview.join(" · ")}
          </p>
        </div>
      </Link>
    </article>
  );
}

function countLabel(value: number): string {
  return new Intl.NumberFormat("zh-TW").format(value);
}

export function VodBrowser({
  cards,
  streamers,
  groups,
  counts,
  publishedAt,
  initialFilters,
}: VodBrowserProps) {
  const [query, setQuery] = useState(initialFilters.query);
  const [group, setGroup] = useState(initialFilters.group);
  const [streamer, setStreamer] = useState(initialFilters.streamer);
  const [year, setYear] = useState(initialFilters.year);
  const [sort, setSort] = useState<SortMode>(initialFilters.sort);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const {
    settings: downloadSettings,
    detectedPlatform,
    resolvedPlatform,
    updateSettings: updateDownloadSettings,
  } = useDownloadSettings();

  const years = useMemo(
    () => Array.from(new Set(cards.map((card) => card.date.slice(0, 4)))).sort().reverse(),
    [cards],
  );

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
    const result = cards.filter((card) => {
      return (
        (!normalizedQuery || card.searchText.includes(normalizedQuery)) &&
        (!group || card.group === group) &&
        (!streamer || card.streamerSlug === streamer) &&
        (!year || card.date.startsWith(`${year}-`))
      );
    });

    return result.sort((left, right) => {
      if (sort === "oldest") {
        return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
      }
      if (sort === "songs") {
        return right.songCount - left.songCount || right.date.localeCompare(left.date);
      }
      return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
    });
  }, [cards, group, query, sort, streamer, year]);

  const hasFilters = Boolean(query || group || streamer || year || sort !== "newest");

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (group) params.set("group", group);
    if (streamer) params.set("streamer", streamer);
    if (year) params.set("year", year);
    if (sort !== "newest") params.set("sort", sort);
    const next = params.size ? `/?${params.toString()}` : "/";
    window.history.replaceState(null, "", next);
  }, [group, query, sort, streamer, year]);

  function clearFilters() {
    setQuery("");
    setGroup("");
    setStreamer("");
    setYear("");
    setSort("newest");
    setVisibleCount(PAGE_SIZE);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  function updateGroup(value: string) {
    setGroup(value);
    setVisibleCount(PAGE_SIZE);
  }

  function updateStreamer(value: string) {
    setStreamer(value);
    setVisibleCount(PAGE_SIZE);
  }

  function updateYear(value: string) {
    setYear(value);
    setVisibleCount(PAGE_SIZE);
  }

  function updateSort(value: SortMode) {
    setSort(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand-row">
          <Brand />
          <div className="site-control-group">
            <DownloadSettings
              settings={downloadSettings}
              detectedPlatform={detectedPlatform}
              resolvedPlatform={resolvedPlatform}
              onChange={updateDownloadSettings}
              placement="left"
            />
            <ThemeToggle />
          </div>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">瀏覽</p>
          <button
            type="button"
            className={!group ? "sidebar-nav active" : "sidebar-nav"}
            onClick={() => updateGroup("")}
          >
            <Library aria-hidden="true" />
            所有 VOD
            <span>{countLabel(cards.length)}</span>
          </button>
          {groups.map((item) => (
            <button
              type="button"
              className={group === item ? "sidebar-nav active" : "sidebar-nav"}
              onClick={() => updateGroup(item)}
              key={item}
            >
              <Sparkles aria-hidden="true" />
              <span className="sidebar-nav-name">{item}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-dataset">
          <span>資料集 v1.0.0</span>
          <strong>{countLabel(counts.performances)} 次演唱</strong>
          <small>更新於 {publishedLabel(publishedAt)}</small>
        </div>

        <nav className="sidebar-links" aria-label="Oshi 相關服務">
          <a href="https://prism.oshi.tw" target="_blank" rel="noreferrer">
            Prism 歌曲庫 <ExternalLink aria-hidden="true" />
          </a>
          <a href="https://crystal.oshi.tw" target="_blank" rel="noreferrer">
            回報與建議 <ExternalLink aria-hidden="true" />
          </a>
        </nav>
      </aside>

      <div className="mobile-header">
        <Brand compact />
        <div className="site-control-group">
          <DownloadSettings
            settings={downloadSettings}
            detectedPlatform={detectedPlatform}
            resolvedPlatform={resolvedPlatform}
            onChange={updateDownloadSettings}
          />
          <ThemeToggle />
        </div>
      </div>

      <main className="browser-main">
        <section className="browser-panel">
          <header className="page-intro">
            <div>
              <p className="eyebrow">
                <Sparkles aria-hidden="true" /> VTuber 歌回資料庫
              </p>
              <h1>快速找到，想再聽一次的歌。</h1>
              <p>
                從 VOD、VTuber、歌曲或原唱開始搜尋，直接回到演唱發生的那一刻。
              </p>
            </div>
            <dl className="stat-strip" aria-label="資料庫統計">
              <div>
                <dt>VTuber</dt>
                <dd>{countLabel(counts.streamers)}</dd>
              </div>
              <div>
                <dt>VOD</dt>
                <dd>{countLabel(counts.vods)}</dd>
              </div>
              <div>
                <dt>演唱</dt>
                <dd>{countLabel(counts.performances)}</dd>
              </div>
            </dl>
          </header>

          <div className="search-hero">
            <Search aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="搜尋 VOD、VTuber、歌曲或原唱…"
              aria-label="搜尋 VOD、VTuber、歌曲或原唱"
            />
            {query && (
              <button type="button" onClick={() => updateQuery("")} aria-label="清除搜尋">
                <X aria-hidden="true" />
              </button>
            )}
          </div>

          <section className="talent-rail-section" aria-labelledby="talent-heading">
            <div className="section-heading compact">
              <div>
                <p className="section-kicker">快速篩選</p>
                <h2 id="talent-heading">選擇 VTuber</h2>
              </div>
            </div>
            <div className="talent-rail scrollbar-none">
              <button
                type="button"
                className={!streamer ? "talent-chip active" : "talent-chip"}
                onClick={() => updateStreamer("")}
              >
                <span className="all-talent-mark">
                  <Sparkles aria-hidden="true" />
                </span>
                <span>全部</span>
                <small>{countLabel(cards.length)}</small>
              </button>
              {streamers.map((item) => (
                <button
                  type="button"
                  className={streamer === item.slug ? "talent-chip active" : "talent-chip"}
                  onClick={() => updateStreamer(item.slug)}
                  key={item.slug}
                >
                  <Avatar src={item.avatarUrl} name={item.displayName} size="medium" />
                  <span title={item.displayName}>{item.displayName}</span>
                  <small>{item.vodCount}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="archive-section" aria-labelledby="archive-heading">
            <div className="section-heading archive-heading">
              <div>
                <p className="section-kicker">Archive</p>
                <h2 id="archive-heading">VOD 封存庫</h2>
                <p aria-live="polite">找到 {countLabel(filteredCards.length)} 部 VOD</p>
              </div>
              {hasFilters && (
                <button type="button" className="clear-filter" onClick={clearFilters}>
                  <X aria-hidden="true" /> 清除篩選
                </button>
              )}
            </div>

            <div className="filter-toolbar">
              <label className="select-control">
                <ListFilter aria-hidden="true" />
                <span className="sr-only">選擇團體</span>
                <select value={group} onChange={(event) => updateGroup(event.target.value)}>
                  <option value="">所有團體</option>
                  {groups.map((item) => (
                    <option value={item} key={item}>{item}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>

              <label className="select-control">
                <CalendarDays aria-hidden="true" />
                <span className="sr-only">選擇年份</span>
                <select value={year} onChange={(event) => updateYear(event.target.value)}>
                  <option value="">所有年份</option>
                  {years.map((item) => (
                    <option value={item} key={item}>{item} 年</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>

              <div className="sort-control" aria-label="排序方式">
                <button
                  type="button"
                  className={sort === "newest" ? "active" : ""}
                  onClick={() => updateSort("newest")}
                  title="最新優先"
                >
                  <ArrowDownAZ aria-hidden="true" />
                  <span>最新</span>
                </button>
                <button
                  type="button"
                  className={sort === "oldest" ? "active" : ""}
                  onClick={() => updateSort("oldest")}
                  title="最舊優先"
                >
                  <ArrowUpAZ aria-hidden="true" />
                  <span>最舊</span>
                </button>
                <button
                  type="button"
                  className={sort === "songs" ? "active" : ""}
                  onClick={() => updateSort("songs")}
                  title="歌曲數優先"
                >
                  <Music2 aria-hidden="true" />
                  <span>歌曲數</span>
                </button>
              </div>
            </div>

            {filteredCards.length ? (
              <>
                <div className="vod-grid">
                  {filteredCards.slice(0, visibleCount).map((card) => (
                    <VodCard card={card} key={card.id} />
                  ))}
                </div>
                {visibleCount < filteredCards.length && (
                  <div className="load-more-wrap">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}
                    >
                      載入更多
                      <span>{Math.min(PAGE_SIZE, filteredCards.length - visibleCount)}</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <span><Search aria-hidden="true" /></span>
                <h3>沒有符合條件的 VOD</h3>
                <p>換個關鍵字，或清除部分篩選條件再試一次。</p>
                <button type="button" className="primary-button" onClick={clearFilters}>
                  清除所有篩選
                </button>
              </div>
            )}
          </section>

          <footer className="site-footer">
            <span>VODs by oshi.tw</span>
            <span>資料來自 Prism 公開 VOD 快照</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
