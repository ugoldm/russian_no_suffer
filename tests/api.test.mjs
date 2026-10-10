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
        token: a.shareToken,
        name: "API Ученик",
      })
    ).data;
    assert.equal(
      (await call("other", "get_attempt", { attemptId: p.id })).status,
      404,
    );
    assert.equal(
      (
        await call("student", "submit_attempt", {
          attemptId: p.id,
          answers: {},
        })
      ).data.percentage,
      0,
    );
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results.length,
      1,
    );
    await new Promise((r) => server.close(r));
    server = createApp({ databasePath: path });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${server.address().port}/api/rpc`;
    assert.equal(
      (await call("teacher", "teacher_overview")).data.results.length,
      1,
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
