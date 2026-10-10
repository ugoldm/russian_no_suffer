import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../server/demo-content.mjs";
import { execute, grade } from "../server/engine.mjs";
const teacher = { id: "teacher", teacher: true },
  student = { id: "student", teacher: false };
function setup() {
  const s = initialState();
  const assignment = execute(
    s,
    "teacher_issue",
    { testId: s.tests[0].id },
    teacher,
  );
  const p = execute(
    s,
    "start_attempt",
    { token: assignment.token, name: "Тестовый ученик" },
    student,
  );
  return { s, assignment, p };
}
test("student conditions contain no keys or explanations, teacher access rejected", () => {
  const { s, assignment } = setup();
  const data = execute(
    s,
    "get_assignment",
    { token: assignment.token },
    student,
  );
  assert.ok(!JSON.stringify(data).includes("explanation"));
  assert.ok(data.test.exercises.every((e) => !("key" in e)));
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
test("closed assignments prevent starting but allow submitting an existing attempt", () => {
  const { s, p, assignment } = setup();
  execute(s, "teacher_close", { assignmentId: assignment.id }, teacher);
  assert.throws(
    () =>
      execute(
        s,
        "start_attempt",
        { token: assignment.token, name: "Ученик" },
        student,
      ),
    /завершён/,
  );
  assert.equal(
    execute(s, "submit_attempt", { attemptId: p.id, answers: {} }, student)
      .percentage,
    0,
  );
});
test("repeats are separate and matching names do not identify owners", () => {
  const { s, p, assignment } = setup();
  execute(s, "submit_attempt", { attemptId: p.id, answers: {} }, student);
  const p2 = execute(
    s,
    "start_attempt",
    { token: assignment.token, name: "Тестовый ученик" },
    student,
  );
  const p3 = execute(
    s,
    "start_attempt",
    { token: assignment.token, name: "Тестовый ученик" },
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
