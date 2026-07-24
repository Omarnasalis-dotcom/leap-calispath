// Adapted from src/lib/ProgramExportBuilder.ts — same payload shape and
// query logic (kept in sync manually), trimmed of the native (expo-file-system
// / expo-sharing) branch since admin-web only ever runs in a browser.
import { supabase } from '@/lib/supabase';
import { BlockConceptParser, type ConceptMetadata } from './BlockConceptParser';

export interface ExportSetLog {
  set_index: number | null;
  reps_completed: number | null;
  weight_used: number | null;
  hold_seconds: number | null;
  exercise_name: string | null;
}

export interface ExportSourceLog {
  blockId: string;
  status: 'completed' | 'missed';
  feel: string | null;
  rpe: number | null;
  missedReason: string | null;
  missedDetail: string | null;
  sessionSeconds: number | null;
  notes: string;
  sets: ExportSetLog[];
}

export interface WeekExportBlock {
  block_id: string;
  day_name: string;
  block_name: string;
  order_index: number;
  metadata: ConceptMetadata;
  coach_notes: string;
  exercises: Array<{
    exercise_id: string;
    name: string;
    sets: string;
    reps: string;
    rest_seconds: string;
    hold_seconds: string;
    is_weighted: boolean;
  }>;
  log: {
    status: 'completed' | 'missed';
    feel: string | null;
    rpe: number | null;
    missed_reason: string | null;
    missed_detail: string | null;
    session_seconds: number | null;
    notes: string;
    sets: ExportSetLog[];
  } | null;
}

export interface WeekExportPayload {
  exported_at: string;
  warrior: {
    id: string;
    display_name: string;
    strength_tier: number;
  };
  program: {
    template_name: string;
    week_number: number;
  };
  coach_week_note: string;
  bodyweight_trend: { logged_at: string; weight_kg: number }[];
  blocks: WeekExportBlock[];
}

interface FetchWeekExportParams {
  templateId: string;
  templateName: string;
  weekNumber: number;
  warriorId: string;
  warriorDisplayName: string;
  warriorStrengthTier: number;
  logs: ExportSourceLog[];
  bodyweightTrend: { logged_at: string; weight_kg: number }[];
  coachWeekNote: string;
}

export async function fetchWeekExportPayload(params: FetchWeekExportParams): Promise<WeekExportPayload> {
  const { data: blocksData, error: blocksError } = await supabase
    .from('program_blocks')
    .select('id, name, notes, order_index')
    .eq('template_id', params.templateId)
    .eq('week_number', params.weekNumber)
    .order('order_index', { ascending: true });
  if (blocksError) throw new Error(blocksError.message);

  const blockIds = (blocksData ?? []).map((b) => b.id);
  let allExercisesData: Array<Record<string, unknown>> = [];
  if (blockIds.length > 0) {
    const { data, error } = await supabase
      .from('block_exercises')
      .select('id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, order_index, exercise_library(name)')
      .in('block_id', blockIds)
      .order('order_index', { ascending: true });
    if (error) throw new Error(error.message);
    allExercisesData = (data ?? []) as Array<Record<string, unknown>>;
  }

  const exercisesByBlock = new Map<string, Array<Record<string, unknown>>>();
  for (const ex of allExercisesData) {
    const blockId = ex.block_id as string;
    const list = exercisesByBlock.get(blockId) ?? [];
    list.push(ex);
    exercisesByBlock.set(blockId, list);
  }

  const logsByBlockId = new Map(params.logs.map((l) => [l.blockId, l]));

  const blocks: WeekExportBlock[] = (blocksData ?? []).map((block) => {
    const parsed = BlockConceptParser.parse(block.notes);

    let dayName = block.name ?? '';
    let blockName = 'Workout Routine';
    if (dayName.includes(' | ')) {
      const parts = dayName.split(' | ');
      dayName = parts[0].trim();
      blockName = parts.slice(1).join(' | ').trim();
    }

    const exercisesData = exercisesByBlock.get(block.id) ?? [];
    const log = logsByBlockId.get(block.id);

    return {
      block_id: block.id,
      day_name: dayName,
      block_name: blockName,
      order_index: block.order_index ?? 0,
      metadata: parsed.metadata,
      coach_notes: parsed.cleanNotes,
      exercises: exercisesData.map((ex) => ({
        exercise_id: ex.exercise_id as string,
        name: (ex.exercise_library as { name?: string } | null)?.name ?? 'Unnamed exercise',
        sets: String(ex.sets ?? ''),
        reps: String(ex.reps ?? ''),
        rest_seconds: String(ex.rest_seconds ?? ''),
        hold_seconds: String(ex.hold_seconds ?? ''),
        is_weighted: !!ex.is_weighted,
      })),
      log: log
        ? {
            status: log.status,
            feel: log.feel,
            rpe: log.rpe,
            missed_reason: log.missedReason,
            missed_detail: log.missedDetail,
            session_seconds: log.sessionSeconds,
            notes: log.notes,
            sets: log.sets,
          }
        : null,
    };
  });

  return {
    exported_at: new Date().toISOString(),
    warrior: {
      id: params.warriorId,
      display_name: params.warriorDisplayName,
      strength_tier: params.warriorStrengthTier,
    },
    program: {
      template_name: params.templateName,
      week_number: params.weekNumber,
    },
    coach_week_note: params.coachWeekNote,
    bodyweight_trend: params.bodyweightTrend,
    blocks,
  };
}

/** Triggers a browser download of the payload as a .json file. */
export function downloadWeekExportPayload(payload: WeekExportPayload, fileNameHint: string): void {
  const json = JSON.stringify(payload, null, 2);
  const safeName = fileNameHint.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'week_export';
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${safeName}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
