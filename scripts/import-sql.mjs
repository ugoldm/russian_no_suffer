// Offline content validation and SQL generation. No credentials or network access.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export function testTopic(test) {
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
  const ids = new Set();
  for (const e of t.exercises) {
    if (typeof e.id !== "string" || !e.id || ids.has(e.id))
      fail("Неправильный или повторяющийся ID упражнения");
    ids.add(e.id);
    if (
      !["single", "multiple", "text"].includes(e.type) ||
      typeof e.prompt !== "string" ||
      !e.prompt.trim()
    )
      fail(`Неверный формат ${e.id}`);
    if (
      t.status === "published" &&
      (!Array.isArray(e.key) ||
        !e.key.length ||
        e.key.some((k) => typeof k !== "string" || !k) ||
        new Set(e.key).size !== e.key.length)
    )
      fail(`Нет достоверного ключа ${e.id}`);
    if (e.type !== "text") {
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
      if (e.key?.some((k) => !e.options.some((o) => o.id === k)))
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
  }
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
    const topicSql = `case when position((${prefixSql}) in (data->>'title'))=1 then btrim(substr(data->>'title',length(${prefixSql})+1)) else '' end`;
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
