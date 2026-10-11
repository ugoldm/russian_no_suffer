import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../server/demo-content.mjs";
import { execute, migrateState } from "../server/engine.mjs";
import schedule from "../shared/student-groups.json" with { type: "json" };

const student = { id: "student" };
const teacher = { id: "teacher", teacher: true };

test("every allowed group persists in drafts, student results and teacher results", () => {
  const state = initialState();
  for (const day of schedule) {
    for (const time of day.times) {
      const group = `${day.short} ${time}`;
      const work = execute(
        state,
        "start_attempt",
        {
          token: state.tests[0].shareToken,
          name: "Проверка группы",
          groupDay: day.day,
          groupTime: time,
          group: "Подставленная группа",
        },
        student,
      );
      assert.equal(work.group, group);
      assert.equal(
        execute(state, "get_attempt", { attemptId: work.id }, student).group,
        group,
      );
      const result = execute(
        state,
        "submit_attempt",
        {
          attemptId: work.id,
          answers: {},
          group: "ВС 11:30",
          groupDay: "sunday",
          groupTime: "11:30",
        },
        student,
      );
      assert.equal(result.group, group);
      assert.equal(
        execute(state, "teacher_result", { attemptId: work.id }, teacher).group,
        group,
      );
      assert.equal(
        execute(state, "teacher_overview", {}, teacher).results.find(
          (r) => r.id === work.id,
        ).group,
        group,
      );
      assert.deepEqual(
        execute(
          state,
          "submit_attempt",
          { attemptId: work.id, answers: {}, group: "ПТ 18:30" },
          student,
        ),
        result,
      );
    }
  }
});

test("missing, unknown or mismatched day/time cannot create a work", () => {
  const state = initialState();
  for (const group of [
    {},
    { group: "ПН 17:30" },
    { groupDay: "monday" },
    { groupTime: "17:30" },
    { groupDay: "saturday", groupTime: "17:30" },
    { groupDay: "monday", groupTime: "11:00" },
    { groupDay: "sunday", groupTime: "11:30 " },
    { groupDay: ["monday"], groupTime: "17:30" },
    { groupDay: "monday", groupTime: ["17:30"] },
  ]) {
    assert.throws(
      () =>
        execute(
          state,
          "start_attempt",
          {
            token: state.tests[0].shareToken,
            name: "Проверка",
            ...group,
          },
          student,
        ),
      /Выберите день и время/,
    );
    assert.equal(state.attempts.length, 0);
  }
});

test("migration preserves old submitted work and lets an old draft finish without a group", () => {
  const state = initialState();
  const start = () =>
    execute(
      state,
      "start_attempt",
      {
        token: state.tests[0].shareToken,
        name: "Старая работа",
        groupDay: "monday",
        groupTime: "17:30",
      },
      student,
    );
  const first = start();
  execute(
    state,
    "submit_attempt",
    { attemptId: first.id, answers: {} },
    student,
  );
  const draft = start();
  state.attempts.forEach((work) => {
    delete work.group;
    work.teacherSeen ??= work.status === "submitted";
  });
  const before = structuredClone(state.attempts);
  migrateState(state);
  assert.deepEqual(state.attempts, before);
  assert.equal(
    execute(state, "teacher_result", { attemptId: first.id }, teacher).group,
    null,
  );
  assert.equal(
    execute(state, "get_attempt", { attemptId: draft.id }, student).group,
    null,
  );
  assert.equal(
    execute(
      state,
      "submit_attempt",
      { attemptId: draft.id, answers: {} },
      student,
    ).group,
    null,
  );
});
