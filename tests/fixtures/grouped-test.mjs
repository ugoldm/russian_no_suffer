import { validateTest } from "../../scripts/import-sql.mjs";
export function groupedFixture() {
  return validateTest({
    id: "oge-group-synthetic",
    versionId: "oge-group-synthetic-v1",
    exam: "ОГЭ",
    year: "synthetic",
    taskNumber: 10,
    title: "ОГЭ. Задания № 10–12",
    subtitle: "Synthetic",
    description: "Synthetic tasks",
    source: "Synthetic fixture",
    version: 1,
    status: "published",
    demo: true,
    shareToken: "synthetic-group-token",
    maximumScore: 15,
    exercises: Array.from({ length: 5 }, (_, i) => ({
      id: `text-${i}`,
      type: "group",
      prompt: "Прочитайте текст.",
      passage: "(1)Синтетический текст для проверки.",
      items: [
        {
          id: "10",
          taskNumber: 10,
          type: "text",
          prompt: "Номера",
          key: ["123"],
          normalization: { trim: true, digitSet: true },
        },
        {
          id: "11",
          taskNumber: 11,
          type: "multiple",
          prompt: "Выбор",
          options: [
            { id: "a", text: "Первый" },
            { id: "b", text: "Второй" },
          ],
          key: ["b"],
        },
        {
          id: "12",
          taskNumber: 12,
          type: "text",
          prompt: "Слово",
          key: ["ёлка", "ели"],
          normalization: { trim: true, ignoreCase: true },
        },
      ],
    })),
  });
}
