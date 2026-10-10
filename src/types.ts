export interface Option {
  id: string;
  text: string;
}
export interface Exercise {
  id: string;
  prompt: string;
  type: "multiple" | "single" | "text";
  options?: Option[];
  key?: string[];
  correctAnswer?: string[];
  explanation?: string;
  rawAnswer?: string | string[];
  correct?: boolean;
}
export interface Test {
  id: string;
  versionId: string;
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
  exercises: Exercise[];
}
export interface Group {
  id: string;
  name: string;
  archived: boolean;
}
export interface Assignment {
  id: string;
  token: string;
  versionId: string;
  groupId: string | null;
  groupName: string;
  title: string;
  active: boolean;
  createdAt: string;
  test: Test;
  attemptCount: number;
}
export interface Attempt {
  id: string;
  name: string;
  versionId: string;
  status: string;
  assignmentId: string;
  attemptNumber: number;
  correct: number;
  total: number;
  percentage: number;
  submittedAt: string;
  testTitle: string;
  exam: string;
  taskNumber: number;
  groupName: string;
  assignmentTitle: string;
  exercises: Exercise[];
}
export interface Overview {
  tests: Test[];
  groups: Group[];
  assignments: Assignment[];
  results: Attempt[];
}
export interface Draft {
  id: string;
  versionId: string;
  name: string;
  answers: Record<string, string | string[]>;
  position: number;
}
