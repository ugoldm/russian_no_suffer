import test from "node:test";
import assert from "node:assert/strict";
import {
  isNetworkError,
  submissionErrorText,
  submitWithRetry,
} from "../src/submission.ts";
import { initialState } from "../server/demo-content.mjs";
import { execute } from "../server/engine.mjs";
import { filledAnswers } from "./fixtures/filled-answers.mjs";

test("recognizes browser and Supabase transport errors without masking server errors", () => {
  for (const message of [
    "Load failed",
    "TypeError: Load failed",
    "Failed to fetch",
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Network request failed",
  ]) {
    assert.equal(isNetworkError(new TypeError(message)), true);
    assert.equal(isNetworkError({ message, code: "" }), true);
    assert.match(submissionErrorText(new Error(message)), /Ответы остаются/);
  }
  for (const message of [
    "Нельзя сдать работу: остались задания без ответа.",
    "Попытка недоступна.",
    "JWT expired",
    "Database error: Load failed",
  ]) {
    assert.equal(isNetworkError(new Error(message)), false);
    assert.equal(submissionErrorText(new Error(message)), message);
  }
});

test("retries a failed transport once, and leaves a persistent failure visible", async () => {
  let calls = 0;
  const result = await submitWithRetry(async () => {
    if (++calls === 1) throw new TypeError("Load failed");
    return { status: "submitted" };
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "submitted");
  calls = 0;
  await assert.rejects(
    submitWithRetry(async () => {
      calls++;
      throw new TypeError("Load failed");
    }),
    /Load failed/,
  );
  assert.equal(calls, 2);
});

test("does not retry rejected answers or other server errors", async () => {
  let calls = 0;
  await assert.rejects(
    submitWithRetry(async () => {
      calls++;
      throw new Error("Нельзя сдать работу: остались задания без ответа.");
    }),
    /Нельзя сдать работу/,
  );
  assert.equal(calls, 1);
});

test("lost submission response recovers the same saved attempt without a duplicate", async () => {
  const state = initialState();
  const actor = { id: "retry-student", teacher: false };
  const exam = state.tests[0];
  const attempt = execute(
    state,
    "start_attempt",
    {
      token: exam.shareToken,
      name: "Проверка повторной отправки",
      groupDay: "monday",
      groupTime: "17:30",
    },
    actor,
  );
  const args = { attemptId: attempt.id, answers: filledAnswers(exam) };
  let calls = 0;
  let committed;
  const result = await submitWithRetry(async () => {
    const saved = execute(state, "submit_attempt", args, actor);
    if (++calls === 1) {
      committed = saved;
      throw new TypeError("Load failed");
    }
    return saved;
  });
  assert.deepEqual(result, committed);
  assert.equal(result.id, attempt.id);
  assert.equal(result.status, "submitted");
  assert.equal(state.attempts.length, 1);
});
