import test from "node:test";
import assert from "node:assert/strict";
import { compareTests } from "../src/test-order.ts";

test("future ЕГЭ series use the same numeric order", () => {
  const series = [10, 4, 1, 9, 2, 3].map((number) => ({
    exam: "ЕГЭ",
    taskNumber: 9,
    title: `ЕГЭ. Задание № 9. Тест ${number}`,
  }));
  assert.deepEqual(
    series.sort(compareTests).map((t) => t.title),
    [1, 2, 3, 4, 9, 10].map((number) => `ЕГЭ. Задание № 9. Тест ${number}`),
  );
});

for (const taskNumber of [4, 6]) {
  test(`ОГЭ ${taskNumber}: numbered test series follow numeric order regardless of import order`, () => {
    const series = [4, 2, 10, 3, 1].map((number) => ({
      exam: "ОГЭ",
      taskNumber,
      title: `ОГЭ. Задание № ${taskNumber}. Тест ${number}`,
    }));
    const earlier = { exam: "ОГЭ", taskNumber: 4, title: "ОГЭ. Задание № 4" };
    const later = { exam: "ОГЭ", taskNumber: 8, title: "ОГЭ. Задание № 8" };
    const ege = { exam: "ЕГЭ", taskNumber: 21, title: "ЕГЭ. Задание № 21" };
    assert.deepEqual([later, ...series, earlier, ege].sort(compareTests), [
      ege,
      earlier,
      series[4],
      series[1],
      series[3],
      series[0],
      series[2],
      later,
    ]);
  });
}
