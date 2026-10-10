import assert from "node:assert/strict";
import test from "node:test";
import { readVideoDuration } from "../lib/youtube-api.ts";

test("treats a duration YouTube has not loaded yet as unknown", () => {
  // The IFrame API reports 0 until the video's metadata arrives.
  for (const reported of [0, Number.NaN, -1]) {
    assert.equal(
      readVideoDuration({ getDuration: () => reported }),
      null,
      `${reported}`,
    );
  }
});

test("passes through the video length once YouTube reports it", () => {
  assert.equal(readVideoDuration({ getDuration: () => 7745 }), 7745);
});
