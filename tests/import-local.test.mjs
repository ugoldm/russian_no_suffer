import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/index.mjs";
import { demoTest } from "../server/demo-content.mjs";
import { execute } from "../server/engine.mjs";
import { importLocal } from "../scripts/import-local.mjs";

test("local import is atomic, repeatable and preserves attempts and version links", () => {
  const dir = mkdtempSync(tmpdir() + "/rns-import-");
  const path = dir + "/demo.sqlite";
  const app = createApp({ databasePath: path });
  const db = new DatabaseSync(path);
  const read = () =>
    JSON.parse(
      db.prepare("SELECT payload FROM app_state WHERE id=1").get().payload,
    );
  try {
    const before = read();
    const student = { id: "test-student" };
    execute(
      before,
      "start_attempt",
      { token: before.tests[0].shareToken, name: "Тест" },
      student,
    );
    db.prepare("UPDATE app_state SET payload=? WHERE id=1").run(
      JSON.stringify(before),
    );
    const incoming = {
      ...structuredClone(demoTest),
      id: "synthetic-import",
      versionId: "synthetic-import-v1",
      taskNumber: 9,
      status: "draft",
    };
    importLocal(incoming, path);
    importLocal(incoming, path);
    const draft = read();
    assert.equal(draft.tests.length, 2);
    assert.deepEqual(draft.tests[0], before.tests[0]);
    assert.deepEqual(draft.attempts, before.attempts);
    assert.throws(
      () =>
        execute(
          draft,
          "get_test",
          { token: draft.tests[1].shareToken },
          student,
        ),
      /не найден/,
    );
    assert.equal(
      execute(draft, "teacher_overview", {}, { teacher: 1 }).tests.length,
      1,
    );
    incoming.status = "published";
    importLocal(incoming, path);
    importLocal(incoming, path);
    const published = read();
    assert.equal(published.tests.length, 2);
    assert.equal(published.tests[1].shareToken, draft.tests[1].shareToken);
    assert.deepEqual(published.attempts, before.attempts);
    const publicData = execute(
      published,
      "get_test",
      { token: published.tests[1].shareToken },
      student,
    );
    assert.ok(publicData.exercises.every((e) => !e.key && !e.explanation));
    const changed = structuredClone(incoming);
    changed.exercises[0].prompt = "Changed";
    assert.throws(() => importLocal(changed, path), /другим содержанием/);
    assert.deepEqual(read(), published);
    const collision = { ...incoming, id: "other", versionId: "other-v1" };
    assert.throws(() => importLocal(collision, path), /принадлежит/);
    assert.deepEqual(read(), published);
    const v2 = { ...changed, version: 2, versionId: "synthetic-import-v2" };
    importLocal(v2, path);
    assert.deepEqual(read().tests[1], published.tests[1]);
    assert.deepEqual(read().attempts, before.attempts);
  } finally {
    db.close();
    app.emit("close");
    rmSync(dir, { recursive: true, force: true });
  }
});
