import test from "node:test";
import assert from "node:assert/strict";
import { summarizeResults } from "../src/results-summary.ts";

test("result summary gives each work equal weight and rounds only the final mean", () => {
  assert.deepEqual(
    summarizeResults([
      { correct: 2, total: 3, durationSeconds: 125 },
      { correct: 0, total: 6, durationSeconds: 126 },
    ]),
    {
      count: 2,
      averagePercentage: 33,
      averageDurationSeconds: 126,
      timedCount: 2,
    },
  );
});

test("unknown duration is excluded from the mean while a recorded zero is included", () => {
  assert.deepEqual(
    summarizeResults([
      { correct: 0, total: 10, durationSeconds: null },
      { correct: 10, total: 10, durationSeconds: 0 },
      { correct: 5, total: 10, durationSeconds: 120 },
    ]),
    {
      count: 3,
      averagePercentage: 50,
      averageDurationSeconds: 60,
      timedCount: 2,
    },
  );
  assert.equal(
    summarizeResults([{ correct: 1, total: 1, durationSeconds: null }])
      .averageDurationSeconds,
    null,
  );
});

test("an empty list has no average values", () => {
  assert.deepEqual(summarizeResults([]), {
    count: 0,
    averagePercentage: null,
    averageDurationSeconds: null,
    timedCount: 0,
  });
});
