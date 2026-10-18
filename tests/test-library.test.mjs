import test from "node:test";
import assert from "node:assert/strict";
import {
  additionalTestTitle,
  groupLibraryTests,
  libraryTitle,
  testTopicTitle,
} from "../src/test-library.ts";

const entry = (exam, taskNumber, suffix = "") => ({
  exam,
  taskNumber,
  title: `${exam}. Задание № ${taskNumber}${suffix}`,
});

test("library shows test 1 first and groups additional tests in numeric order", () => {
  const tests = [10, 3, 1, 2].map((n) => entry("ОГЭ", 4, `. Тест ${n}`));
  const original = [...tests];
  const [group] = groupLibraryTests(tests);
  assert.deepEqual(group.tests, [tests[2], tests[3], tests[1], tests[0]]);
  assert.equal(libraryTitle(group.tests[0]), "ОГЭ. Задание № 4");
  assert.deepEqual(group.tests.slice(1).map(additionalTestTitle), [
    "Тест 2",
    "Тест 3",
    "Тест 10",
  ]);
  assert.deepEqual(tests, original);
  assert.equal(group.tests[0], tests[2]);
  assert.equal(groupLibraryTests([...tests].reverse())[0].key, group.key);
});

test("topics share an assignment card while exams and combined assignments stay separate", () => {
  const tests = [
    entry("ОГЭ", 4, ". Тест 2"),
    entry("ЕГЭ", 4, ". Тест 1"),
    entry("ОГЭ", 6, ". Тест 1"),
    entry("ОГЭ", 4, ". Тест 1"),
    entry("ЕГЭ", 21, ". Запятые"),
    entry("ЕГЭ", 21, ". Тире и двоеточия"),
    { ...entry("ЕГЭ", 9), title: "ЕГЭ. Задания № 9–12" },
    entry("ЕГЭ", 9),
  ];
  const groups = groupLibraryTests(tests);
  assert.equal(groups.length, 6);
  assert.deepEqual(
    groups.map((g) => g.tests.length),
    [1, 1, 1, 2, 2, 1],
  );
  assert.equal(groups[4].tests[0], tests[3]);
  assert.equal(groups[3].title, "ЕГЭ. Задание № 21");
  assert.equal(additionalTestTitle(groups[3].tests[1], 2), "Тест 2");
  assert.equal(testTopicTitle(groups[3].tests[1]), "Тире и двоеточия");
  assert.equal(testTopicTitle(groups[4].tests[1]), undefined);
  assert.deepEqual(
    groupLibraryTests([...tests].reverse()).find(
      (g) => g.title === "ЕГЭ. Задание № 21",
    )?.tests,
    groups[3].tests,
  );
  assert.deepEqual(groupLibraryTests([]), []);
});
