import test from "node:test";
import assert from "node:assert/strict";
import { exerciseSections } from "../src/exercise-sections.ts";

test("explicit mixed task numbers keep consecutive blocks and global positions", () => {
  const exercises = [16, 16, 17, 17, 18, 19, 20, 21, 21].map(
    (taskNumber, i) => ({
      id: String(i),
      taskNumber,
      type: "text",
      prompt: "Test",
    }),
  );
  const sections = exerciseSections(exercises);
  assert.deepEqual(
    sections.map((s) => [s.taskNumber, s.start, s.exercises.length]),
    [
      [16, 0, 2],
      [17, 2, 2],
      [18, 4, 1],
      [19, 5, 1],
      [20, 6, 1],
      [21, 7, 2],
    ],
  );
  assert.deepEqual(
    sections.flatMap((s) => s.exercises),
    exercises,
  );
  assert.equal(sections[1].exercises[0], exercises[2]);
});

test("single-number tests and passage groups keep one navigation without block headings", () => {
  for (const exercises of [
    [],
    [
      { id: "a", taskNumber: 16 },
      { id: "b", taskNumber: 16 },
    ],
    [
      { id: "a", items: [{ taskNumber: 1 }, { taskNumber: 2 }] },
      { id: "b", items: [{ taskNumber: 1 }, { taskNumber: 2 }] },
    ],
    [{ id: "a", taskNumber: 16 }, { id: "b" }],
  ]) {
    const sections = exerciseSections(exercises);
    assert.equal(sections.length, exercises.length ? 1 : 0);
    assert.ok(sections.every((s) => s.taskNumber === undefined));
    assert.deepEqual(
      sections.flatMap((s) => s.exercises),
      exercises,
    );
  }
});
