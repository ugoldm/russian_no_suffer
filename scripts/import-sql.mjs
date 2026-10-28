// Offline content validation and SQL generation. No credentials or network access.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export function testTopic(test) {
  if (
    test.title?.startsWith(`${test.exam}. Задания № `) ||
    test.title?.startsWith(`${test.exam}. Пробник`)
  )
    return test.title.slice(test.exam.length + 2);
  const prefix = `${test.exam}. Задание № ${test.taskNumber}. `;
  return test.title?.startsWith(prefix)
    ? test.title.slice(prefix.length).trim()
    : "";
}

export function validateTest(t) {
  const fail = (msg) => {
    throw new Error(msg);
  };
  for (const field of [
    "id",
    "versionId",
    "year",
    "title",
    "subtitle",
    "description",
    "source",
  ])
    if (typeof t[field] !== "string" || !t[field].trim())
      fail(`Отсутствует строковое поле ${field}`);
  if (
    !["ЕГЭ", "ОГЭ"].includes(t.exam) ||
    !Number.isInteger(t.taskNumber) ||
    t.taskNumber < 1 ||
    !Number.isInteger(t.version) ||
    t.version < 1
  )
    fail("Неверный экзамен, номер или версия");
  if (!["draft", "published", "archived"].includes(t.status))
    fail("Неверный статус");
  if (
    !Array.isArray(t.exercises) ||
    t.exercises.length < 1 ||
    t.exercises.length > 100
  )
    fail("Нужно от 1 до 100 упражнений");
  const validateExercises = (exercises, nested = false) => {
    const ids = new Set();
    for (const e of exercises) {
      if (typeof e.id !== "string" || !e.id || ids.has(e.id))
        fail("Неправильный или повторяющийся ID упражнения");
      ids.add(e.id);
      if (
        e.navigationLabel !== undefined &&
        (nested ||
          typeof e.navigationLabel !== "string" ||
          !/^\d{1,2}(?:–\d{1,2})?$/.test(e.navigationLabel))
      )
        fail(`Неверная подпись навигации ${e.id}`);
      if (
        !["single", "multiple", "text", "group"].includes(e.type) ||
        typeof e.prompt !== "string" ||
        !e.prompt.trim()
      )
        fail(`Неверный формат ${e.id}`);
      if (e.type === "group") {
        if (
          nested ||
          typeof e.passage !== "string" ||
          !e.passage.trim() ||
          !Array.isArray(e.items) ||
          e.items.length < 1 ||
          e.items.length > 20
        )
          fail(`Неверная группа заданий ${e.id}`);
        if (e.passageHighlights !== undefined) {
          let end = 0;
          if (!Array.isArray(e.passageHighlights))
            fail(`Неверные выделения текста ${e.id}`);
          for (const range of e.passageHighlights) {
            if (
              !range ||
              !Number.isInteger(range.start) ||
              !Number.isInteger(range.end) ||
              range.start < end ||
              range.end <= range.start ||
              range.end > e.passage.length
            )
              fail(`Неверные выделения текста ${e.id}`);
            end = range.end;
          }
        }
        const childIds = new Set(e.items.map((item) => item.id));
        if (childIds.size !== e.items.length)
          fail("Повторяющиеся ID заданий текста");
        // Child IDs are scoped to their passage.
        validateExercises(e.items, true);
        continue;
      }
      if (
        t.status === "published" &&
        (!Array.isArray(e.key) ||
          !e.key.length ||
          e.key.some((k) => typeof k !== "string" || !k) ||
          new Set(e.key).size !== e.key.length)
      )
        fail(`Нет достоверного ключа ${e.id}`);
      if (e.type !== "text" || e.options !== undefined) {
        if (
          !Array.isArray(e.options) ||
          e.options.length < 2 ||
          e.options.length > 30 ||
          e.options.some(
            (o) =>
              typeof o.id !== "string" ||
              !o.id ||
              typeof o.text !== "string" ||
              !o.text.trim(),
          ) ||
          new Set(e.options.map((o) => o.id)).size !== e.options.length
        )
          fail(`Неверные варианты ${e.id}`);
        if (
          e.type !== "text" &&
          e.key?.some((k) => !e.options.some((o) => o.id === k))
        )
          fail(`Ключ отсутствует в вариантах ${e.id}`);
        if (
          e.type === "single" &&
          e.key?.length !== 1 &&
          t.status === "published"
        )
          fail("У single должен быть один ответ");
      }
      if (
        e.normalization &&
        Object.keys(e.normalization).some(
          (k) =>
            !["trim", "ignoreCase", "digitSet"].includes(k) ||
            typeof e.normalization[k] !== "boolean",
        )
      )
        fail("Неизвестное правило нормализации");
      if (e.normalization?.digitSet) {
        if (e.type !== "text")
          fail("digitSet допустим только для текстового ответа");
        if (
          e.key?.some((key) => {
            const value = e.normalization.trim ? key.trim() : key;
            return (
              !/^[0-9]+$/.test(value) || new Set(value).size !== value.length
            );
          })
        )
          fail(`Ключ digitSet должен содержать цифры без повторов: ${e.id}`);
      }
      if (
        e.scoring !== undefined &&
        (!e.scoring ||
          e.scoring.type !== "positional" ||
          Object.keys(e.scoring).length !== 1 ||
          e.type !== "text" ||
          e.matchingTable?.left?.length !== 5 ||
          e.normalization?.digitSet ||
          e.normalization?.ignoreCase ||
          !e.key?.length ||
          e.key.some((key) => !/^[1-9]{5}$/.test(key)))
      )
        fail(`Неверное позиционное оценивание ${e.id}`);
      if (e.matchingTable !== undefined) {
        const table = e.matchingTable;
        if (
          e.type !== "text" ||
          e.normalization?.digitSet ||
          e.options !== undefined ||
          !table ||
          typeof table.leftTitle !== "string" ||
          !table.leftTitle.trim() ||
          typeof table.rightTitle !== "string" ||
          !table.rightTitle.trim() ||
          [table.left, table.right].some(
            (column) =>
              !Array.isArray(column) ||
              column.length < 2 ||
              column.length > 9 ||
              column.some(
                (item) =>
                  !item ||
                  typeof item.id !== "string" ||
                  !item.id.trim() ||
                  typeof item.text !== "string" ||
                  !item.text.trim(),
              ) ||
              new Set(column.map((item) => item.id)).size !== column.length,
          )
        )
          fail(`Неверная таблица соответствий ${e.id}`);
        if (
          table.right.some((item) => !/^[1-9]$/.test(item.id)) ||
          e.key?.some(
            (key) =>
              key.length !== table.left.length ||
              [...key].some(
                (digit) => !table.right.some((item) => item.id === digit),
              ),
          )
        )
          fail(`Неверный ключ таблицы соответствий ${e.id}`);
      }
    }
  };
  validateExercises(t.exercises);
  const taskCount = t.exercises.reduce(
    (sum, e) => sum + (e.type === "group" ? e.items.length : 1),
    0,
  );
  if (t.taskCount !== undefined && t.taskCount !== taskCount)
    fail("Количество заданий не совпадает с составом теста");
  const maximumScore = t.exercises.reduce(
    (sum, e) =>
      sum +
      (e.type === "group"
        ? e.items.reduce((n, item) => n + (item.scoring ? 2 : 1), 0)
        : e.scoring
          ? 2
          : 1),
    0,
  );
  if (t.maximumScore !== undefined && t.maximumScore !== maximumScore)
    fail("Максимальный балл не совпадает с правилами оценивания заданий");
  return { ...t, demo: !!t.demo, exerciseCount: t.exercises.length };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [input, owner, out = "imports/prepared-test.sql"] =
      process.argv.slice(2);
    if (
      !input ||
      !owner ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(owner)
    )
      throw new Error(
        "Использование: npm run import:sql -- materials/test.json UUID_ПРЕПОДАВАТЕЛЯ imports/test.sql",
      );
    const dest = resolve(out);
    if (!dest.startsWith(resolve("imports") + "/"))
      throw new Error(
        "SQL с ключами можно сохранять только в исключённый из Git каталог imports/",
      );
    const raw = readFileSync(input, "utf8");
    const t = validateTest(JSON.parse(raw));
    const quote = (v) => "'" + v.replaceAll("'", "''") + "'";
    const delimiter = "$content_" + randomUUID().replaceAll("-", "") + "$";
    const literal = delimiter + JSON.stringify(t) + delimiter;
    const prefixSql =
      "(data->>'exam')||'. Задание № '||(data->>'taskNumber')||'. '";
    const topicSql = `case when position((${prefixSql}) in (data->>'title'))=1 then btrim(substr(data->>'title',length(${prefixSql})+1)) when position((data->>'exam')||'. Задания № ' in (data->>'title'))=1 or position((data->>'exam')||'. Пробник' in (data->>'title'))=1 then substr(data->>'title',length(data->>'exam')+3) else '' end`;
    const sql = `-- Import SHA256: ${createHash("sha256").update(raw).digest("hex")}\n-- Generated content. Review as teacher before publishing.\ndo $import$\ndeclare new_data jsonb := ${literal}::jsonb; existing jsonb;\nbegin\n  if not exists(select 1 from private.teachers where user_id=${quote(owner)}::uuid) then raise exception 'Teacher is not allowlisted'; end if;\n  select data into existing from private.tests where version_id=${quote(t.versionId)};\n  if existing is not null then\n    if existing is distinct from new_data or not exists(select 1 from private.tests where version_id=${quote(t.versionId)} and owner_id=${quote(owner)}::uuid) then raise exception 'Version already exists with different content or owner'; end if;\n  else\n    if exists(select 1 from private.tests where owner_id=${quote(owner)}::uuid and data->>'exam'=new_data->>'exam' and data->>'year'=new_data->>'year' and data->'taskNumber'=new_data->'taskNumber' and (${topicSql})=${quote(testTopic(t))} and data->>'id'<>new_data->>'id') then raise exception 'This exam number already has another test ID'; end if;\n    insert into private.tests(version_id,owner_id,data) values(${quote(t.versionId)},${quote(owner)}::uuid,new_data);\n  end if;\nend $import$;\n`;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, sql);
    console.log(
      `Подготовлен ${out}: ${t.exerciseCount} упражнений, ${t.exam} № ${t.taskNumber}, статус ${t.status}. Ключи не выведены в консоль.`,
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
