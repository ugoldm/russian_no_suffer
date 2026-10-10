import type { Exercise } from "./types";

export function formatReviewAnswer(
  exercise: Pick<Exercise, "type" | "options">,
  answer: unknown,
  emptyLabel = "Нет ответа",
) {
  if (exercise.type === "text") {
    if (typeof answer === "string") return answer || emptyLabel;
    return Array.isArray(answer) && answer.length
      ? answer.join(", ")
      : emptyLabel;
  }
  const selected = Array.isArray(answer)
    ? answer
    : typeof answer === "string" && answer
      ? [answer]
      : [];
  return (
    exercise.options
      ?.map((option, index) =>
        selected.includes(option.id) ? String(index + 1) : "",
      )
      .join("") || emptyLabel
  );
}
