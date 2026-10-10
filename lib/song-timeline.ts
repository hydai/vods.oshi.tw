import type { VodExportPerformance } from "./vod-types";

type TimedPerformance = Pick<VodExportPerformance, "startSeconds" | "endSeconds">;

export interface TimelineSegment<T extends TimedPerformance> {
  performance: T;
  index: number;
  leftPercent: number;
  widthPercent: number;
}

const LARGEST_TICK_STEP_SECONDS = 21_600;
const TICK_STEPS_SECONDS = [
  60,
  300,
  600,
  900,
  1_800,
  3_600,
  7_200,
  10_800,
  LARGEST_TICK_STEP_SECONDS,
];
const MAX_INTERIOR_TICKS = 4;
// Share of the timeline kept clear before the end label so a round tick
// never overlaps it.
const END_LABEL_CLEARANCE = 0.08;

export function formatTimestamp(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

/**
 * The timeline's length in seconds: the video length reported by the YouTube
 * player, or the last song's end once the player has settled without one.
 * Null while the player is still loading, so segments are never drawn on a
 * provisional scale and then shifted.
 */
export function resolveTimelineScale(
  performances: readonly TimedPerformance[],
  reportedDuration: number | null,
  settled: boolean,
): number | null {
  const lastEnd = performances.reduce(
    (end, performance) => Math.max(end, performance.endSeconds),
    0,
  );
  if (reportedDuration !== null) return Math.max(reportedDuration, lastEnd);
  return settled ? lastEnd : null;
}

export function timelinePercent(seconds: number, scale: number): number {
  return (Math.min(Math.max(seconds, 0), scale) * 100) / scale;
}

export function timelineSegments<T extends TimedPerformance>(
  performances: readonly T[],
  scale: number,
): TimelineSegment<T>[] {
  return performances.map((performance, index) => ({
    performance,
    index,
    leftPercent: timelinePercent(performance.startSeconds, scale),
    widthPercent: timelinePercent(
      performance.endSeconds - performance.startSeconds,
      scale,
    ),
  }));
}

/** Axis labels: 0, up to four round intervals, and the full length. */
export function timelineTicks(scale: number): number[] {
  const step =
    TICK_STEPS_SECONDS.find(
      (candidate) => Math.ceil(scale / candidate) - 1 <= MAX_INTERIOR_TICKS,
    ) ?? LARGEST_TICK_STEP_SECONDS;
  const ticks = [0];
  for (
    let tick = step;
    tick < scale * (1 - END_LABEL_CLEARANCE);
    tick += step
  ) {
    ticks.push(tick);
  }
  ticks.push(scale);
  return ticks;
}
