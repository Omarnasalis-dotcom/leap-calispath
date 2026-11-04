// What a day card shows before the athlete adds it (2026-11-04, owner): each
// block and its exercises. Built from the same resolved blocks the confirm
// tap inserts, so the preview is exactly what gets added. Raw numbers only;
// the app words them in the athlete's language. Kept pure so it is testable
// from Jest.

import { getBlockParts, parseConceptNotes } from "./blockHelpers.ts";

export interface PreviewExercise {
  name: string;
  sets: number | null;
  reps: number | null;
  hold_seconds: number | null;
  is_weighted: boolean;
  note: string | null;
}

export interface PreviewBlock {
  title: string;
  structure: string | null;
  rounds: number | null;
  exercises: PreviewExercise[];
}

type ResolvedBlock = {
  name: string;
  notes?: string | null;
  order_index?: number;
  exercises?: Array<{ exercise_id?: string; sets?: unknown; reps?: unknown; hold_seconds?: unknown; is_weighted?: unknown; notes?: unknown; order_index?: number }>;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function exerciseIds(blocks: ResolvedBlock[]): string[] {
  return [...new Set(blocks.flatMap((b) => (b.exercises ?? []).map((e) => e.exercise_id).filter((id): id is string => typeof id === "string")))];
}

export function buildDayPreview(blocks: ResolvedBlock[], nameById: Map<string, string>): PreviewBlock[] {
  return [...blocks]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((block) => {
      const { metadata } = parseConceptNotes(block.notes);
      const structure = typeof metadata.structure === "string" ? metadata.structure : null;
      return {
        title: getBlockParts({ name: block.name, exercises: [] } as never).phase || block.name,
        structure,
        rounds: num(metadata.rounds),
        exercises: [...(block.exercises ?? [])]
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((e) => ({
            name: (e.exercise_id && nameById.get(e.exercise_id)) || "?",
            sets: num(e.sets),
            reps: num(e.reps),
            hold_seconds: num(e.hold_seconds),
            is_weighted: e.is_weighted === true,
            note: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim().slice(0, 120) : null,
          })),
      };
    })
    .filter((b) => b.exercises.length > 0);
}
