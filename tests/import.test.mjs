import test from "node:test";
import assert from "node:assert/strict";
import { validateTest } from "../scripts/import-sql.mjs";
import { demoTest } from "../server/demo-content.mjs";
test("import validates keys, question IDs and normalization", () => {
  assert.equal(validateTest(demoTest).exerciseCount, 6);
  const t = structuredClone(demoTest);
  t.exercises.push(t.exercises[0]);
  assert.throws(() => validateTest(t), /повторяющийся/);
  const missing = structuredClone(demoTest);
  delete missing.exercises[0].key;
  assert.throws(() => validateTest(missing), /ключа/);
  const invalid = structuredClone(demoTest);
  invalid.exercises[0].key = ["99"];
  assert.throws(() => validateTest(invalid), /Ключ/);
});

test("passage highlights preserve source emphasis and reject invalid ranges", () => {
  const t = structuredClone(demoTest);
  t.exercises = [
    {
      id: "reading",
      type: "group",
      prompt: "Прочитайте текст.",
      passage: "Первое слово. Второе слово.",
      passageHighlights: [
        { start: 0, end: 6 },
        { start: 14, end: 20 },
      ],
      items: [structuredClone(demoTest.exercises[0])],
    },
  ];
  assert.equal(validateTest(t).exercises[0].passage, t.exercises[0].passage);
  for (const ranges of [
    null,
    [{ start: -1, end: 2 }],
    [{ start: 2, end: 2 }],
    [{ start: 0.5, end: 3 }],
    [{ start: 0, end: 200 }],
    [
      { start: 2, end: 5 },
      { start: 4, end: 7 },
    ],
    [null],
  ]) {
    const invalid = structuredClone(t);
    invalid.exercises[0].passageHighlights = ranges;
    assert.throws(() => validateTest(invalid), /выделения/);
  }
});
