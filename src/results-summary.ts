import type { Attempt } from "./types";

export function summarizeResults(
  results: Pick<Attempt, "correct" | "total" | "durationSeconds">[],
) {
  const scored = results.filter((r) => r.total > 0);
  const timed = results.filter(
    (r) =>
      typeof r.durationSeconds === "number" &&
      Number.isFinite(r.durationSeconds) &&
      r.durationSeconds >= 0,
  );
  return {
    count: results.length,
    averagePercentage: scored.length
      ? Math.round(
          (scored.reduce((sum, r) => sum + r.correct / r.total, 0) /
            scored.length) *
            100,
        )
      : null,
    averageDurationSeconds: timed.length
      ? Math.round(
          timed.reduce((sum, r) => sum + r.durationSeconds!, 0) / timed.length,
        )
      : null,
    timedCount: timed.length,
  };
}
