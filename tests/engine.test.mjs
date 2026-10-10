import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../server/demo-content.mjs";
import { execute, grade, migrateState } from "../server/engine.mjs";
const teacher = { id: "teacher", teacher: true },
  student = { id: "student", teacher: false };
function setup() {
  const s = initialState();
  const test = s.tests[0];
  const p = execute(
    s,
    "start_attempt",
    { token: test.shareToken, name: "Тестовый ученик" },
    student,
  );
  return { s, test, p };
}
test("student conditions contain no keys or explanations, teacher access rejected", () => {
  const { s, test } = setup();
  const data = execute(s, "get_test", { token: test.shareToken }, student);
  assert.ok(!JSON.stringify(data).includes("explanation"));
  assert.ok(data.exercises.every((e) => !("key" in e)));
  assert.throws(
    () => execute(s, "teacher_overview", {}, student),
    /преподавателя/,
  );
});
test("grading treats choices as a set, rejects duplicates and invalid choices", () => {
  const e = initialState().tests[0].exercises[0];
  assert.equal(grade(e, [...e.key].reverse()), true);
  assert.equal(grade(e, [e.key[0]]), false);
  assert.equal(grade(e, []), false);
  assert.throws(() => grade(e, [e.key[0], e.key[0]]));
  assert.throws(() => grade(e, ["99"]));
  const separatedIds = {
    type: "multiple",
    options: [{ id: "a" }, { id: "b" }, { id: "a|b" }],
    key: ["a|b"],
  };
  assert.equal(grade(separatedIds, ["a", "b"]), false);
});
test("server computes score, skips count as wrong, retry does not overwrite", () => {
  const { s, p } = setup();
  const answers = Object.fromEntries(
    s.tests[0].exercises.slice(0, 4).map((e) => [e.id, e.key]),
  );
  const result = execute(
    s,
    "submit_attempt",
    { attemptId: p.id, answers, percentage: 100 },
    student,
  );
  assert.equal(result.correct, 4);
  assert.equal(result.total, 6);
  assert.equal(result.percentage, 67);
  const retry = execute(
    s,
    "submit_attempt",
    { attemptId: p.id, answers: {} },
    student,
  );
  assert.deepEqual(retry, result);
  assert.equal(s.attempts.length, 1);
});
test("foreign attempts and injected exercise IDs are rejected without committing", () => {
  const { s, p } = setup();
  assert.throws(
    () => execute(s, "get_attempt", { attemptId: p.id }, { id: "other" }),
    /недоступна/,
  );
  assert.throws(
    () =>
      execute(
        s,
        "submit_attempt",
        { attemptId: p.id, answers: { fake: ["1"] } },
        student,
      ),
    /другого теста/,
  );
  assert.equal(s.attempts[0].status, "started");
});
test("archived tests prevent starting but allow submitting an existing attempt", () => {
  const { s, p, test } = setup();
  test.status = "archived";
  assert.throws(
    () =>
      execute(
        s,
        "start_attempt",
        { token: test.shareToken, name: "Ученик" },
        student,
      ),
    /новых попыток/,
  );
  assert.equal(
    execute(s, "submit_attempt", { attemptId: p.id, answers: {} }, student)
      .percentage,
    0,
  );
});
test("repeats are separate and matching names do not identify owners", () => {
  const { s, p, test } = setup();
  execute(s, "submit_attempt", { attemptId: p.id, answers: {} }, student);
  const p2 = execute(
    s,
    "start_attempt",
    { token: test.shareToken, name: "Тестовый ученик" },
    student,
  );
  const p3 = execute(
    s,
    "start_attempt",
    { token: test.shareToken, name: "Тестовый ученик" },
    { id: "other" },
  );
  assert.notEqual(p.id, p2.id);
  assert.equal(s.attempts.find((x) => x.id === p2.id).attemptNumber, 2);
  assert.equal(s.attempts.find((x) => x.id === p3.id).attemptNumber, 1);
});
test("text normalizes only configured rules, preserves ё and spaces", () => {
  const e = {
    type: "text",
    key: ["ёлка"],
    normalization: { trim: true, ignoreCase: true },
  };
  assert.equal(grade(e, " ЁЛКА "), true);
  assert.equal(grade(e, "елка"), false);
  assert.equal(grade(e, "ё лка"), false);
});

test("test links are stable, version-specific, and sharing creates no records", () => {
  const { s, test: first, p } = setup();
  const second = {
    ...structuredClone(first),
    versionId: "new-version",
    version: 2,
    shareToken: "new-token",
  };
  second.exercises[0].key = ["3"];
  s.tests.push(second);
  const overview = execute(s, "teacher_overview", {}, teacher);
  assert.deepEqual(Object.keys(overview).sort(), ["results", "tests"]);
  assert.equal(overview.tests.length, 1);
  assert.equal(overview.tests[0].shareToken, "new-token");
  assert.equal(
    execute(s, "get_test", { token: first.shareToken }, student).versionId,
    first.versionId,
  );
  assert.throws(
    () => execute(s, "get_test", { token: "missing" }, student),
    /не найден/,
  );
  assert.throws(() => execute(s, "teacher_issue", {}, teacher), /Неизвестное/);
  const r = execute(
    s,
    "submit_attempt",
    { attemptId: p.id, answers: { "stress-1": first.exercises[0].key } },
    student,
  );
  assert.equal(r.correct, 1);
  assert.equal(r.versionId, first.versionId);
  assert.equal(r.testId, first.id);
});
test("legacy local data upgrades without losing answers or active links", () => {
  const s = initialState();
  delete s.tests[0].shareToken;
  s.groups = [{ id: "old-group", name: "Старая группа" }];
  s.assignments = [
    {
      id: "old-link",
      token: "old-token",
      versionId: s.tests[0].versionId,
      active: true,
    },
  ];
  s.attempts = [
    {
      id: "old-attempt",
      assignmentId: "old-link",
      versionId: s.tests[0].versionId,
      ownerId: student.id,
      startedAt: "2026-10-10",
      status: "submitted",
      name: "Ученик",
      attemptNumber: 1,
      answers: {},
      correct: 0,
      total: 6,
    },
  ];
  migrateState(s);
  assert.equal(s.groups, undefined);
  assert.equal(s.assignments, undefined);
  assert.equal(s.attempts[0].assignmentId, undefined);
  assert.equal(
    execute(s, "get_test", { token: "old-token" }, student).id,
    s.tests[0].id,
  );
  assert.equal(
    execute(s, "get_attempt", { attemptId: "old-attempt" }, student).percentage,
    0,
  );
  const token = s.tests[0].shareToken;
  migrateState(s);
  assert.equal(s.tests[0].shareToken, token);
});
