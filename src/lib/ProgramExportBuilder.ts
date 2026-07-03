import { Platform } from 'react-native';
import { supabase } from './supabase';
import { BlockConceptParser } from './BlockConceptParser';

export interface ExportSetLog {
  set_index: number;
  reps_completed: number | null;
  weight_used: number | null;
  hold_seconds: number | null;
  exercise_name: string | null;
}

// Mirrors the shape a coach's own log-history view already carries (see
// ProgressTrackingScreen's WorkoutLogHistory) — kept as a separate input
// type so this module doesn't depend on screen-local state shapes.
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
  metadata: Record<string, any>;
  coach_notes: string;
  exercises: {
    exercise_id: string;
    name: string;
    sets: string;
    reps: string;
    rest_seconds: string;
    hold_seconds: string;
    is_weighted: boolean;
  }[];
  // The warrior's actual result for this block this week — null if it was
  // never logged (still worth including the prescribed structure above so
  // an external tool can see what was skipped entirely, not just what ran).
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

// Pulls the prescribed program structure for one week (program_blocks +
// block_exercises + exercise_library, same query shape useProgramBuilder
// already uses so the two stay consistent) and merges in the warrior's
// actual logged result per block, into one JSON payload.
export async function fetchWeekExportPayload(params: FetchWeekExportParams): Promise<WeekExportPayload> {
  const { data: blocksData, error: blocksError } = await supabase
    .from('program_blocks')
    .select('id, name, notes, order_index')
    .eq('template_id', params.templateId)
    .eq('week_number', params.weekNumber)
    .order('order_index', { ascending: true });
  if (blocksError) throw blocksError;

  const blockIds = (blocksData || []).map(b => b.id);
  let allExercisesData: any[] = [];
  if (blockIds.length > 0) {
    const { data, error } = await supabase
      .from('block_exercises')
      .select(`
        id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, order_index,
        exercise_library ( name )
      `)
      .in('block_id', blockIds)
      .order('order_index', { ascending: true });
    if (error) throw error;
    allExercisesData = data || [];
  }

  const exercisesByBlock: Record<string, any[]> = {};
  allExercisesData.forEach(ex => {
    if (!exercisesByBlock[ex.block_id]) exercisesByBlock[ex.block_id] = [];
    exercisesByBlock[ex.block_id].push(ex);
  });

  const logsByBlockId = new Map(params.logs.map(l => [l.blockId, l]));

  const blocks: WeekExportBlock[] = (blocksData || []).map(block => {
    const parsed = BlockConceptParser.parse(block.notes);

    let dayName = block.name || '';
    let blockName = 'WORKOUT ROUTINE';
    if (dayName.includes(' | ')) {
      const parts = dayName.split(' | ');
      dayName = parts[0].trim();
      blockName = parts.slice(1).join(' | ').trim();
    }

    const exercisesData = exercisesByBlock[block.id] || [];
    const log = logsByBlockId.get(block.id);

    return {
      block_id: block.id,
      day_name: dayName,
      block_name: blockName,
      order_index: block.order_index,
      metadata: parsed.metadata,
      coach_notes: parsed.cleanNotes,
      exercises: exercisesData.map((ex: any) => ({
        exercise_id: ex.exercise_id,
        name: ex.exercise_library?.name || 'UNNAMED EXERCISE',
        sets: String(ex.sets ?? ''),
        reps: String(ex.reps ?? ''),
        rest_seconds: String(ex.rest_seconds ?? ''),
        hold_seconds: String(ex.hold_seconds ?? ''),
        is_weighted: !!ex.is_weighted,
      })),
      log: log ? {
        status: log.status,
        feel: log.feel,
        rpe: log.rpe,
        missed_reason: log.missedReason,
        missed_detail: log.missedDetail,
        session_seconds: log.sessionSeconds,
        notes: log.notes,
        sets: log.sets,
      } : null,
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

// Writes the payload to a .json file and opens the share sheet — same
// web/native split already proven in ExerciseLibraryScreen's CSV export.
export async function shareWeekExportPayload(payload: WeekExportPayload, fileNameHint: string): Promise<void> {
  const json = JSON.stringify(payload, null, 2);
  const safeName = fileNameHint.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'week_export';

  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeName}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const FileSystem = require('expo-file-system/legacy');
  const Sharing = require('expo-sharing');
  const fileUri = FileSystem.documentDirectory + `${safeName}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json, { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Export Week' });
  }
}
