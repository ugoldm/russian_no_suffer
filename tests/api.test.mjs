import { filledAnswers } from "./fixtures/filled-answers.mjs";
import { demoTest } from "../server/demo-content.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";
test("HTTP API persists records across restart and isolates student sessions", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = mkdtempSync(tmpdir() + "/rns-test-") + "/demo.sqlite";
  let server = createApp({ databasePath: path });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let url = `http://127.0.0.1:${server.address().port}/api/rpc`;
  const cookies = {};
  async function call(who, action, args = {}) {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies[who] || "",
      },
      body: JSON.stringify({ action, args }),
    });
    const c = r.headers.get("set-cookie");
    if (c) cookies[who] = c.split(";")[0];
    return { status: r.status, ...(await r.json()) };
  }
  try {
    assert.equal((await call("intruder", "teacher_overview")).status, 403);
    await call("teacher", "demo_login");
    const overview = (await call("teacher", "teacher_overview")).data;
    const a = overview.tests[0];
    const p = (
      await call("student", "start_attempt", {
        groupDay: "monday",
        groupTime: "17:30",
        token: a.shareToken,
        name: "API Ученик",
      })
    ).data;
    assert.equal(
      (await call("other", "get_attempt", { attemptId: p.id })).status,
      404,
    );
    const rejected = await call("student", "submit_attempt", {
      attemptId: p.id,
      answers: {},
    });
    assert.equal(rejected.status, 400);
    assert.match(rejected.error, /Нельзя сдать работу.*Упражнение 1/);
    assert.equal(
      (await call("student", "get_attempt", { attemptId: p.id })).data.status,
      "started",
    );
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results.length,
      0,
    );
    const result = (
      await call("student", "submit_attempt", {
        attemptId: p.id,
        answers: filledAnswers(demoTest),
        durationSeconds: 999,
      })
    ).data;
    assert.equal(result.percentage, 0);
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results[0].teacherUnread,
      true,
    );
    assert.equal(
      (
        await call("intruder", "teacher_mark_results_seen", {
          attemptIds: [p.id],
        })
      ).status,
      403,
    );
    assert.equal(
      result.durationSeconds,
      Math.floor(
        (Date.parse(result.submittedAt) - Date.parse(result.startedAt)) / 1000,
      ),
    );
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results.length,
      1,
    );
    assert.equal(
      (await call("teacher", "teacher_result", { attemptId: p.id })).data
        .durationSeconds,
      result.durationSeconds,
    );
    assert.deepEqual(
      (
        await call("student", "submit_attempt", {
          attemptId: p.id,
          answers: {},
        })
      ).data,
      result,
    );
    assert.equal(
      (
        await call("intruder", "teacher_set_result_hidden", {
          attemptId: p.id,
          hidden: true,
        })
      ).status,
      403,
    );
    assert.deepEqual(
      (
        await call("teacher", "teacher_set_result_hidden", {
          attemptId: p.id,
          hidden: true,
        })
      ).data,
      { id: p.id, teacherHidden: true },
    );
    await new Promise((r) => server.close(r));
    server = createApp({ databasePath: path });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${server.address().port}/api/rpc`;
    assert.deepEqual(
      (await call("student", "get_attempt", { attemptId: p.id })).data,
      result,
    );
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results.length,
      1,
    );
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results[0].teacherHidden,
      true,
    );
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results[0].teacherUnread,
      true,
    );
    assert.deepEqual(
      (
        await call("teacher", "teacher_mark_results_seen", {
          attemptIds: [p.id],
        })
      ).data,
      { seenIds: [p.id] },
    );
    assert.deepEqual(
      (
        await call("teacher", "teacher_set_result_hidden", {
          attemptId: p.id,
          hidden: false,
        })
      ).data,
      { id: p.id, teacherHidden: false },
    );
    await new Promise((r) => server.close(r));
    server = createApp({ databasePath: path });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${server.address().port}/api/rpc`;
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results[0].teacherHidden,
      false,
    );
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results[0].teacherUnread,
      false,
    );
    assert.deepEqual(
      (await call("student", "get_attempt", { attemptId: p.id })).data,
      result,
    );
    const cross = await fetch(url, {
      method: "POST",
      headers: {
        Origin: "https://foreign.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "demo_login" }),
    });
    assert.equal(cross.status, 403);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(path.substring(0, path.lastIndexOf("/")), {
      recursive: true,
      force: true,
    });
  }
});
