// Adapted from src/lib/ProgramExportBuilder.ts — same payload shape and
// query logic (kept in sync manually), trimmed of the native (expo-file-system
// / expo-sharing) branch since admin-web only ever runs in a browser.
import { supabase } from '@/lib/supabase';
import { fetchAllRows, fetchByIds } from '@/lib/fetchAll';
import { BlockConceptParser, type ConceptMetadata } from './BlockConceptParser';
import { isTestKind } from './testItems';

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
  /** Test blocks only (metadata.test_kind). */
  test_result?: ExportTestResult;
}

// Coach Test Week result of one test block, read-only like `log` (import
// ignores it). From program_test_results (written only by
// submit_program_test_item); docs/features/test-day-format.md.
export interface ExportTestResult {
  /** null: not logged yet. */
  status: 'done' | 'skipped' | null;
  value: number | null;
  unit: 'reps' | 'kg' | 'seconds' | null;
  /** The world movement tested; for a max hold, the progression picked. */
  movement_id: string | null;
  skip_reason: 'cant_do' | 'injury' | 'no_equipment' | 'no_time' | 'other' | null;
  skip_detail: string | null;
  /** The athlete's note on the item. */
  note: string | null;
  is_new_pb: boolean;
  /** Equal to the athlete's world best before this result. */
  is_matched_pb: boolean;
  world_status: 'saved' | 'locked' | 'no_world' | 'none' | null;
  coach_grade: 'pass' | 'needs_work' | null;
  coach_note: string | null;
  /** The athlete's last done result of the same test kind + movement before
   * this one, in any program (admin-web TestsPanel's previousOf). For an item
   * not logged yet: the latest one (a max hold needs the progression, so
   * none). */
  previous: {
    value: number;
    unit: 'reps' | 'kg' | 'seconds' | null;
    week_number: number;
    logged_at: string;
    same_program: boolean;
  } | null;
}

/** program_test_results row, as much of it as the export reads. */
export interface ExportTestResultRow {
  id: string;
  warrior_program_id: string | null;
  block_id: string | null;
  week_number: number;
  test_kind: string;
  movement_id: string | null;
  status: 'done' | 'skipped';
  value: number | string | null;
  unit: 'reps' | 'kg' | 'seconds' | null;
  skip_reason: ExportTestResult['skip_reason'];
  skip_detail: string | null;
  note?: string | null;
  is_new_pb: boolean;
  is_matched_pb?: boolean;
  world_status: 'saved' | 'locked' | 'no_world' | 'none';
  coach_grade: 'pass' | 'needs_work' | null;
  coach_note: string | null;
  created_at: string;
}

/** The test_result of one test block. `results` = every result row of the
 * athlete (any program). Pure; exported for tests. */
export function buildExportTestResult(
  warriorProgramId: string,
  blockId: string,
  metadata: { test_kind?: string; test_movement?: string },
  results: ExportTestResultRow[],
): ExportTestResult {
  const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v));
  const r = results.find((x) => x.warrior_program_id === warriorProgramId && x.block_id === blockId) ?? null;
  const kind = r?.test_kind ?? metadata.test_kind;
  const movement = r ? r.movement_id : metadata.test_movement || null;
  let prev: ExportTestResultRow | null = null;
  for (const x of results) {
    if (x === r || x.status !== 'done' || num(x.value) == null) continue;
    if (x.test_kind !== kind || x.movement_id !== movement) continue;
    if (r && x.created_at >= r.created_at) continue;
    if (!prev || x.created_at > prev.created_at) prev = x;
  }
  return {
    status: r?.status ?? null,
    value: num(r?.value),
    unit: r?.unit ?? null,
    movement_id: r?.movement_id ?? null,
    skip_reason: r?.skip_reason ?? null,
    skip_detail: r?.skip_detail ?? null,
    note: r?.note ?? null,
    is_new_pb: !!r?.is_new_pb,
    is_matched_pb: !!r?.is_matched_pb,
    world_status: r?.world_status ?? null,
    coach_grade: r?.coach_grade ?? null,
    coach_note: r?.coach_note ?? null,
    previous: prev
      ? {
          value: num(prev.value) as number,
          unit: prev.unit,
          week_number: prev.week_number,
          logged_at: prev.created_at,
          same_program: prev.warrior_program_id === warriorProgramId,
        }
      : null,
  };
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
  /** The client's warrior_programs row (test results are keyed by it). */
  warriorProgramId: string;
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
  const blocksData = await fetchAllRows<{ id: string; name: string | null; notes: string | null; order_index: number | null }>((from, to) =>
    supabase
      .from('program_blocks')
      .select('id, name, notes, order_index')
      .eq('template_id', params.templateId)
      .eq('week_number', params.weekNumber)
      .order('order_index', { ascending: true })
      .order('id')
      .range(from, to),
  );

  const allExercisesData = await fetchByIds<Record<string, unknown>>(blocksData.map((b) => b.id), (chunk, from, to) =>
    supabase
      .from('block_exercises')
      .select('id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, order_index, exercise_library(name)')
      .in('block_id', chunk)
      .order('order_index', { ascending: true })
      .order('id')
      .range(from, to),
  );

  const exercisesByBlock = new Map<string, Array<Record<string, unknown>>>();
  for (const ex of allExercisesData) {
    const blockId = ex.block_id as string;
    const list = exercisesByBlock.get(blockId) ?? [];
    list.push(ex);
    exercisesByBlock.set(blockId, list);
  }

  const logsByBlockId = new Map(params.logs.map((l) => [l.blockId, l]));

  // Every test result of this athlete, any program (a previous result can
  // come from an earlier program). Only fetched when the week has test blocks.
  const hasTestBlocks = blocksData.some((b) => isTestKind(BlockConceptParser.parse(b.notes).metadata.test_kind));
  const testResults =
    hasTestBlocks && params.warriorId
      ? await fetchAllRows<ExportTestResultRow>((from, to) =>
          supabase
            .from('program_test_results')
            .select('*')
            .eq('warrior_id', params.warriorId)
            .order('created_at', { ascending: true })
            .order('id')
            .range(from, to),
        )
      : [];

  const blocks: WeekExportBlock[] = blocksData.map((block) => {
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
      ...(isTestKind(parsed.metadata.test_kind)
        ? { test_result: buildExportTestResult(params.warriorProgramId, block.id, parsed.metadata, testResults) }
        : {}),
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
