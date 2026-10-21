import test from "node:test";
import assert from "node:assert/strict";
import {
  additionalTestTitle,
  groupLibraryTests,
  libraryTitle,
  testTopicTitle,
  testDisplayTitle,
} from "../src/test-library.ts";

const entry = (exam, taskNumber, suffix = "") => ({
  exam,
  taskNumber,
  title: `${exam}. Задание № ${taskNumber}${suffix}`,
});

test("numbered series of different topics never collapse into one group", () => {
  const groups = groupLibraryTests([
    entry("ОГЭ", 5, ". Тире и двоеточие. Тест 2"),
    entry("ОГЭ", 5, ". Запятые и кавычки. Тест 2"),
    entry("ОГЭ", 5, ". Тире и двоеточие. Тест 1"),
    entry("ОГЭ", 5, ". Запятые и кавычки. Тест 1"),
  ]);
  assert.equal(groups.length, 2);
  for (const group of groups) {
    assert.deepEqual(
      group.tests.map((t) => t.title),
      [`${group.title}. Тест 1`, `${group.title}. Тест 2`],
    );
  }
});

test("library shows test 1 first and groups additional tests in numeric order", () => {
  const tests = [10, 3, 1, 2].map((n) => entry("ЕГЭ", 4, `. Тест ${n}`));
  const original = [...tests];
  const [group] = groupLibraryTests(tests);
  assert.deepEqual(group.tests, [tests[2], tests[3], tests[1], tests[0]]);
  assert.equal(libraryTitle(group.tests[0]), "ЕГЭ. Задание № 4");
  assert.deepEqual(group.tests.slice(1).map(additionalTestTitle), [
    "Тест 2",
    "Тест 3",
    "Тест 10",
  ]);
  assert.deepEqual(tests, original);
  assert.equal(group.tests[0], tests[2]);
  assert.equal(groupLibraryTests([...tests].reverse())[0].key, group.key);
});

test("named topics, exams and combined assignments keep separate library cards", () => {
  const tests = [
    entry("ОГЭ", 4, ". Тест 2"),
    entry("ЕГЭ", 4, ". Тест 1"),
    entry("ОГЭ", 6, ". Тест 1"),
    entry("ОГЭ", 4, ". Тест 1"),
    entry("ЕГЭ", 21, ". Запятые"),
    entry("ЕГЭ", 21, ". Тире и двоеточия"),
    { ...entry("ЕГЭ", 9), title: "ЕГЭ. Задания № 9–12" },
    entry("ЕГЭ", 9),
    entry("ОГЭ", 5, ". Запятые и кавычки"),
    entry("ОГЭ", 5, ". Тире и двоеточие"),
  ];
  const groups = groupLibraryTests(tests);
  assert.equal(groups.length, 10);
  assert.deepEqual(
    groups.map((g) => g.tests.length),
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  );
  assert.equal(groups[5].tests[0], tests[3]);
  assert.equal(groups[3].title, "ЕГЭ. Задание № 21. Запятые");
  assert.equal(groups[4].title, "ЕГЭ. Задание № 21. Тире и двоеточия");
  assert.equal(testTopicTitle(groups[4].tests[0]), "Тире и двоеточия");
  assert.equal(testTopicTitle(groups[5].tests[0]), "ДЗ №1");
  assert.deepEqual(groupLibraryTests([...tests].reverse()), groups);
  assert.deepEqual(groupLibraryTests([]), []);
});

for (const taskNumber of [4, 6, 7]) {
  test(`ОГЭ ${taskNumber}: only homework 1 and 2 have separate cards with original actions`, () => {
    const tests = [4, 2, 10, 1, 3].map((n) => ({
      ...entry("ОГЭ", taskNumber, `. Тест ${n}`),
      id: `test-${n}`,
      shareToken: `token-${n}`,
    }));
    const before = structuredClone(tests);
    const groups = groupLibraryTests(tests);
    assert.deepEqual(
      groups.map((g) => g.title),
      [1, 2].map((n) => `ОГЭ. Задание № ${taskNumber}. ДЗ №${n}`),
    );
    assert.deepEqual(
      groups.map((g) => g.tests.length),
      [1, 1],
    );
    assert.equal(groups[0].tests[0], tests[3]);
    assert.equal(groups[1].tests[0], tests[1]);
    assert.deepEqual(tests, before);
    assert.deepEqual(groupLibraryTests([...tests].reverse()), groups);
    for (const t of tests) {
      const expected = t.title.replace(/Тест (\d+)$/u, "ДЗ №$1");
      assert.equal(testDisplayTitle(t), expected);
      assert.equal(
        testDisplayTitle({ ...t, testTitle: t.title, title: undefined }),
        expected,
      );
      assert.equal(testDisplayTitle({ ...t, title: expected }), expected);
    }
  });
}

test("homework aliases preserve named topics, other exams and combined assignments", () => {
  for (const t of [
    entry("ОГЭ", 4, ". Другая тема. Тест 3"),
    entry("ЕГЭ", 4, ". Тест 3"),
    entry("ОГЭ", 8, ". Тест 3"),
    { ...entry("ОГЭ", 4), title: "ОГЭ. Задания № 4–6" },
  ]) {
    assert.equal(testDisplayTitle(t), t.title);
    assert.equal(groupLibraryTests([t]).length, 1);
  }
});
