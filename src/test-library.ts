import { compareTests } from "./test-order.ts";

type LibraryTest = {
  exam: string;
  taskNumber: number;
  title: string;
  id?: string;
  testId?: string;
};

const seriesSuffix = /\. Тест (\d+)$/u;

// Rename these two published mocks without changing their links or saved work.
function renamedMockTitle(test: Omit<LibraryTest, "title"> & { title?: string }) {
  const grade = {
    "ege-probnik-1-grade-10": 10,
    "ege-probnik-1-grade-11": 11,
  }[test.testId ?? test.id ?? ""];
  if (
    grade &&
    test.exam === "ЕГЭ" &&
    test.title === `ЕГЭ. Пробник № 1. ${grade} класс`
  )
    return `ЕГЭ. Пробник № 2. ${grade} класс`;
}

// These three existing series are now two separate homework cards.
// Apply aliases in the UI so published versions and saved attempts stay intact.
function homeworkNumber(test: Omit<LibraryTest, "title"> & { title?: string }) {
  if (test.exam !== "ОГЭ" || ![4, 6, 7].includes(test.taskNumber))
    return undefined;
  return test.title?.match(
    new RegExp(
      `^ОГЭ\\. Задание № ${test.taskNumber}\\. (?:Тест |ДЗ №)([1-9]\\d*)$`,
      "u",
    ),
  )?.[1];
}

export function testDisplayTitle(
  test: Omit<LibraryTest, "title"> & { title?: string; testTitle?: string },
) {
  const base = `${test.exam}. Задание № ${test.taskNumber}`;
  const savedTitle = test.title ?? test.testTitle;
  const number = homeworkNumber({ ...test, title: savedTitle });
  if (number) return `${base}. ДЗ №${number}`;
  const renamed = renamedMockTitle({ ...test, title: savedTitle });
  if (renamed) return renamed;
  return savedTitle?.startsWith(`${base}. `) ||
    savedTitle?.startsWith(`${test.exam}. Задания № `) ||
    savedTitle?.startsWith(`${test.exam}. Пробник`)
    ? savedTitle
    : base;
}

export function libraryTitle(test: LibraryTest) {
  if (homeworkNumber(test)) return testDisplayTitle(test);
  return (renamedMockTitle(test) ?? test.title).replace(seriesSuffix, "");
}

function assignmentTitle(test: LibraryTest) {
  const range = test.title.match(/\. Задания № (\d+(?:\s*[–—-]\s*\d+)?)/u)?.[1];
  return range
    ? `${test.exam}. Задания № ${range}`
    : `${test.exam}. Задание № ${test.taskNumber}`;
}

export function testTopicTitle(test: LibraryTest) {
  const prefix = `${assignmentTitle(test)}. `;
  const title = libraryTitle(test);
  return title.startsWith(prefix) ? title.slice(prefix.length) : undefined;
}

export function additionalTestTitle(test: LibraryTest, fallbackNumber: number) {
  const number = test.title.match(seriesSuffix)?.[1];
  return `Тест ${number || fallbackNumber}`;
}

// Only numbered variants of the same title share a card. Named topics and
// combined assignments keep separate cards even at the same task number.
// Keep the original tests intact so every action uses its own IDs and link.
export function groupLibraryTests<T extends LibraryTest>(tests: T[]) {
  const groups = new Map<string, { key: string; title: string; tests: T[] }>();
  for (const test of [...tests].sort(
    (a, b) => compareTests(a, b) || a.title.localeCompare(b.title, "ru"),
  )) {
    const homework = homeworkNumber(test);
    if (homework && Number(homework) > 2) continue;
    const title = libraryTitle(test);
    const key = JSON.stringify([test.exam, test.taskNumber, title]);
    const group = groups.get(key);
    if (group) group.tests.push(test);
    else groups.set(key, { key, title, tests: [test] });
  }
  return [...groups.values()];
}
