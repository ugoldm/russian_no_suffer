import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon; create role authenticated; grant usage on schema public to authenticated; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`,
  );
  await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/002_demo_test.sql", "utf8"));
  const teacher = "11111111-1111-4111-8111-111111111111",
    student = "22222222-2222-4222-8222-222222222222",
    other = "33333333-3333-4333-8333-333333333333";
  await db.exec(
    `insert into auth.users values ('${teacher}','teacher@example.test'),('${student}',null),('${other}',null);insert into private.teachers values('${teacher}');`,
  );
  async function as(uid, anonymous = true) {
    await db.query(
      `select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,
      [uid, JSON.stringify({ is_anonymous: anonymous })],
    );
    await db.exec("set role authenticated");
  }
  async function call(name, args = {}) {
    return (
      await db.query(`select public.${name}($1::jsonb) result`, [
        JSON.stringify(args),
      ])
    ).rows[0].result;
  }
  await as(student);
  await assert.rejects(() => call("teacher_overview"), /преподавателя/);
  await assert.rejects(
    () => db.query("select * from private.tests"),
    /permission denied/,
  );
  await db.exec("reset role");
  await as(teacher, false);
  const overview = await call("teacher_overview");
  assert.equal(overview.tests.length, 1);
  assert.ok(!JSON.stringify(overview.tests).includes("explanation"));
  // Seed a saved result via the old API, then migrate in place.
  const g = await call("teacher_group", { name: "Проверочная группа" });
  const a = await call("teacher_issue", {
    testId: "ege-4-demo",
    groupId: g.id,
  });
  assert.equal(a.groupName, "Проверочная группа");
  await db.exec("reset role");
  await as(student);
  const visible = await call("get_assignment", { token: a.token });
  assert.equal(visible.test.exercises[0].key, undefined);
  const p = await call("start_attempt", { token: a.token, name: "SQL Ученик" });
  await assert.rejects(
    () =>
      call("submit_attempt", { attemptId: p.id, answers: { foreign: ["1"] } }),
    /другого теста/,
  );
  await assert.rejects(
    () =>
      call("submit_attempt", {
        attemptId: p.id,
        answers: { "stress-1": ["1", "1"] },
      }),
    /Повторяющиеся/,
  );
  const answers = {
    "stress-1": ["5", "4", "2", "1"],
    "stress-2": ["1", "2", "4", "5"],
    "stress-3": ["1", "2", "3", "4"],
    "stress-4": ["2", "3", "4"],
  };
  const result = await call("submit_attempt", {
    attemptId: p.id,
    answers,
    percentage: 100,
  });
  assert.equal(result.correct, 4);
  assert.equal(result.percentage, 67);
  assert.equal(result.exercises[0].correct, true);
  const retry = await call("submit_attempt", { attemptId: p.id, answers: {} });
  assert.deepEqual(retry, result);
  await db.exec("reset role");
  await as(other);
  await assert.rejects(
    () => call("get_attempt", { attemptId: p.id }),
    /недоступна/,
  );
  await assert.rejects(
    () => call("submit_attempt", { attemptId: p.id, answers: {} }),
    /недоступна/,
  );
  await assert.rejects(() => call("teacher_overview"), /преподавателя/);
  await db.exec("reset role");
  await as(teacher, false);
  assert.equal(
    (await call("teacher_result", { attemptId: p.id })).name,
    "SQL Ученик",
  );
  assert.equal((await call("teacher_overview")).results.length, 1);
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/003_direct_test_links.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/004_attempt_duration.sql", "utf8"),
  );
  await as(teacher, false);
  const upgraded = await call("teacher_overview");
  assert.deepEqual(Object.keys(upgraded).sort(), ["results", "tests"]);
  assert.equal(upgraded.results[0].id, p.id);
  assert.equal(upgraded.results[0].testId, "ege-4-demo");
  assert.equal(upgraded.results[0].assignmentId, undefined);
  assert.equal(upgraded.results[0].groupName, undefined);
  assert.equal(
    upgraded.results[0].durationSeconds,
    Math.max(
      0,
      Math.floor(
        (Date.parse(result.submittedAt) - Date.parse(result.startedAt)) / 1000,
      ),
    ),
  );
  assert.deepEqual(
    (await call("teacher_result", { attemptId: p.id })).exercises,
    result.exercises,
  );
  const direct = upgraded.tests[0];
  assert.equal(
    (
      await call("teacher_preview", {
        testId: direct.id,
        versionId: direct.versionId,
      })
    ).versionId,
    direct.versionId,
  );
  await assert.rejects(
    () => call("teacher_preview", { testId: direct.id, versionId: "missing" }),
    /не найден/,
  );
  assert.equal(
    (await call("teacher_overview")).tests[0].shareToken,
    direct.shareToken,
  );
  await assert.rejects(
    () => call("teacher_issue", { testId: direct.id }),
    /does not exist/,
  );
  await db.exec("reset role");
  await as(student);
  assert.equal(
    (await call("get_test", { token: a.token })).versionId,
    direct.versionId,
  );
  const directTest = await call("get_test", { token: direct.shareToken });
  assert.equal(directTest.exercises[0].key, undefined);
  assert.ok(!JSON.stringify(directTest).includes("explanation"));
  const next = await call("start_attempt", {
    token: direct.shareToken,
    name: "SQL Ученик",
    startedAt: "2000-01-01T00:00:00Z",
  });
  // Simulate elapsed time without waiting; only the privileged test setup can alter it.
  await db.exec("reset role");
  await db.query(
    "update private.attempts set started_at=now()-interval '125 seconds' where id=$1",
    [next.id],
  );
  await as(student);
  await call("get_test", { token: direct.shareToken });
  await call("get_attempt", { attemptId: next.id });
  const timed = await call("submit_attempt", {
    attemptId: next.id,
    answers: {},
    durationSeconds: 1,
    submittedAt: "2000-01-01T00:00:00Z",
  });
  assert.equal(timed.attemptNumber, 2);
  assert.ok(timed.durationSeconds >= 125 && timed.durationSeconds < 130);
  assert.deepEqual(
    await call("submit_attempt", { attemptId: next.id, answers: {} }),
    timed,
  );
  await db.exec("reset role");
  await as(teacher, false);
  assert.equal(
    (await call("teacher_result", { attemptId: next.id })).durationSeconds,
    timed.durationSeconds,
  );
  assert.equal(
    (await call("teacher_overview")).results.find((p) => p.id === next.id)
      .durationSeconds,
    timed.durationSeconds,
  );
  await db.exec("reset role");
  await as(student);
  const started = await call("start_attempt", {
    token: direct.shareToken,
    name: "SQL Ученик",
  });
  await assert.rejects(
    () => call("get_test", { token: "invalid" }),
    /не найден/,
  );
  await db.exec("reset role");
  await db.exec(
    `update private.tests set data=jsonb_set(data,'{status}','"archived"') where version_id='ege-4-demo-v1'`,
  );
  await as(student);
  await assert.rejects(
    () => call("start_attempt", { token: direct.shareToken, name: "Ученик" }),
    /новых попыток/,
  );
  assert.equal(
    (await call("submit_attempt", { attemptId: started.id, answers: {} }))
      .percentage,
    0,
  );
  await db.exec("reset role");
  await db.exec(
    `update private.tests set data=jsonb_set(data,'{status}','"published"') where version_id='ege-4-demo-v1'`,
  );
  await db.exec("reset role");
  await as(other, false);
  await assert.rejects(() => call("teacher_overview"), /преподавателя/);
  await assert.rejects(
    () => call("get_attempt", { attemptId: p.id }),
    /недоступна/,
  );
  await assert.rejects(
    () => call("submit_attempt", { attemptId: p.id, answers: {} }),
    /недоступна/,
  );
  await assert.rejects(
    () => db.query("select * from private.tests"),
    /permission denied/,
  );
  await db.exec("reset role");
  const textExercise = {
    type: "text",
    key: ["ёлка"],
    normalization: { trim: true, ignoreCase: true },
  };
  const textCheck = async (value) =>
    (
      await db.query("select private.grade($1::jsonb,$2::jsonb) correct", [
        JSON.stringify(textExercise),
        JSON.stringify(value),
      ])
    ).rows[0].correct;
  assert.equal(await textCheck(" ЁЛКА "), true);
  assert.equal(await textCheck("елка"), false);
  assert.equal(await textCheck("ё лка"), false);
  await assert.rejects(
    () =>
      db.exec(
        `update private.tests set data=jsonb_set(data,'{title}','"Changed"') where version_id='ege-4-demo-v1'`,
      ),
    /неизменяема/,
  );
  assert.equal(
    (
      await db.query(
        "select to_regclass('private.groups') g,to_regclass('private.assignments') a",
      )
    ).rows[0].g,
    null,
  );
  assert.equal(
    (await db.query("select to_regclass('private.assignments') a")).rows[0].a,
    null,
  );
  await db.exec("set role anon");
  await assert.rejects(() => call("teacher_overview"), /permission denied/);
  await assert.rejects(
    () => call("get_test", { token: direct.shareToken }),
    /permission denied/,
  );
  console.log(
    "Supabase migration verified: grading, RLS boundary, roles, idempotency, direct links, legacy upgrade, immutable versions.",
  );
} finally {
  await db.close();
}
