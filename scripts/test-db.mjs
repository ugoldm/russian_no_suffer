import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import studentGroups from "../shared/student-groups.json" with { type: "json" };
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
  const p = await call("start_attempt", {
    groupDay: "monday",
    groupTime: "17:30",
    token: a.token,
    name: "SQL Ученик",
  });
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
  await db.exec(
    readFileSync("supabase/migrations/005_hide_results.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/006_unread_results.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/007_student_group.sql", "utf8"),
  );
  await as(teacher, false);
  const upgraded = await call("teacher_overview");
  assert.deepEqual(Object.keys(upgraded).sort(), ["results", "tests"]);
  assert.equal(upgraded.results[0].id, p.id);
  assert.equal(upgraded.results[0].teacherUnread, false);
  assert.equal(upgraded.results[0].testId, "ege-4-demo");
  assert.equal(upgraded.results[0].assignmentId, undefined);
  assert.equal(upgraded.results[0].groupName, undefined);
  assert.equal(upgraded.results[0].group, null);
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
    groupDay: "monday",
    groupTime: "17:30",
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
    teacherSeen: true,
  });
  assert.equal(timed.attemptNumber, 2);
  assert.equal(next.group, "ПН 17:30");
  assert.equal(timed.group, "ПН 17:30");
  assert.ok(timed.durationSeconds >= 125 && timed.durationSeconds < 130);
  assert.deepEqual(
    await call("submit_attempt", { attemptId: next.id, answers: {} }),
    timed,
  );
  await db.exec("reset role");
  await as(teacher, false);
  assert.equal(
    (await call("teacher_overview")).results.find((r) => r.id === next.id)
      .teacherUnread,
    true,
  );
  assert.equal(
    (await call("teacher_overview")).results.find((r) => r.id === next.id)
      .group,
    "ПН 17:30",
  );
  for (const attemptIds of [
    undefined,
    null,
    "all",
    [null],
    Array(501).fill(next.id),
  ]) {
    await assert.rejects(
      () => call("teacher_mark_results_seen", { attemptIds }),
      /список/,
    );
  }
  await assert.rejects(
    () =>
      call("teacher_mark_results_seen", {
        attemptIds: [next.id, "99999999-9999-4999-8999-999999999999"],
      }),
    /недоступен/,
  );
  assert.equal(
    (await call("teacher_overview")).results.find((r) => r.id === next.id)
      .teacherUnread,
    true,
  );
  assert.deepEqual(
    await call("teacher_mark_results_seen", { attemptIds: [p.id] }),
    { seenIds: [p.id] },
  );
  assert.equal(
    (await call("teacher_overview")).results.find((r) => r.id === next.id)
      .teacherUnread,
    true,
  );
  assert.deepEqual(
    await call("teacher_mark_results_seen", { attemptIds: [next.id, next.id] }),
    { seenIds: [next.id] },
  );
  assert.deepEqual(
    await call("teacher_mark_results_seen", { attemptIds: [next.id] }),
    { seenIds: [next.id] },
  );
  assert.deepEqual(
    await call("teacher_mark_results_seen", { attemptIds: [] }),
    { seenIds: [] },
  );
  assert.equal(
    (await call("teacher_overview")).results.find((r) => r.id === next.id)
      .teacherUnread,
    false,
  );
  assert.equal(
    (await call("teacher_result", { attemptId: next.id })).durationSeconds,
    timed.durationSeconds,
  );
  assert.equal(
    (await call("teacher_overview")).results.find((p) => p.id === next.id)
      .durationSeconds,
    timed.durationSeconds,
  );
  assert.equal(
    (await call("teacher_overview")).results.find((r) => r.id === next.id)
      .teacherHidden,
    false,
  );
  for (const hidden of [null, "true", 1]) {
    await assert.rejects(
      () => call("teacher_set_result_hidden", { attemptId: next.id, hidden }),
      /нужно ли скрыть/,
    );
  }
  for (const hidden of [true, true, false, false, true]) {
    assert.deepEqual(
      await call("teacher_set_result_hidden", { attemptId: next.id, hidden }),
      { id: next.id, teacherHidden: hidden },
    );
    assert.equal(
      (await call("teacher_overview")).results.find((r) => r.id === next.id)
        .teacherHidden,
      hidden,
    );
    assert.deepEqual(
      await call("teacher_result", { attemptId: next.id }),
      timed,
    );
  }
  await assert.rejects(
    () =>
      call("teacher_set_result_hidden", {
        attemptId: "99999999-9999-4999-8999-999999999999",
        hidden: true,
      }),
    /недоступен/,
  );
  await db.exec("reset role");
  await as(student);
  await assert.rejects(
    () =>
      call("teacher_set_result_hidden", { attemptId: next.id, hidden: false }),
    /преподавателя/,
  );
  await assert.rejects(
    () => call("teacher_mark_results_seen", { attemptIds: [next.id] }),
    /преподавателя/,
  );
  assert.deepEqual(await call("get_attempt", { attemptId: next.id }), timed);
  assert.deepEqual(
    await call("submit_attempt", {
      attemptId: next.id,
      answers: {},
      teacherHidden: false,
    }),
    timed,
  );
  const started = await call("start_attempt", {
    groupDay: "monday",
    groupTime: "17:30",
    token: direct.shareToken,
    name: "SQL Ученик",
  });
  await db.exec("reset role");
  await as(teacher, false);
  await assert.rejects(
    () =>
      call("teacher_set_result_hidden", {
        attemptId: started.id,
        hidden: true,
      }),
    /недоступен/,
  );
  await assert.rejects(
    () => call("teacher_mark_results_seen", { attemptIds: [started.id] }),
    /недоступен/,
  );
  assert.equal(
    (await call("teacher_overview")).results.find((r) => r.id === next.id)
      .teacherUnread,
    false,
  );
  await db.exec("reset role");
  // A second allowlisted teacher still cannot change another teacher's work.
  await db.exec(`insert into private.teachers values('${other}')`);
  await as(other, false);
  await assert.rejects(
    () =>
      call("teacher_set_result_hidden", { attemptId: next.id, hidden: false }),
    /недоступен/,
  );
  await assert.rejects(
    () => call("teacher_mark_results_seen", { attemptIds: [next.id] }),
    /недоступен/,
  );
  assert.equal((await call("teacher_overview")).results.length, 0);
  await db.exec("reset role");
  await db.exec(`delete from private.teachers where user_id='${other}'`);
  await as(teacher, false);
  assert.deepEqual(
    await call("teacher_set_result_hidden", {
      attemptId: next.id,
      hidden: false,
    }),
    { id: next.id, teacherHidden: false },
  );
  await db.exec("reset role");
  await as(student);
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
    () =>
      call("start_attempt", {
        groupDay: "monday",
        groupTime: "17:30",
        token: direct.shareToken,
        name: "Ученик",
      }),
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
  await assert.rejects(
    () => call("teacher_mark_results_seen", { attemptIds: [next.id] }),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      call("teacher_set_result_hidden", { attemptId: next.id, hidden: true }),
    /permission denied/,
  );
  await assert.rejects(() => call("teacher_overview"), /permission denied/);
  await assert.rejects(
    () => call("get_test", { token: direct.shareToken }),
    /permission denied/,
  );
  await db.exec("reset role");
  await as(student);
  await assert.rejects(
    () => db.query("select student_group from private.attempts"),
    /permission denied/,
  );
  for (const args of [
    {},
    { group: "ПН 17:30" },
    { groupDay: "monday" },
    { groupTime: "17:30" },
    { groupDay: "saturday", groupTime: "17:30" },
    { groupDay: "monday", groupTime: "11:00" },
    { groupDay: "sunday", groupTime: "11:30 " },
    { groupDay: ["monday"], groupTime: "17:30" },
    { groupDay: "monday", groupTime: ["17:30"] },
  ]) {
    await assert.rejects(
      () =>
        call("start_attempt", {
          token: direct.shareToken,
          name: "Проверка группы",
          ...args,
        }),
      /Выберите день и время/,
    );
  }
  for (const day of Object.values(studentGroups).flat()) {
    for (const time of day.times) {
      const group = `${day.short} ${time}`;
      const work = await call("start_attempt", {
        token: direct.shareToken,
        name: "SQL Проверка группы",
        groupDay: day.day,
        groupTime: time,
        group: "Подмена",
      });
      assert.equal(work.group, group);
      assert.equal(
        (await call("get_attempt", { attemptId: work.id })).group,
        group,
      );
      const saved = await call("submit_attempt", {
        attemptId: work.id,
        answers: {},
        group: "Подмена",
        groupDay: "sunday",
        groupTime: "11:30",
      });
      assert.equal(saved.group, group);
      assert.deepEqual(
        await call("submit_attempt", {
          attemptId: work.id,
          answers: {},
          group: "Подмена",
        }),
        saved,
      );
      await db.exec("reset role");
      await as(teacher, false);
      assert.equal(
        (await call("teacher_result", { attemptId: work.id })).group,
        group,
      );
      assert.equal(
        (await call("teacher_overview")).results.find((r) => r.id === work.id)
          .group,
        group,
      );
      await db.exec("reset role");
      await as(student);
    }
  }
  // Create historical groups through the previous API, then migrate without rewriting them.
  const oldSavedWork = await call("start_attempt", {
    token: direct.shareToken,
    name: "Прежняя группа",
    groupDay: "friday",
    groupTime: "18:30",
  });
  const oldSavedResult = await call("submit_attempt", {
    attemptId: oldSavedWork.id,
    answers: {},
  });
  const oldGroupDraft = await call("start_attempt", {
    token: direct.shareToken,
    name: "Прежний черновик",
    groupDay: "monday",
    groupTime: "18:30",
  });
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/008_exam_group_schedule.sql", "utf8"),
  );
  await db.query(
    `insert into private.tests(version_id,owner_id,data,share_token)
    select 'oge-schedule-synthetic-v1',$1,
      data || jsonb_build_object('id','oge-schedule-synthetic','versionId','oge-schedule-synthetic-v1','exam','ОГЭ','demo',true),
      'oge-schedule-synthetic-token' from private.tests where version_id=$2`,
    [teacher, direct.versionId],
  );
  await as(student);
  assert.deepEqual(
    await call("get_attempt", { attemptId: oldSavedWork.id }),
    oldSavedResult,
  );
  assert.equal(
    (await call("get_attempt", { attemptId: oldGroupDraft.id })).group,
    "ПН 18:30",
  );
  assert.equal(
    (await call("submit_attempt", { attemptId: oldGroupDraft.id, answers: {} }))
      .group,
    "ПН 18:30",
  );
  await assert.rejects(
    () => db.query("select private.student_group('ЕГЭ','monday','17:30')"),
    /permission denied/,
  );
  await db.exec("reset role");
  await as(other);
  const fridayWork = await call("start_attempt", {
    token: direct.shareToken,
    name: "Прежняя пятничная группа",
    groupDay: "friday",
    groupTime: "17:30",
  });
  const fridayResult = await call("submit_attempt", {
    attemptId: fridayWork.id,
    answers: {},
  });
  const fridayDraft = await call("start_attempt", {
    token: direct.shareToken,
    name: "Прежний пятничный черновик",
    groupDay: "friday",
    groupTime: "17:30",
  });
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/009_remove_friday_group.sql", "utf8"),
  );
  await as(other);
  assert.deepEqual(
    await call("get_attempt", { attemptId: fridayWork.id }),
    fridayResult,
  );
  assert.equal(
    (await call("get_attempt", { attemptId: fridayDraft.id })).group,
    "ПТ 17:30",
  );
  assert.equal(
    (await call("submit_attempt", { attemptId: fridayDraft.id, answers: {} }))
      .group,
    "ПТ 17:30",
  );
  for (const [exam, days] of Object.entries(studentGroups)) {
    const token =
      exam === "ЕГЭ" ? direct.shareToken : "oge-schedule-synthetic-token";
    const otherExam = exam === "ЕГЭ" ? "ОГЭ" : "ЕГЭ";
    const invalid = studentGroups[otherExam].flatMap((day) =>
      day.times.map((time) => ({ groupDay: day.day, groupTime: time })),
    );
    invalid.push({ groupDay: "friday", groupTime: "18:30" });
    invalid.push({ groupDay: "friday", groupTime: "17:30" });
    for (const choice of invalid) {
      await assert.rejects(
        () =>
          call("start_attempt", {
            token,
            name: "Проверка границ экзамена",
            exam: otherExam,
            ...choice,
          }),
        /Выберите день и время/,
      );
    }
    for (const day of days) {
      for (const time of day.times) {
        const work = await call("start_attempt", {
          token,
          name: "Проверка расписания",
          groupDay: day.day,
          groupTime: time,
          exam: otherExam,
        });
        const group = `${day.short} ${time}`;
        assert.equal(work.group, group);
        assert.equal(
          (await call("get_attempt", { attemptId: work.id })).group,
          group,
        );
        const result = await call("submit_attempt", {
          attemptId: work.id,
          answers: {},
          group: "Подмена",
        });
        assert.equal(result.group, group);
        await db.exec("reset role");
        await as(teacher, false);
        assert.equal(
          (await call("teacher_result", { attemptId: work.id })).group,
          group,
        );
        assert.equal(
          (await call("teacher_overview")).results.find((r) => r.id === work.id)
            .group,
          group,
        );
        await db.exec("reset role");
        await as(other);
      }
    }
  }
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/010_digit_set_answers.sql", "utf8"),
  );
  const digitExercise = {
    type: "text",
    key: ["123"],
    normalization: { trim: true, digitSet: true },
  };
  const digitCheck = async (exercise, value) =>
    (
      await db.query("select private.grade($1::jsonb,$2::jsonb) correct", [
        JSON.stringify(exercise),
        JSON.stringify(value),
      ])
    ).rows[0].correct;
  for (const value of ["123", "132", "213", "231", "312", "321", " 231 "])
    assert.equal(await digitCheck(digitExercise, value), true, value);
  for (const value of [
    "",
    " ",
    "12",
    "1234",
    "1123",
    "1223",
    "1,2,3",
    "1 2 3",
    "12a",
    "１２３",
    "1\n23",
    null,
  ])
    assert.equal(await digitCheck(digitExercise, value), false, String(value));
  assert.equal(
    await digitCheck(
      { ...digitExercise, normalization: { trim: true } },
      "321",
    ),
    false,
  );
  assert.equal(await digitCheck({ ...digitExercise, key: ["7"] }, "7"), true);
  assert.equal(await digitCheck({ ...digitExercise, key: ["7"] }, "77"), false);
  console.log(
    "Supabase migration verified: grading, RLS boundary, roles, idempotency, direct links, legacy upgrade, immutable versions, reversible result hiding, unread acknowledgement.",
  );
} finally {
  await db.close();
}
