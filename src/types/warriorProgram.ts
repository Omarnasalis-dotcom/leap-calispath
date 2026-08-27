import { ConceptMetadata } from '../lib/BlockConceptParser';

// Shared between WarriorProgramScreen.tsx (owns the fetch/state), the
// day-grouping/day-state helpers in src/lib/warriorProgramDays.ts, and
// WarriorBlockCard.tsx (which previously imported these from the screen
// module directly) — moved here so no consumer has to import a screen file
// just for its types.

export interface ExerciseDetail {
  id: string | number;
  name: string;
  youtube_url: string;
  sets: string | number;
  reps: string;
  rest_seconds: string | number;
  hold_seconds?: string | number;
  is_weighted?: boolean;
  notes: string;
}

export interface ProgramBlock {
  id: string | number;
  name: string;
  notes: string;
  exercises: ExerciseDetail[];
  completedStatus: 'completed' | 'missed' | 'none';
  metadata?: ConceptMetadata;
  week_number?: number;
}

export interface ProgramDay {
  name: string;
  blocks: ProgramBlock[];
}
