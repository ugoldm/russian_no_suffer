import test from "node:test";
import assert from "node:assert/strict";
import { execute, publicTest } from "../server/engine.mjs";
import { validateTest } from "../scripts/import-sql.mjs";

import { groupedFixture } from "./fixtures/grouped-test.mjs";

const student = { id: "student" },
  teacher = { id: "teacher", teacher: true };
function work(t, answers) {
  const state = { tests: [t], attempts: [] };
  const p = execute(
    state,
    "start_attempt",
    {
      token: t.shareToken,
      name: "Синтетическая проверка",
      groupDay: "monday",
      groupTime: "18:30",
    },
    student,
  );
  const result = execute(
    state,
    "submit_attempt",
    { attemptId: p.id, answers, correct: 15, total: 1 },
    student,
  );
  assert.deepEqual(
    execute(state, "teacher_result", { attemptId: p.id }, teacher),
    result,
  );
  assert.deepEqual(
    execute(state, "submit_attempt", { attemptId: p.id, answers: {} }, student),
    result,
  );
  return result;
}
test("five passages award fifteen independent points including partial passages", () => {
  const t = groupedFixture();
  for (const count of [0, 1, 2, 14, 15]) {
    let n = 0;
    const answers = Object.fromEntries(
      t.exercises.map((e) => [
        e.id,
        Object.fromEntries(
          e.items.map((item) => [
            item.id,
            n++ < count
              ? item.type === "multiple"
                ? ["b"]
                : item.id === "10"
                  ? " 321 "
                  : " ЁЛКА "
              : item.type === "multiple"
                ? []
                : "",
          ]),
        ),
      ]),
    );
    const r = work(t, answers);
    assert.equal(r.total, 15);
    assert.equal(r.correct, count);
    assert.equal(r.percentage, Math.round((count / 15) * 100));
    assert.equal(r.exercises.length, 5);
    assert.equal(
      r.exercises.flatMap((e) => e.items).filter((e) => e.correct).length,
      count,
    );
    assert.equal(r.exercises[0].items[0].rawAnswer, count ? " 321 " : "");
  }
  const r = work(t, { "text-0": { 10: "123" } });
  assert.equal(r.correct, 1);
  assert.equal(r.exercises[0].score, 1);
  assert.equal(r.exercises[0].total, 3);
});
test("nested keys are private and malformed child answers cannot save work", () => {
  const t = groupedFixture(),
    clean = publicTest(t);
  const serialized = JSON.stringify(clean);
  for (const field of [
    '"key"',
    '"normalization"',
    '"correctAnswer"',
    '"explanation"',
  ])
    assert.ok(!serialized.includes(field));
  for (const bad of [
    "123",
    [],
    { unknown: "123" },
    { 10: ["123"] },
    { 11: ["b", "b"] },
  ]) {
    const state = { tests: [t], attempts: [] };
    const p = execute(
      state,
      "start_attempt",
      {
        token: t.shareToken,
        name: "Проверка",
        groupDay: "monday",
        groupTime: "18:30",
      },
      student,
    );
    assert.throws(() =>
      execute(
        state,
        "submit_attempt",
        { attemptId: p.id, answers: { "text-0": bad } },
        student,
      ),
    );
    assert.equal(state.attempts[0].status, "started");
    assert.deepEqual(state.attempts[0].answers, {});
  }
  const invalid = structuredClone(t);
  delete invalid.exercises[0].items[0].key;
  assert.throws(() => validateTest(invalid), /ключ/);
  const deep = structuredClone(t);
  deep.exercises[0].items[0] = structuredClone(t.exercises[1]);
  assert.throws(() => validateTest(deep), /группа/);
});
