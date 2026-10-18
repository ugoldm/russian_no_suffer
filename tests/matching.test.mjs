import test from "node:test";
import assert from "node:assert/strict";
import { validateTest } from "../scripts/import-sql.mjs";
import { answerFilled } from "../shared/answer-completeness.mjs";
import { execute, grade, publicExercise } from "../server/engine.mjs";
import { demoTest } from "../server/demo-content.mjs";

function fixture() {
  return {
    id: "matching",
    type: "text",
    prompt: "Сопоставьте элементы.",
    key: ["231"],
    normalization: { trim: true },
    matchingTable: {
      leftTitle: "Правила",
      rightTitle: "Примеры",
      left: ["А", "Б", "В"].map((id) => ({ id, text: `Правило ${id}` })),
      right: ["1", "2", "3"].map((id) => ({ id, text: `Пример ${id}` })),
    },
  };
}

test("matching preserves column positions, requires every cell and grades the exact sequence", () => {
  const e = fixture();
  for (const raw of [
    undefined,
    null,
    "",
    "   ",
    " 3 ",
    "2 1",
    "23",
    "2314",
    "2\t1",
    "2\u00a01",
  ])
    assert.equal(answerFilled(e, raw), false);
  // A filled wrong answer is present, but never correct.
  for (const raw of ["231", "213", "aaa", "000"])
    assert.equal(answerFilled(e, raw), true);
  assert.equal(grade(e, "231"), true);
  for (const raw of ["213", "132", "2 1", "2,3,1", "aaa", "000"])
    assert.equal(grade(e, raw), false);
  assert.deepEqual(publicExercise(e).matchingTable, e.matchingTable);
  assert.equal(publicExercise(e).key, undefined);
  const t = {
    ...structuredClone(demoTest),
    exercises: [e],
    exerciseCount: 1,
    maximumScore: 1,
  };
  const state = { tests: [t], attempts: [] },
    actor = { id: "matching-student" };
  const started = execute(
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
  for (const raw of [" 3 ", "2 1", "23"])
    assert.throws(
      () =>
        execute(
          state,
          "submit_attempt",
          { attemptId: started.id, answers: { matching: raw } },
          actor,
        ),
      /Без ответа/,
    );
  const result = execute(
    state,
    "submit_attempt",
    { attemptId: started.id, answers: { matching: "213" } },
    actor,
  );
  assert.equal(result.correct, 0);
  assert.equal(result.exercises[0].rawAnswer, "213");
  assert.deepEqual(result.exercises[0].correctAnswer, ["231"]);
});

test("matching import rejects ambiguous columns, invalid keys and unordered normalization", () => {
  const t = {
    ...structuredClone(demoTest),
    exercises: [fixture()],
    maximumScore: 1,
  };
  assert.equal(validateTest(t).exerciseCount, 1);
  const changes = [
    (e) => {
      e.normalization.digitSet = true;
    },
    (e) => {
      e.matchingTable.left[1].id = "А";
    },
    (e) => {
      e.matchingTable.right[0].id = "10";
    },
    (e) => {
      e.matchingTable.right[0].text = "";
    },
    (e) => {
      e.matchingTable.leftTitle = "";
    },
    (e) => {
      e.key = ["21"];
    },
    (e) => {
      e.key = ["234"];
    },
    (e) => {
      e.matchingTable = null;
    },
  ];
  for (const change of changes) {
    const bad = structuredClone(t);
    change(bad.exercises[0]);
    assert.throws(() => validateTest(bad));
  }
});
