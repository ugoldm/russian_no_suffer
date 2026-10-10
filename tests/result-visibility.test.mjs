import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../server/demo-content.mjs";
import { execute } from "../server/engine.mjs";

const teacher = { id: "teacher", teacher: true };
const student = { id: "student", teacher: false };

test("only teachers can hide saved work; hiding and restoring preserve student results", () => {
  const state = initialState();
  const start = () =>
    execute(
      state,
      "start_attempt",
      {
        token: state.tests[0].shareToken,
        name: "Проверка скрытия",
      },
      student,
    );
  const work = start();
  const result = execute(
    state,
    "submit_attempt",
    {
      attemptId: work.id,
      answers: {},
    },
    student,
  );
  const before = structuredClone(state.attempts[0]);
  const setHidden = (hidden, actor = teacher, id = work.id) =>
    execute(
      state,
      "teacher_set_result_hidden",
      { attemptId: id, hidden },
      actor,
    );

  assert.equal(
    execute(state, "teacher_overview", {}, teacher).results[0].teacherHidden,
    false,
  );
  assert.throws(() => setHidden(true, student), /преподавателя/);
  for (const hidden of [undefined, null, "true", 1]) {
    assert.throws(() => setHidden(hidden), /нужно ли скрыть/);
  }
  assert.throws(() => setHidden(true, teacher, "missing"), /не найден/);
  assert.throws(() => setHidden(true, teacher, start().id), /не найден/);
  assert.deepEqual(state.attempts[0], before);

  for (const hidden of [true, true, false, false]) {
    assert.deepEqual(setHidden(hidden), { id: work.id, teacherHidden: hidden });
    const listed = execute(state, "teacher_overview", {}, teacher).results;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].teacherHidden, hidden);
    assert.deepEqual(
      execute(state, "get_attempt", { attemptId: work.id }, student),
      result,
    );
    assert.deepEqual(
      execute(state, "teacher_result", { attemptId: work.id }, teacher),
      result,
    );
    assert.deepEqual(
      execute(
        state,
        "submit_attempt",
        {
          attemptId: work.id,
          answers: {},
          teacherHidden: !hidden,
        },
        student,
      ),
      result,
    );
    const { teacherHidden, ...saved } = state.attempts[0];
    assert.deepEqual(saved, before);
    assert.equal(teacherHidden, hidden);
  }
});
