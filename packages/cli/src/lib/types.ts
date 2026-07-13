export type ExerciseType = "programming" | "text" | "modeling" | "quiz" | "file-upload";

export interface Course {
  id: number;
  title: string;
  shortName: string;
  [key: string]: unknown;
}

export interface Exercise {
  id: number;
  title: string;
  shortName?: string;
  type: ExerciseType;
  [key: string]: unknown;
}

export interface ExerciseManifest {
  exerciseId: number;
  type: ExerciseType;
  title: string;
  shortName?: string;
  sourceCourseId: number;
  sourceBaseUrl: string;
  exportedAt: string;
  hasZip: boolean;
  clonedRepos: string[];
}
