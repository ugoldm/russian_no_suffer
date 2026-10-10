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
  const { exercises, ...metadata } = test;
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
function result(state, attempt) {
  const assignment = state.assignments.find(
    (a) => a.id === attempt.assignmentId,
  );
  const test = state.tests.find((t) => t.versionId === attempt.versionId);
  return {
    ...attempt,
    testTitle: test.title,
    exam: test.exam,
    taskNumber: test.taskNumber,
    groupName: assignment.groupName,
    assignmentTitle: assignment.title,
    percentage: Math.round((attempt.correct / attempt.total) * 100),
    exercises: test.exercises.map((e) => ({
      ...e,
      rawAnswer: attempt.answers[e.id] ?? [],
      correct: grade(e, attempt.answers[e.id]),
      correctAnswer: e.key,
      explanation: e.explanation,
    })),
  };
}
export function execute(state, action, args, actor) {
  const now = new Date().toISOString();
  if (action.startsWith("teacher_")) requireTeacher(actor);
  const assignmentByToken = () => {
    const a = state.assignments.find((x) => x.token === args.token);
    if (!a)
      throw new AppError("Домашнее задание не найдено. Проверьте ссылку.", 404);
    return a;
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
        tests: state.tests.map(publicTest),
        groups: state.groups,
        assignments: state.assignments.map((a) => ({
          ...a,
          test: publicTest(
            state.tests.find((t) => t.versionId === a.versionId),
          ),
          attemptCount: state.attempts.filter(
            (x) => x.assignmentId === a.id && x.status === "submitted",
          ).length,
        })),
        results: state.attempts
          .filter((a) => a.status === "submitted")
          .map((a) => {
            const { exercises, answers, ownerId, ...row } = result(state, a);
            return row;
          }),
      };
    case "teacher_preview": {
      const t = state.tests.find((t) => t.id === args.testId);
      if (!t) throw new AppError("Тест не найден.", 404);
      return { ...t, exerciseCount: t.exercises.length };
    }
    case "teacher_group": {
      if (args.id) {
        const g = state.groups.find((g) => g.id === args.id);
        if (!g) throw new AppError("Группа не найдена.", 404);
        if (args.name !== undefined) g.name = cleanName(args.name);
        if (args.archived !== undefined) g.archived = Boolean(args.archived);
        return g;
      }
      const g = {
        id: randomUUID(),
        name: cleanName(args.name),
        archived: false,
      };
      state.groups.push(g);
      return g;
    }
    case "teacher_issue": {
      const t = state.tests.find(
        (t) => t.id === args.testId && t.status === "published",
      );
      if (!t) throw new AppError("Этот тест пока недоступен.", 404);
      const g = args.groupId
        ? state.groups.find((g) => g.id === args.groupId && !g.archived)
        : null;
      if (args.groupId && !g) throw new AppError("Группа недоступна.");
      const a = {
        id: randomUUID(),
        token: randomBytes(24).toString("hex"),
        versionId: t.versionId,
        groupId: g?.id || null,
        groupName: g?.name || "Без группы",
        title: args.title?.trim() || t.title,
        active: true,
        createdAt: now,
      };
      if (a.title.length > 120) throw new AppError("Название слишком длинное.");
      state.assignments.unshift(a);
      return a;
    }
    case "teacher_close": {
      const a = state.assignments.find((a) => a.id === args.assignmentId);
      if (!a) throw new AppError("Выдача не найдена.", 404);
      a.active = false;
      return a;
    }
    case "teacher_result": {
      const a = state.attempts.find(
        (a) => a.id === args.attemptId && a.status === "submitted",
      );
      if (!a) throw new AppError("Результат не найден.", 404);
      return result(state, a);
    }
    case "get_assignment": {
      const a = assignmentByToken();
      const t = state.tests.find((t) => t.versionId === a.versionId);
      return { ...a, test: publicTest(t) };
    }
    case "start_attempt": {
      const a = assignmentByToken();
      if (!a.active) throw new AppError("Приём новых работ завершён.");
      if (
        state.attempts.filter(
          (x) => x.ownerId === actor.id && x.assignmentId === a.id,
        ).length >= 30
      )
        throw new AppError("Достигнут лимит попыток для этой работы.");
      const p = {
        id: randomUUID(),
        assignmentId: a.id,
        versionId: a.versionId,
        ownerId: actor.id,
        name: cleanName(args.name),
        status: "started",
        startedAt: now,
        submittedAt: null,
        answers: {},
        correct: 0,
        total: 0,
        attemptNumber:
          state.attempts.filter(
            (x) => x.assignmentId === a.id && x.ownerId === actor.id,
          ).length + 1,
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
