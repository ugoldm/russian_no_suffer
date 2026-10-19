import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreAnswer,
  execute,
  publicExercise,
  resultExercise,
} from "../server/engine.mjs";
import { validateTest } from "../scripts/import-sql.mjs";
import { demoTest } from "../server/demo-content.mjs";
export const positionalFixture = () => ({
  id: "match",
  type: "text",
  prompt: "Сопоставьте элементы.",
  key: ["12345"],
  scoring: { type: "positional" },
  normalization: { trim: true },
  matchingTable: {
    leftTitle: "Правила",
    rightTitle: "Предложения",
    left: [..."АБВГД"].map((id) => ({ id, text: `Правило ${id}` })),
    right: [..."123456789"].map((id) => ({ id, text: `Пример ${id}` })),
  },
});
test("positional points count only exact positions and reject separators and wrong length", () => {
  const e = positionalFixture();
  for (let mask = 0; mask < 32; mask++) {
    const raw = [...e.key[0]]
      .map((digit, i) => (mask & (1 << i) ? digit : "9"))
      .join("");
    const count = mask.toString(2).replaceAll("0", "").length;
    assert.equal(
      scoreAnswer(e, raw),
      count === 5 ? 2 : count >= 3 ? 1 : 0,
      raw,
    );
  }
  for (const raw of [
    "54321",
    "21354",
    "1 345",
    "12,45",
    "123456",
    "1234",
    " 12345 ",
    "１２３４５",
    null,
  ])
    assert.equal(scoreAnswer(e, raw), 0, String(raw));
  assert.throws(() => scoreAnswer(e, ["12345"]), /Некорректный/);
  assert.equal(publicExercise(e).key, undefined);
  assert.equal(publicExercise(e).normalization, undefined);
  const t = { ...structuredClone(demoTest), exercises: [e], maximumScore: 2 };
  validateTest(t);
  for (const changed of [
    { scoring: { type: "other" } },
    { scoring: { type: "positional", extra: 1 } },
    { normalization: { digitSet: true } },
    { type: "multiple" },
  ])
    assert.throws(() =>
      validateTest({ ...t, exercises: [{ ...e, ...changed }] }),
    );
  assert.throws(() => validateTest({ ...t, maximumScore: 1 }));
});
test("student, teacher and grouped review share points, totals and immutable replay", () => {
  const e = positionalFixture(),
    t = { ...structuredClone(demoTest), exercises: [e], maximumScore: 2 };
  for (const [raw, points] of [
    ["99999", 0],
    ["12399", 1],
    ["12349", 1],
    ["12345", 2],
  ]) {
    const state = { tests: [t], attempts: [] },
      actor = { id: "synthetic-student" };
    const p = execute(
      state,
      "start_attempt",
      {
        token: t.shareToken,
        name: "Проверка",
        groupDay: "monday",
        groupTime: "17:30",
      },
      actor,
    );
    const r = execute(
      state,
      "submit_attempt",
      { attemptId: p.id, answers: { match: raw }, correct: 100, total: 1 },
      actor,
    );
    assert.equal(r.correct, points);
    assert.equal(r.total, 2);
    assert.equal(r.percentage, points * 50);
    assert.equal(r.exercises[0].score, points);
    assert.equal(r.exercises[0].total, 2);
    assert.equal(r.exercises[0].rawAnswer, raw);
    assert.deepEqual(
      execute(state, "teacher_result", { attemptId: p.id }, { teacher: true }),
      r,
    );
    assert.deepEqual(
      execute(state, "submit_attempt", { attemptId: p.id, answers: {} }, actor),
      r,
    );
  }
  const grouped = resultExercise(
    { id: "group", type: "group", items: [e] },
    { match: "12345" },
  );
  assert.equal(grouped.score, 2);
  assert.equal(grouped.total, 2);
  assert.equal(grouped.correct, true);
});
