import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTimestamp,
  resolveTimelineScale,
  timelinePercent,
  timelineSegments,
  timelineTicks,
} from "../lib/song-timeline.ts";

const performances = [
  { performanceId: "first", startSeconds: 477, endSeconds: 755 },
  { performanceId: "last", startSeconds: 7281, endSeconds: 7564 },
];

test("formats timeline labels like the player caption", () => {
  for (const [seconds, label] of [
    [0, "0:00"],
    [65, "1:05"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [7745, "2:09:05"],
    [7745.9, "2:09:05"],
    [-5, "0:00"],
  ]) {
    assert.equal(formatTimestamp(seconds), label, `${seconds}s`);
  }
});

test("waits for the player before choosing the timeline length", () => {
  assert.equal(resolveTimelineScale(performances, null, false), null);
});

test("uses the video length reported by the YouTube player", () => {
  assert.equal(resolveTimelineScale(performances, 7745, false), 7745);
  assert.equal(resolveTimelineScale(performances, 7745, true), 7745);
});

test("never cuts off a song when the reported length ends before it", () => {
  assert.equal(resolveTimelineScale(performances, 7000, true), 7564);
});

test("falls back to the last song's end when the player settles without a length", () => {
  assert.equal(resolveTimelineScale(performances, null, true), 7564);
});

test("positions each song as a share of the timeline", () => {
  const songs = [
    { performanceId: "a", startSeconds: 100, endSeconds: 250 },
    { performanceId: "b", startSeconds: 600, endSeconds: 800 },
  ];

  assert.deepEqual(
    timelineSegments(songs, 800).map(
      ({ performance, index, leftPercent, widthPercent }) => [
        performance.performanceId,
        index,
        leftPercent,
        widthPercent,
      ],
    ),
    [
      ["a", 0, 12.5, 18.75],
      ["b", 1, 75, 25],
    ],
  );
});

test("keeps the playhead on the timeline", () => {
  assert.equal(timelinePercent(200, 800), 25);
  assert.equal(timelinePercent(-3, 800), 0);
  assert.equal(timelinePercent(1200, 800), 100);
});

test("labels the axis at round intervals and the full length", () => {
  for (const [scale, ticks] of [
    [7745, [0, 1800, 3600, 5400, 7745]],
    [3374, [0, 900, 1800, 2700, 3374]],
    [21600, [0, 7200, 14400, 21600]],
    [90, [0, 60, 90]],
  ]) {
    assert.deepEqual(timelineTicks(scale), ticks, `${scale}s`);
  }
});

test("drops a round tick that would crowd the end label", () => {
  assert.deepEqual(timelineTicks(7300), [0, 1800, 3600, 5400, 7300]);
  assert.deepEqual(timelineTicks(8000), [0, 1800, 3600, 5400, 7200, 8000]);
});
