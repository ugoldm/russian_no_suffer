// Complete, deliberately wrong answers for tests that exercise work lifecycle.
export function filledAnswers(test) {
  const wrong = (exercise) =>
    exercise.type === "group"
      ? Object.fromEntries(exercise.items.map((item) => [item.id, wrong(item)]))
      : exercise.type === "text"
        ? "неверно"
        : exercise.type === "multiple"
          ? [
              exercise.options.find(
                (option) => !exercise.key.includes(option.id),
              ).id,
            ]
          : exercise.options.find((option) => !exercise.key.includes(option.id))
              .id;
  return Object.fromEntries(
    test.exercises.map((exercise) => [exercise.id, wrong(exercise)]),
  );
}
