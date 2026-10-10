// Private content stays in SQLite; never import these files into the frontend.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { validateTest } from "./import-sql.mjs";

function content(test) {
  const { shareToken, legacyTokens, status, ...data } = test;
  return data;
}

export function importLocal(input, databasePath = ".local/demo.sqlite") {
  const incoming = validateTest(input);
  if (!existsSync(databasePath))
    throw new Error(
      "Локальная база отсутствует. Сначала запустите npm run dev.",
    );
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("BEGIN IMMEDIATE");
    const row = db.prepare("SELECT payload FROM app_state WHERE id=1").get();
    if (!row) throw new Error("База приложения не инициализирована.");
    const state = JSON.parse(row.payload);
    const existing = state.tests.find(
      (t) => t.versionId === incoming.versionId,
    );
    if (existing) {
      // Only identical reimports or explicit publication of an identical draft.
      if (!isDeepStrictEqual(content(existing), content(incoming)))
        throw new Error(
          "Версия уже существует с другим содержанием. Создайте новую версию.",
        );
      if (existing.status !== incoming.status) {
        if (existing.status !== "draft" || incoming.status !== "published")
          throw new Error("Нельзя изменить статус этой версии через импорт.");
        existing.status = "published";
      }
    } else {
      if (
        state.tests.some(
          (t) =>
            (t.id === incoming.id && t.version === incoming.version) ||
            (t.exam === incoming.exam &&
              t.year === incoming.year &&
              t.taskNumber === incoming.taskNumber &&
              t.id !== incoming.id),
        )
      )
        throw new Error(
          "Этот номер или номер версии уже принадлежит другому тесту.",
        );
      state.tests.push({
        ...incoming,
        shareToken: randomBytes(24).toString("hex"),
      });
    }
    db.prepare("UPDATE app_state SET payload=? WHERE id=1").run(
      JSON.stringify(state),
    );
    db.exec("COMMIT");
    return {
      versionId: incoming.versionId,
      status: incoming.status,
      exerciseCount: incoming.exerciseCount,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [input, databasePath = ".local/demo.sqlite"] = process.argv.slice(2);
    if (!input)
      throw new Error(
        "Использование: npm run import:local -- imports/test.json [.local/demo.sqlite]",
      );
    const path = resolve(input);
    if (
      !["materials", "imports"].some((dir) =>
        path.startsWith(resolve(dir) + "/"),
      )
    )
      throw new Error(
        "Данные теста должны находиться в исключённых из Git materials/ или imports/.",
      );
    const result = importLocal(
      JSON.parse(readFileSync(path, "utf8")),
      databasePath,
    );
    console.log(
      `Импортировано ${result.exerciseCount} упражнений; статус ${result.status}. Обновите страницу кабинета.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
