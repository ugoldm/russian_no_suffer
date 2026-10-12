import test from "node:test";
import assert from "node:assert/strict";
import {
  answerFilled,
  missingAnswers,
} from "../shared/answer-completeness.mjs";
import { initialState } from "../server/demo-content.mjs";
import { execute } from "../server/engine.mjs";
import { groupedFixture } from "./fixtures/grouped-test.mjs";
import { filledAnswers } from "./fixtures/filled-answers.mjs";
const student = { id: "required-student" };

test("presence uses the same rule for all answer formats, including whitespace and grouped tasks", () => {
  for (const type of ["text", "single"]) {
    for (const raw of [undefined, null, "", " \t\n\u00a0\u2003\ufeff", [], {}])
      assert.equal(answerFilled({ type }, raw), false);
    assert.equal(answerFilled({ type }, "0"), true);
    assert.equal(answerFilled({ type }, " неверный ответ "), true);
  }
  assert.equal(answerFilled({ type: "multiple" }, []), false);
  assert.equal(answerFilled({ type: "multiple" }, "1"), false);
  assert.equal(answerFilled({ type: "multiple" }, ["1"]), true);
  const group = groupedFixture().exercises[0];
  assert.deepEqual(
    missingAnswers([group], { [group.id]: { 10: "123", 11: ["b"], 12: " " } }),
    [
      {
        position: 0,
        exerciseId: group.id,
        itemId: "12",
        label: "Упражнение 1, задание № 12",
      },
    ],
  );
  const numberedGroup = {
    id: "numbered-group",
    type: "group",
    items: [1, 2].map((number) => ({
      id: `task-${number}`,
      type: "multiple",
      taskNumber: 9,
      label: `Задача ${number}`,
    })),
  };
  assert.deepEqual(
    missingAnswers([numberedGroup], {
      [numberedGroup.id]: { "task-1": ["a"] },
    }).map((missing) => missing.label),
    ["Упражнение 1, задача 2"],
  );
});

test("every missing ordinary answer rejects submission without changing the draft or exposing keys", () => {
  const state = initialState();
  state.tests[0].exercises.push(
    { id: "word", type: "text", prompt: "Слово", key: ["да"] },
    {
      id: "choice",
      type: "single",
      prompt: "Выбор",
      key: ["yes"],
      options: [{ id: "yes" }, { id: "no" }],
    },
  );
  const t = state.tests[0];
  const p = execute(
    state,
    "start_attempt",
    {
      token: t.shareToken,
      name: "Проверка",
      groupDay: "monday",
      groupTime: "17:30",
    },
    student,
  );
  const complete = filledAnswers(t);
  const before = structuredClone(state.attempts);
  for (const [position, e] of t.exercises.entries()) {
    for (const raw of e.type === "multiple"
      ? [undefined, null, []]
      : [undefined, null, "", " \n\t\u00a0\u2003\ufeff"]) {
      const answers = { ...complete, [e.id]: raw };
      assert.throws(
        () =>
          execute(
            state,
            "submit_attempt",
            { attemptId: p.id, answers },
            student,
          ),
        new RegExp(`Нельзя сдать работу.*Упражнение ${position + 1}`),
      );
      assert.deepEqual(state.attempts, before);
      assert.equal(
        execute(state, "get_attempt", { attemptId: p.id }, student).status,
        "started",
      );
    }
  }
  const result = execute(
    state,
    "submit_attempt",
    { attemptId: p.id, answers: complete },
    student,
  );
  assert.equal(result.status, "submitted");
  assert.equal(result.correct, 0);
  assert.deepEqual(
    execute(state, "submit_attempt", { attemptId: p.id, answers: {} }, student),
    result,
  );
});

test("each child in every passage must be filled; historical incomplete results remain retrievable", () => {
  const t = groupedFixture(),
    state = { tests: [t], attempts: [] };
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
  const complete = filledAnswers(t),
    before = structuredClone(state.attempts);
  for (const [position, group] of t.exercises.entries()) {
    for (const item of group.items) {
      const answers = structuredClone(complete);
      delete answers[group.id][item.id];
      assert.throws(
        () =>
          execute(
            state,
            "submit_attempt",
            { attemptId: p.id, answers },
            student,
          ),
        new RegExp(`Упражнение ${position + 1}, задание № ${item.taskNumber}`),
      );
      assert.deepEqual(state.attempts, before);
    }
  }
  const result = execute(
    state,
    "submit_attempt",
    { attemptId: p.id, answers: complete },
    student,
  );
  assert.equal(result.total, 15);
  state.attempts[0].answers = {};
  state.attempts[0].correct = 0;
  const legacy = execute(state, "get_attempt", { attemptId: p.id }, student);
  assert.deepEqual(
    execute(state, "submit_attempt", { attemptId: p.id, answers: {} }, student),
    legacy,
  );
});
