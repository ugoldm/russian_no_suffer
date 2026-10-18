export interface Option {
  id: string;
  text: string;
}
export type Answer = string | string[] | Record<string, string | string[]>;
export interface Exercise {
  id: string;
  prompt: string;
  type: "multiple" | "single" | "text" | "group";
  options?: Option[];
  passage?: string;
  passageHighlights?: { start: number; end: number }[];
  items?: Exercise[];
  taskNumber?: number;
  label?: string;
  answerPlaceholder?: string;
  matchingTable?: {
    leftTitle: string;
    rightTitle: string;
    left: Option[];
    right: Option[];
  };
  score?: number;
  total?: number;
  key?: string[];
  correctAnswer?: string[];
  explanation?: string;
  rawAnswer?: Answer;
  correct?: boolean;
}
export interface Test {
  id: string;
  versionId: string;
  shareToken: string;
  exam: string;
  year: string;
  taskNumber: number;
  title: string;
  subtitle: string;
  version: number;
  status: string;
  demo: boolean;
  description: string;
  source: string;
  exerciseCount: number;
  estimatedDuration?: string;
  maximumScore?: number;
  exercises: Exercise[];
}
export interface Attempt {
  id: string;
  name: string;
  group: string | null;
  versionId: string;
  status: string;
  testId: string;
  correct: number;
  total: number;
  percentage: number;
  submittedAt: string;
  teacherHidden?: boolean;
  teacherUnread?: boolean;
  durationSeconds: number | null;
  testTitle: string;
  exam: string;
  taskNumber: number;
  exercises: Exercise[];
}
export interface Overview {
  tests: Test[];
  results: Attempt[];
}
export interface Draft {
  id: string;
  versionId: string;
  name: string;
  group: string | null;
  answers: Record<string, Answer>;
  position: number;
}
