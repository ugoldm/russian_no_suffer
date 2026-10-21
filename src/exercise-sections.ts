import type { Exercise } from "./types";

// Only explicit top-level task numbers create blocks. Reading groups keep
// their existing navigation by passage and their own nested task headings.
export function exerciseSections(exercises: Exercise[]) {
  const mixed =
    exercises.every((e) => Number.isInteger(e.taskNumber)) &&
    new Set(exercises.map((e) => e.taskNumber)).size > 1;
  const sections: {
    taskNumber?: number;
    start: number;
    exercises: Exercise[];
  }[] = [];
  exercises.forEach((exercise, index) => {
    const taskNumber = mixed ? exercise.taskNumber : undefined;
    const last = sections.at(-1);
    if (!last || last.taskNumber !== taskNumber) {
      sections.push({ taskNumber, start: index, exercises: [exercise] });
    } else {
      last.exercises.push(exercise);
    }
  });
  return sections;
}
