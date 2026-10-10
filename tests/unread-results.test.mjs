import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../server/demo-content.mjs";
import { execute, migrateState } from "../server/engine.mjs";

const teacher = { id: "teacher", teacher: true };
const student = { id: "student", teacher: false };

test("read acknowledgement is secure, snapshot-based, idempotent and preserves results", () => {
  const state = initialState();
  const start = () =>
    execute(
      state,
      "start_attempt",
      {
        token: state.tests[0].shareToken,
        name: "Проверка уведомлений",
      },
      student,
    );
  const finish = (work) =>
    execute(
      state,
      "submit_attempt",
      {
        attemptId: work.id,
        answers: {},
        teacherSeen: true,
      },
      student,
    );
  const overview = () => execute(state, "teacher_overview", {}, teacher);
  const seen = (ids, actor = teacher) =>
    execute(state, "teacher_mark_results_seen", { attemptIds: ids }, actor);
  const first = start();
  assert.equal(overview().results.length, 0);
  const result = finish(first);
  assert.equal(overview().results[0].teacherUnread, true);
  const snapshot = overview().results.map((r) => r.id);
  const second = start();
  finish(second);
  const unfinished = start();
  assert.throws(() => seen(snapshot, student), /преподавателя/);
  for (const ids of [null, "all", [null], [""], Array(501).fill(first.id)]) {
    assert.throws(() => seen(ids), /список/);
  }
  assert.throws(() => seen([first.id, "missing"]), /недоступен/);
  assert.throws(() => seen([first.id, unfinished.id]), /недоступен/);
  assert.ok(overview().results.every((r) => r.teacherUnread));
  assert.deepEqual(seen(snapshot), { seenIds: [first.id] });
  assert.equal(
    overview().results.find((r) => r.id === first.id).teacherUnread,
    false,
  );
  assert.equal(
    overview().results.find((r) => r.id === second.id).teacherUnread,
    true,
  );
  assert.deepEqual(seen([first.id, first.id]), { seenIds: [first.id] });
  assert.deepEqual(seen([]), { seenIds: [] });
  assert.deepEqual(finish(first), result);
  assert.equal(
    overview().results.find((r) => r.id === first.id).teacherUnread,
    false,
  );
  assert.deepEqual(
    execute(state, "teacher_result", { attemptId: first.id }, teacher),
    result,
  );
  assert.equal(result.teacherSeen, undefined);
  assert.equal(result.teacherUnread, undefined);
  migrateState(state);
  assert.equal(
    overview().results.find((r) => r.id === first.id).teacherUnread,
    false,
  );
  assert.equal(
    overview().results.find((r) => r.id === second.id).teacherUnread,
    true,
  );
});

test("legacy results start as seen; submitting an older draft still makes new unread work", () => {
  const state = initialState();
  const first = execute(
    state,
    "start_attempt",
    { token: state.tests[0].shareToken, name: "Старая работа" },
    student,
  );
  execute(
    state,
    "submit_attempt",
    { attemptId: first.id, answers: {} },
    student,
  );
  delete state.attempts[0].teacherSeen;
  const draft = execute(
    state,
    "start_attempt",
    { token: state.tests[0].shareToken, name: "Черновик" },
    student,
  );
  migrateState(state);
  assert.equal(
    execute(state, "teacher_overview", {}, teacher).results[0].teacherUnread,
    false,
  );
  execute(
    state,
    "submit_attempt",
    { attemptId: draft.id, answers: {} },
    student,
  );
  assert.equal(
    execute(state, "teacher_overview", {}, teacher).results.find(
      (r) => r.id === draft.id,
    ).teacherUnread,
    true,
  );
});
