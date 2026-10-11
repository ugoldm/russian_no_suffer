// Presence only: correctness and answer structure are checked separately by the server.
export function answerFilled(exercise, answer) {
  if (exercise.type === "group")
    return (
      !!exercise.items?.length &&
      exercise.items.every((item) =>
        answerFilled(
          item,
          answer && typeof answer === "object" && !Array.isArray(answer)
            ? answer[item.id]
            : undefined,
        ),
      )
    );
  if (exercise.type === "multiple")
    return Array.isArray(answer) && answer.length > 0;
  return typeof answer === "string" && answer.trim().length > 0;
}
export function missingAnswers(exercises, answers) {
  return exercises.flatMap((exercise, position) => {
    const raw = answers[exercise.id];
    if (exercise.type !== "group")
      return answerFilled(exercise, raw)
        ? []
        : [
            {
              position,
              exerciseId: exercise.id,
              label: `Упражнение ${position + 1}`,
            },
          ];
    return (exercise.items || []).flatMap((item, index) =>
      answerFilled(
        item,
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? raw[item.id]
          : undefined,
      )
        ? []
        : [
            {
              position,
              exerciseId: exercise.id,
              itemId: item.id,
              label: `Упражнение ${position + 1}, задание № ${item.taskNumber ?? index + 1}`,
            },
          ],
    );
  });
}
export function missingAnswersMessage(missing) {
  return `Нельзя сдать работу: ответьте на все задания. Без ответа: ${missing.map((item) => item.label).join("; ")}.`;
}
