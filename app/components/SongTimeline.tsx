"use client";

import { useLayoutEffect, useRef } from "react";
import {
  formatTimestamp,
  timelinePercent,
  timelineSegments,
  timelineTicks,
} from "../../lib/song-timeline";
import type { VodExportPerformance } from "../../lib/vod-types";
import type { PlaybackStatus } from "./InlineYouTubePlayer";

// The playhead moves well under a pixel per second on a full-length VOD.
const PLAYHEAD_REFRESH_MS = 500;
// Segments centred this close to either end anchor their tooltip inward.
const TOOLTIP_EDGE_PERCENT = 12;

interface SongTimelineProps {
  performances: VodExportPerformance[];
  /** Timeline length in seconds; null while the player has not reported it. */
  scaleSeconds: number | null;
  activePerformanceId: string | null;
  playbackStatus: PlaybackStatus;
  showPlayhead: boolean;
  getCurrentTime: () => number | null;
  onSelect: (performance: VodExportPerformance) => void;
}

/**
 * Where the songs fall within the whole VOD. Hidden from assistive technology
 * and the tab order: the song list offers the same actions with full labels.
 */
export function SongTimeline({
  performances,
  scaleSeconds,
  activePerformanceId,
  playbackStatus,
  showPlayhead,
  getCurrentTime,
  onSelect,
}: SongTimelineProps) {
  const playheadRef = useRef<HTMLSpanElement>(null);

  // A layout effect positions a newly shown playhead before it is painted.
  useLayoutEffect(() => {
    const playhead = playheadRef.current;
    if (!playhead || scaleSeconds === null) return;

    const update = () => {
      const seconds = getCurrentTime();
      if (seconds === null) return;
      playhead.style.transform = `translateX(${timelinePercent(seconds, scaleSeconds)}%)`;
    };
    update();
    if (playbackStatus !== "playing") return;

    const timer = window.setInterval(update, PLAYHEAD_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [getCurrentTime, playbackStatus, scaleSeconds, showPlayhead]);

  if (scaleSeconds === null) {
    return (
      <div className="song-timeline" aria-hidden="true">
        <div className="song-timeline-track is-loading" />
        <div className="song-timeline-axis" />
      </div>
    );
  }

  const ticks = timelineTicks(scaleSeconds);

  return (
    <div className="song-timeline" aria-hidden="true">
      <div className="song-timeline-track">
        {timelineSegments(performances, scaleSeconds).map(
          ({ performance, index, leftPercent, widthPercent }) => {
            const center = leftPercent + widthPercent / 2;
            const tooltipEdge =
              center < TOOLTIP_EDGE_PERCENT
                ? " tooltip-start"
                : center > 100 - TOOLTIP_EDGE_PERCENT
                  ? " tooltip-end"
                  : "";
            const isActive = performance.performanceId === activePerformanceId;

            return (
              <button
                key={performance.performanceId}
                type="button"
                tabIndex={-1}
                className={`song-timeline-segment${isActive ? " is-active" : ""}${tooltipEdge}`}
                style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                onClick={() => onSelect(performance)}
              >
                <span className="song-timeline-tooltip">
                  <strong>
                    {String(index + 1).padStart(2, "0")} {performance.title}
                  </strong>
                  <small>
                    {performance.originalArtist
                      ? `${performance.originalArtist} · `
                      : ""}
                    {formatTimestamp(performance.startSeconds)}–
                    {formatTimestamp(performance.endSeconds)}
                  </small>
                </span>
              </button>
            );
          },
        )}
        {showPlayhead && (
          <span className="song-timeline-playhead" ref={playheadRef} />
        )}
      </div>
      <div className="song-timeline-axis">
        {ticks.map((tick, index) => (
          <span
            key={tick}
            className={
              index === 0
                ? "is-start"
                : index === ticks.length - 1
                  ? "is-end"
                  : undefined
            }
            style={{ left: `${timelinePercent(tick, scaleSeconds)}%` }}
          >
            {formatTimestamp(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}
