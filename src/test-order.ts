type OrderedTest = {
  exam: string;
  taskNumber: number;
  title?: string;
};

const seriesNumber = (test: OrderedTest) =>
  Number(test.title?.match(/\. Тест (\d+)$/u)?.[1] || 0);

export function compareTests(a: OrderedTest, b: OrderedTest) {
  const examOrder = (exam: string) => (exam === "ЕГЭ" ? 0 : 1);
  return (
    examOrder(a.exam) - examOrder(b.exam) ||
    a.taskNumber - b.taskNumber ||
    seriesNumber(a) - seriesNumber(b)
  );
}
