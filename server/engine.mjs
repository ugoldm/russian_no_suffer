import { randomUUID, randomBytes } from "node:crypto";
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const requireTeacher = (actor) => {
  if (!actor?.teacher)
    throw new AppError("Доступ только для преподавателя.", 403);
};
const cleanName = (value) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw new AppError("Введите имя от 1 до 80 символов.");
  return value.trim();
};
export function publicTest(test) {
  const { exercises, shareToken, legacyTokens, ...metadata } = test;
  return {
    ...metadata,
    exerciseCount: exercises.length,
    exercises: exercises.map(
      ({ key, explanation, normalization, ...exercise }) => exercise,
    ),
  };
}
export function grade(exercise, raw) {
  if (exercise.type === "multiple") {
    if (raw == null) raw = [];
    if (
      !Array.isArray(raw) ||
      raw.some(
        (x) =>
          typeof x !== "string" || !exercise.options.some((o) => o.id === x),
      ) ||
      new Set(raw).size !== raw.length
    )
      throw new AppError("Некорректные варианты ответа.");
    const selected = [...raw].sort();
    const expected = [...exercise.key].sort();
    return (
      selected.length > 0 &&
      selected.length === expected.length &&
      selected.every((id, index) => id === expected[index])
    );
  }
  if (raw == null) raw = "";
  if (typeof raw !== "string" || raw.length > 2000)
    throw new AppError("Некорректный текстовый ответ.");
  if (
    exercise.type === "single" &&
    raw &&
    !exercise.options.some((o) => o.id === raw)
  )
    throw new AppError("Некорректный вариант ответа.");
  const normalize = (value) => {
    let s = value;
    if (exercise.normalization?.trim) s = s.trim();
    if (exercise.normalization?.ignoreCase) s = s.toLocaleLowerCase("ru");
    return s;
  };
  return (
    raw.length > 0 && exercise.key.some((k) => normalize(k) === normalize(raw))
  );
}
// Upgrade existing local records without deleting attempts or their frozen versions.
export function migrateState(state) {
  for (const test of state.tests) {
    test.shareToken ||= randomBytes(24).toString("hex");
    test.legacyTokens ||= (state.assignments || [])
      .filter((a) => a.versionId === test.versionId && a.active)
      .map((a) => a.token);
  }
  for (const attempt of state.attempts) {
    const test = state.tests.find((t) => t.versionId === attempt.versionId);
    attempt.testId = test.id;
    delete attempt.assignmentId;
  }
  // Old separate links could each have an attempt 1 for the same student.
  if (state.assignments) {
    const counts = new Map();
    for (const attempt of [...state.attempts].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    )) {
      const key = JSON.stringify([attempt.ownerId, attempt.versionId]);
      attempt.attemptNumber = (counts.get(key) || 0) + 1;
      counts.set(key, attempt.attemptNumber);
    }
  }
  delete state.groups;
  delete state.assignments;
  return state;
}
function result(state, attempt) {
  const test = state.tests.find((t) => t.versionId === attempt.versionId);
  const { teacherHidden, ...savedAttempt } = attempt;
  return {
    ...savedAttempt,
    testId: test.id,
    testTitle: test.title,
    exam: test.exam,
    taskNumber: test.taskNumber,
    percentage: Math.round((attempt.correct / attempt.total) * 100),
    durationSeconds:
      attempt.startedAt && attempt.submittedAt
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(attempt.submittedAt) -
                Date.parse(attempt.startedAt)) /
                1000,
            ),
          )
        : null,
    exercises: test.exercises.map((e) => ({
      ...e,
      rawAnswer: attempt.answers[e.id] ?? (e.type === "multiple" ? [] : ""),
      correct: grade(e, attempt.answers[e.id]),
      correctAnswer: e.key,
      explanation: e.explanation,
    })),
  };
}
export function execute(state, action, args, actor) {
  const now = new Date().toISOString();
  if (action.startsWith("teacher_")) requireTeacher(actor);
  const testByToken = () => {
    const test = state.tests.find(
      (t) =>
        t.shareToken === args.token || t.legacyTokens?.includes(args.token),
    );
    if (!test || test.status === "draft")
      throw new AppError("Тест не найден. Проверьте ссылку.", 404);
    return test;
  };
  const ownAttempt = () => {
    const a = state.attempts.find(
      (x) => x.id === args.attemptId && x.ownerId === actor.id,
    );
    if (!a) throw new AppError("Попытка недоступна.", 404);
    return a;
  };
  switch (action) {
    case "teacher_overview":
      return {
        tests: state.tests
          .filter(
            (t) =>
              t.status === "published" &&
              !state.tests.some(
                (newer) =>
                  newer.id === t.id &&
                  newer.status === "published" &&
                  newer.version > t.version,
              ),
          )
          .map((t) => ({ ...publicTest(t), shareToken: t.shareToken })),
        results: state.attempts
          .filter((a) => a.status === "submitted")
          .map((a) => {
            const { exercises, answers, ownerId, ...row } = result(state, a);
            return { ...row, teacherHidden: a.teacherHidden === true };
          }),
      };
    case "teacher_preview": {
      const t = state.tests
        .filter(
          (t) =>
            t.id === args.testId &&
            (!args.versionId || t.versionId === args.versionId),
        )
        .sort((a, b) => b.version - a.version)[0];
      if (!t) throw new AppError("Тест не найден.", 404);
      return { ...t, exerciseCount: t.exercises.length };
    }
    case "teacher_result": {
      const a = state.attempts.find(
        (a) => a.id === args.attemptId && a.status === "submitted",
      );
      if (!a) throw new AppError("Результат не найден.", 404);
      return result(state, a);
    }
    case "teacher_set_result_hidden": {
      if (typeof args.hidden !== "boolean")
        throw new AppError("Укажите, нужно ли скрыть работу.");
      const a = state.attempts.find(
        (a) => a.id === args.attemptId && a.status === "submitted",
      );
      if (!a) throw new AppError("Результат не найден.", 404);
      a.teacherHidden = args.hidden;
      return { id: a.id, teacherHidden: a.teacherHidden };
    }
    case "get_test": {
      return publicTest(testByToken());
    }
    case "start_attempt": {
      const t = testByToken();
      if (t.status !== "published")
        throw new AppError("Тест больше не доступен для новых попыток.");
      const previous = state.attempts.filter(
        (x) => x.ownerId === actor.id && x.versionId === t.versionId,
      );
      if (previous.length >= 30)
        throw new AppError("Достигнут лимит попыток для этого теста.");
      const p = {
        id: randomUUID(),
        testId: t.id,
        versionId: t.versionId,
        ownerId: actor.id,
        name: cleanName(args.name),
        status: "started",
        startedAt: now,
        submittedAt: null,
        answers: {},
        correct: 0,
        total: 0,
        attemptNumber: previous.length + 1,
      };
      state.attempts.push(p);
      return {
        id: p.id,
        versionId: p.versionId,
        name: p.name,
        status: p.status,
      };
    }
    case "get_attempt": {
      const p = ownAttempt();
      return p.status === "submitted"
        ? result(state, p)
        : { id: p.id, versionId: p.versionId, name: p.name, status: p.status };
    }
    case "submit_attempt": {
      const p = ownAttempt();
      if (p.status === "submitted") return result(state, p);
      if (
        !args.answers ||
        typeof args.answers !== "object" ||
        Array.isArray(args.answers)
      )
        throw new AppError("Некорректные ответы.");
      const t = state.tests.find((t) => t.versionId === p.versionId);
      if (
        Object.keys(args.answers).some(
          (id) => !t.exercises.some((e) => e.id === id),
        )
      )
        throw new AppError("В ответах есть упражнение из другого теста.");
      const correct = t.exercises.filter((e) =>
        grade(e, args.answers[e.id]),
      ).length;
      p.answers = structuredClone(args.answers);
      p.correct = correct;
      p.total = t.exercises.length;
      p.status = "submitted";
      p.submittedAt = now;
      return result(state, p);
    }
    default:
      throw new AppError("Неизвестное действие.", 404);
  }
}
