import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../server/index.mjs";
import { demoTest } from "../server/demo-content.mjs";
import { execute } from "../server/engine.mjs";
import { importLocal } from "../scripts/import-local.mjs";

const fixture = (id, topic) => ({
  ...structuredClone(demoTest),
  id,
  versionId: id + "-v1",
  taskNumber: 21,
  title: "ЕГЭ. Задание № 21. " + topic,
});
const commas = fixture("synthetic-commas", "Запятые");
const dashColon = fixture("synthetic-dash-colon", "Тире и двоеточие");
const duplicate = fixture("synthetic-duplicate", "Запятые");

test("local thematic tests coexist and keep independent links, work and version histories", () => {
  const dir = mkdtempSync(tmpdir() + "/rns-topic-");
  const path = dir + "/qa.sqlite";
  const app = createApp({ databasePath: path });
  const db = new DatabaseSync(path);
  const read = () =>
    JSON.parse(
      db.prepare("select payload from app_state where id=1").get().payload,
    );
  try {
    importLocal(commas, path);
    const before = read();
    const source = before.tests.find((t) => t.id === commas.id);
    const work = execute(
      before,
      "start_attempt",
      {
        token: source.shareToken,
        name: "Synthetic",
        groupDay: "monday",
        groupTime: "17:30",
      },
      { id: "synthetic-student" },
    );
    db.prepare("update app_state set payload=? where id=1").run(
      JSON.stringify(before),
    );
    importLocal(dashColon, path);
    importLocal(dashColon, path);
    const after = read();
    assert.deepEqual(
      after.tests.filter((t) => t.id !== dashColon.id),
      before.tests,
    );
    assert.deepEqual(after.attempts, before.attempts);
    assert.notEqual(
      after.tests.find((t) => t.id === dashColon.id).shareToken,
      source.shareToken,
    );
    assert.throws(() => importLocal(duplicate, path), /принадлежит/);
    assert.deepEqual(read(), after);
    const next = { ...dashColon, versionId: dashColon.id + "-v2", version: 2 };
    importLocal(next, path);
    const final = read();
    const visible = execute(
      final,
      "teacher_overview",
      {},
      { teacher: 1 },
    ).tests;
    assert.ok(visible.some((t) => t.id === commas.id && t.version === 1));
    assert.ok(visible.some((t) => t.id === dashColon.id && t.version === 2));
    assert.equal(visible.filter((t) => t.id === dashColon.id).length, 1);
    assert.equal(
      execute(
        final,
        "get_test",
        { token: source.shareToken },
        { id: "synthetic-student" },
      ).versionId,
      commas.versionId,
    );
    assert.equal(
      execute(
        final,
        "get_attempt",
        { attemptId: work.id },
        { id: "synthetic-student" },
      ).versionId,
      commas.versionId,
    );
  } finally {
    db.close();
    app.emit("close");
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generated SQL imports distinguish topics, reject duplicates and preserve immutable content", async () => {
  mkdirSync("imports", { recursive: true });
  const dir = mkdtempSync(resolve("imports") + "/topic-qa-");
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const generate = (data) => {
    writeFileSync(dir + "/input.json", JSON.stringify(data));
    execFileSync(process.execPath, [
      "scripts/import-sql.mjs",
      dir + "/input.json",
      owner,
      dir + "/test.sql",
    ]);
    return readFileSync(dir + "/test.sql", "utf8");
  };
  try {
    await db.exec(
      `create schema private;create table private.teachers(user_id uuid primary key);create table private.tests(version_id text primary key,owner_id uuid,data jsonb);insert into private.teachers values('${owner}')`,
    );
    const first = generate(commas);
    await db.exec(first);
    await db.exec(first);
    await db.exec(generate(dashColon));
    assert.equal(
      (await db.query("select count(*)::int n from private.tests")).rows[0].n,
      2,
    );
    await assert.rejects(() => db.exec(generate(duplicate)), /another test ID/);
    const changed = structuredClone(commas);
    changed.exercises[0].prompt = "Changed synthetic text";
    await assert.rejects(() => db.exec(generate(changed)), /different content/);
    assert.deepEqual(
      (
        await db.query("select data from private.tests where version_id=$1", [
          commas.versionId,
        ])
      ).rows[0].data.exercises,
      commas.exercises,
    );
    const next = { ...dashColon, version: 2, versionId: dashColon.id + "-v2" };
    await db.exec(generate(next));
    assert.equal(
      (await db.query("select count(*)::int n from private.tests")).rows[0].n,
      3,
    );
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
