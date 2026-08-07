import type { ConceptMetadata } from '@/shared/BlockConceptParser';

export interface ExerciseOption {
  id: string;
  name: string;
  youtube_url: string | null;
  // Whether the viewer can newly pick this exercise (their own, or admin —
  // never restricts resolving an already-selected exercise's display info,
  // just what's offered when choosing/changing one; see ExerciseRow).
  pickable: boolean;
}

// Mirrors mobile's useProgramBuilder.ts state shape exactly (SelectedExercise
// / ProgramBlock / ProgramDay) — there is no program_days table; a "day" is
// a purely client-side grouping derived from parsing program_blocks.name as
// "<Day> | <Block>". Keeping the same three-level shape here (not the old
// flattened Day-with-exercises shape the previous web builder used) is what
// makes the concept-metadata system and the block/day clipboard possible.

export interface BuilderExercise {
  id: string; // client-side key
  exercise_id: string;
  exercise_name?: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  notes: string;
}

export interface BuilderBlock {
  id: string; // client-side key
  db_id: string | null;
  name: string;
  notes: string; // clean notes only — concept metadata lives in `metadata`
  metadata: ConceptMetadata;
  exercises: BuilderExercise[];
}

export interface BuilderDay {
  id: string; // client-side key, never persisted directly
  name: string;
  focus_tag?: ConceptMetadata['focus_tag'];
  blocks: BuilderBlock[];
}

export type BuilderWeeks = Record<number, BuilderDay[]>;

export function defaultBlockMetadata(): ConceptMetadata {
  return { timing_system: 'straight_set', structure: 'single', rounds: '4', rest_after_round: '90' };
}

let keyCounter = 0;
export function clientKey(): string {
  keyCounter += 1;
  return `k${Date.now().toString(36)}${keyCounter}`;
}

export function newBlock(name = 'Workout Routine'): BuilderBlock {
  return {
    id: clientKey(),
    db_id: null,
    name,
    notes: '',
    metadata: defaultBlockMetadata(),
    exercises: [],
  };
}

export function newDay(name: string): BuilderDay {
  return { id: clientKey(), name, blocks: [newBlock()] };
}

export function cloneBlock(block: BuilderBlock): BuilderBlock {
  return {
    ...block,
    id: clientKey(),
    db_id: null,
    metadata: { ...block.metadata },
    exercises: block.exercises.map((e) => ({ ...e, id: clientKey() })),
  };
}

export function cloneDay(day: BuilderDay): BuilderDay {
  return {
    ...day,
    id: clientKey(),
    blocks: day.blocks.map(cloneBlock),
  };
}
