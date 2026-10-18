import { compareTests } from "./test-order.ts";

type LibraryTest = {
  exam: string;
  taskNumber: number;
  title: string;
};

const seriesSuffix = /\. Тест (\d+)$/u;

export function libraryTitle(test: LibraryTest) {
  return test.title.replace(seriesSuffix, "");
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
    const title = libraryTitle(test);
    const key = JSON.stringify([test.exam, test.taskNumber, title]);
    const group = groups.get(key);
    if (group) group.tests.push(test);
    else groups.set(key, { key, title, tests: [test] });
  }
  return [...groups.values()];
}
