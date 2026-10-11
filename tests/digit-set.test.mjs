import test from "node:test";
import assert from "node:assert/strict";
import { grade, execute } from "../server/engine.mjs";
import { initialState, demoTest } from "../server/demo-content.mjs";
import { validateTest } from "../scripts/import-sql.mjs";

const exercise = {
  id: "digits",
  prompt: "Укажите номера.",
  type: "text",
  key: ["123"],
  normalization: { trim: true, digitSet: true },
};
test("digit sets accept all permutations but reject missing, extra and repeated digits", () => {
  for (const raw of ["123", "132", "213", "231", "312", "321", " 231 "])
    assert.equal(grade(exercise, raw), true, raw);
  for (const raw of [
    "",
    " ",
    "12",
    "1234",
    "1223",
    "1123",
    "1,2,3",
    "1 2 3",
    "12a",
    "１２３",
    "1\n23",
  ])
    assert.equal(grade(exercise, raw), false, raw);
  assert.equal(grade(exercise, null), false);
  assert.equal(
    grade({ ...exercise, normalization: { trim: true } }, "321"),
    false,
  );
  assert.equal(grade({ ...exercise, key: ["7"] }, "7"), true);
  assert.equal(grade({ ...exercise, key: ["7"] }, "77"), false);
});
test("unordered checking preserves the submitted text and retry result", () => {
  const state = initialState();
  state.tests[0].exercises = [structuredClone(exercise)];
  const actor = { id: "digit-student" };
  const started = execute(
    state,
    "start_attempt",
    {
      token: state.tests[0].shareToken,
      name: "Проверка",
      groupDay: "monday",
      groupTime: "17:30",
    },
    actor,
  );
  const result = execute(
    state,
    "submit_attempt",
    { attemptId: started.id, answers: { digits: "231" } },
    actor,
  );
  assert.equal(result.percentage, 100);
  assert.equal(result.exercises[0].rawAnswer, "231");
  assert.deepEqual(result.exercises[0].correctAnswer, ["123"]);
  assert.deepEqual(
    execute(state, "teacher_result", { attemptId: started.id }, { teacher: 1 }),
    result,
  );
  assert.deepEqual(
    execute(
      state,
      "submit_attempt",
      { attemptId: started.id, answers: { digits: "12" } },
      actor,
    ),
    result,
  );
});
test("import requires explicit digitSet rules and valid keys", () => {
  const input = {
    ...structuredClone(demoTest),
    exercises: [structuredClone(exercise)],
  };
  assert.equal(validateTest(input).exerciseCount, 1);
  for (const key of ["1123", "1,2,3", "кот", ""])
    assert.throws(() =>
      validateTest({ ...input, exercises: [{ ...exercise, key: [key] }] }),
    );
  assert.throws(
    () =>
      validateTest({
        ...input,
        exercises: [{ ...exercise, normalization: { digitSet: "true" } }],
      }),
    /нормализации/,
  );
  assert.throws(
    () =>
      validateTest({
        ...input,
        exercises: [
          {
            ...exercise,
            type: "single",
            options: [
              { id: "123", text: "Первый" },
              { id: "321", text: "Второй" },
            ],
          },
        ],
      }),
    /текстового/,
  );
});
