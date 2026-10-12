interface ExerciseLike {
  id: string;
  type: string;
  items?: ExerciseLike[];
  taskNumber?: number;
  label?: string;
}
export interface MissingAnswer {
  position: number;
  exerciseId: string;
  itemId?: string;
  label: string;
}
export function answerFilled(exercise: ExerciseLike, answer: unknown): boolean;
export function missingAnswers(
  exercises: ExerciseLike[],
  answers: Record<string, unknown>,
): MissingAnswer[];
export function missingAnswersMessage(missing: MissingAnswer[]): string;
