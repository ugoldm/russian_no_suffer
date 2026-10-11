import { randomUUID, randomBytes } from "node:crypto";
import {
  missingAnswers,
  missingAnswersMessage,
} from "../shared/answer-completeness.mjs";
import studentGroups from "../shared/student-groups.json" with { type: "json" };
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
const cleanGroup = (exam, day, time) => {
  const groups = Object.hasOwn(studentGroups, exam) ? studentGroups[exam] : [];
  const schedule = groups.find((group) => group.day === day);
  if (!schedule || !schedule.times.includes(time))
    throw new AppError("Выберите день и время занятий из списка.");
  return `${schedule.short} ${time}`;
};
export function publicExercise(exercise) {
  const { key, explanation, normalization, items, ...data } = exercise;
  return items ? { ...data, items: items.map(publicExercise) } : data;
}
export function scoredAnswers(exercise, raw) {
  if (exercise.type !== "group") return [{ exercise, raw }];
  if (
    raw != null &&
    (typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.keys(raw).some(
        (id) => !exercise.items.some((item) => item.id === id),
      ))
  )
    throw new AppError("Некорректные ответы на задания текста.");
  return exercise.items.map((item) => ({
    exercise: item,
    raw: raw?.[item.id],
  }));
}
export function resultExercise(exercise, raw) {
  if (exercise.type === "group") {
    const items = scoredAnswers(exercise, raw).map(({ exercise, raw }) =>
      resultExercise(exercise, raw),
    );
    return {
      ...exercise,
      items,
      rawAnswer: raw ?? {},
      correct: items.every((item) => item.correct),
      score: items.filter((item) => item.correct).length,
      total: items.length,
    };
  }
  return {
    ...exercise,
    rawAnswer: raw ?? (exercise.type === "multiple" ? [] : ""),
    correct: grade(exercise, raw),
    correctAnswer: exercise.key,
  };
}
export function publicTest(test) {
  const { exercises, shareToken, legacyTokens, ...metadata } = test;
  return {
    ...metadata,
    exerciseCount: exercises.length,
    exercises: exercises.map(publicExercise),
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
    if (exercise.type === "text" && exercise.normalization?.digitSet) {
      if (!/^[0-9]+$/.test(s) || new Set(s).size !== s.length) return null;
      s = [...s].sort().join("");
    }
    return s;
  };
  const submitted = normalize(raw);
  return (
    raw.length > 0 &&
    submitted !== null &&
    exercise.key.some((k) => normalize(k) === submitted)
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
    attempt.teacherSeen ??= attempt.status === "submitted";
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
  const { teacherHidden, teacherSeen, ...savedAttempt } = attempt;
  return {
    ...savedAttempt,
    group: attempt.group ?? null,
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
    exercises: test.exercises.map((e) =>
      resultExercise(e, attempt.answers[e.id]),
    ),
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
            return {
              ...row,
              teacherHidden: a.teacherHidden === true,
              teacherUnread: a.teacherSeen === false,
            };
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
    case "teacher_mark_results_seen": {
      if (
        !Array.isArray(args.attemptIds) ||
        args.attemptIds.length > 500 ||
        args.attemptIds.some((id) => typeof id !== "string" || !id)
      )
        throw new AppError("Укажите список завершённых работ.");
      const seenIds = [...new Set(args.attemptIds)];
      const works = seenIds.map((id) => {
        const a = state.attempts.find(
          (a) => a.id === id && a.status === "submitted",
        );
        if (!a) throw new AppError("Результат недоступен.", 404);
        return a;
      });
      works.forEach((a) => {
        a.teacherSeen = true;
      });
      return { seenIds };
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
        group: cleanGroup(t.exam, args.groupDay, args.groupTime),
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
        group: p.group,
        status: p.status,
      };
    }
    case "get_attempt": {
      const p = ownAttempt();
      return p.status === "submitted"
        ? result(state, p)
        : {
            id: p.id,
            versionId: p.versionId,
            name: p.name,
            group: p.group ?? null,
            status: p.status,
          };
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
      const answers = t.exercises.flatMap((e) =>
        scoredAnswers(e, args.answers[e.id]),
      );
      const missing = missingAnswers(t.exercises, args.answers);
      if (missing.length) throw new AppError(missingAnswersMessage(missing));
      const correct = answers.filter(({ exercise, raw }) =>
        grade(exercise, raw),
      ).length;
      p.answers = structuredClone(args.answers);
      p.correct = correct;
      p.total = answers.length;
      p.status = "submitted";
      p.teacherSeen = false;
      p.submittedAt = now;
      return result(state, p);
    }
    default:
      throw new AppError("Неизвестное действие.", 404);
  }
}
