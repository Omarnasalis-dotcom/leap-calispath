import { ltr, t } from '../i18n';
import { supabase } from './supabase';

export const AI_COACH_PROFILE_ID = '00000000-0000-0000-0000-000000000002';

/** The fields a Leap team edit can change. */
export interface ReviewRowValues {
  exercise_id?: string;
  sets?: number | null;
  reps?: number | null;
  rest_seconds?: number | null;
  hold_seconds?: number | null;
  notes?: string | null;
}

/** A block's own settings: rounds, rest between rounds, caps, Tabata, ladder. */
type BlockSettingValues = { [K in (typeof BLOCK_SETTINGS)[number]]?: string | number | null };

const BLOCK_SETTINGS = [
  'rounds', 'rest_after_round', 'time_cap_min', 'tabata_work_seconds', 'tabata_rest_seconds',
  'tabata_rounds', 'ladder_start', 'ladder_sub', 'ladder_direction',
] as const;

export interface ProgramReviewChange {
  /** Absent means one exercise. */
  kind?: 'exercise' | 'settings' | 'structure';
  block_name: string | null;
  exercise_before: string | null;
  exercise_after: string | null;
  before: (ReviewRowValues & BlockSettingValues) | null;
  after: (ReviewRowValues & BlockSettingValues) | null;
  /** What was done, for a change to the block's shape. */
  detail?: { op: string; exercise?: string; to?: string; timing?: string; structure?: string; weighted?: boolean } | null;
  reason: string;
}

export interface ProgramReview {
  id: string;
  week_number: number;
  status: 'open' | 'closed';
  outcome: 'accurate' | 'changed' | null;
  message: string | null;
  requested_at: string;
  closed_at: string | null;
  seen_at: string | null;
  reverted_at: string | null;
  revert_skipped: number | null;
  can_revert: boolean;
  changes: ProgramReviewChange[];
}

export async function getMyProgramReviews(warriorProgramId: string): Promise<ProgramReview[]> {
  const { data, error } = await supabase.rpc('get_my_program_reviews', { p_warrior_program_id: warriorProgramId });
  if (error) throw error;
  return (data as ProgramReview[]) ?? [];
}

export const reviewForWeek = (reviews: ProgramReview[], week: number) =>
  reviews.find(r => r.week_number === week) ?? null;

/** Throws the server's code; the push is sent separately and never fails this. */
export async function requestProgramReview(warriorProgramId: string, week: number, satisfaction: number, note: string): Promise<void> {
  const { data, error } = await supabase.rpc('request_program_review', {
    p_warrior_program_id: warriorProgramId,
    p_week_number: week,
    p_satisfaction: satisfaction,
    p_note: note.trim() || null,
  });
  if (error) throw error;
  supabase.functions.invoke('notify-program-review', { body: { review_id: data } }).catch(() => {});
}

export async function markProgramReviewSeen(reviewId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_program_review_seen', { p_review_id: reviewId });
  if (error) throw error;
}

export async function revertProgramReview(reviewId: string): Promise<{ reverted: number; skipped: number }> {
  const { data, error } = await supabase.rpc('revert_program_review', { p_review_id: reviewId });
  if (error) throw error;
  return data as { reverted: number; skipped: number };
}

const ERRORS = new Set(['REVIEW_OPEN', 'WEEK_REVIEWED', 'REVIEW_LIMIT', 'NOT_ELIGIBLE', 'PRO_REQUIRED']);

export function programReviewError(err: unknown): string {
  const code = (err as { message?: string } | null)?.message ?? '';
  return ERRORS.has(code) ? t(`programReview.err${code}` as 'programReview.errREVIEW_OPEN') : t('programReview.errDefault');
}

const dose = (v: ReviewRowValues) => {
  if (v.hold_seconds) return `${v.sets ?? 1}×${v.hold_seconds}s`;
  return `${v.sets ?? 1}×${v.reps ?? 0}`;
};

const blockType = (timing?: string, structure?: string) =>
  t(`programReview.type_${timing && timing !== 'straight_set' ? timing : structure ?? 'single'}` as 'programReview.type_single');

function structureLine(change: ProgramReviewChange): string {
  const d = change.detail;
  const block = ltr(change.block_name ?? '');
  const exercise = ltr(d?.exercise ?? '');
  switch (d?.op) {
    case 'add_exercise': return t('programReview.op_add_exercise', { block, exercise });
    case 'remove_exercise': return t('programReview.op_remove_exercise', { block, exercise });
    case 'move_exercise': return t('programReview.op_move_exercise', { block, exercise });
    case 'set_weighted': return t(d.weighted ? 'programReview.op_weighted_on' : 'programReview.op_weighted_off', { block, exercise });
    case 'rename_block': return t('programReview.op_rename_block', { block, to: ltr(d.to ?? '') });
    case 'set_block_note': return t('programReview.op_set_block_note', { block });
    case 'change_type': return t('programReview.op_change_type', { block, type: blockType(d.timing, d.structure) });
    case 'move_block': return t('programReview.op_move_block', { block });
    case 'delete_block': return t('programReview.op_delete_block', { block });
    case 'add_block': return t('programReview.op_add_block', { block, exercise });
    default: return block;
  }
}

/** One line, like "Pull Ups 5×8 → 4×6" or "Pull Ups 5×8 → Ring Rows 4×6". */
export function reviewChangeLine(change: ProgramReviewChange): string {
  if (change.kind === 'structure') return structureLine(change);
  const before = change.before ?? {};
  const after = change.after ?? {};
  const { exercise_before: from, exercise_after: to } = change;
  if (change.kind && change.kind !== 'exercise') {
    const shown = (v: string | number | null | undefined) =>
      v === 'up' || v === 'down' ? t(`programReview.dir_${v}`) : v ?? t('programReview.none');
    const parts = BLOCK_SETTINGS
      .filter(key => String(before[key] ?? '') !== String(after[key] ?? ''))
      .map(key => t(`programReview.set_${key}`, { from: shown(before[key]), to: shown(after[key]) }));
    return `${ltr(change.block_name ?? '')}: ${parts.join(' · ')}`;
  }
  const swapped = from !== to;
  const doseChanged = dose(before) !== dose(after);
  const main = swapped
    ? `${from} ${dose(before)} → ${to} ${dose(after)}`
    : doseChanged ? `${from} ${dose(before)} → ${dose(after)}` : `${from}`;
  const rest = before.rest_seconds !== after.rest_seconds
    ? ` · ${t('programReview.rest', { from: before.rest_seconds ?? 0, to: after.rest_seconds ?? 0 })}`
    : '';
  return `${ltr(main)}${rest}`;
}

const REASONS = new Set(['too_hard', 'too_easy', 'volume', 'rest', 'safer', 'equipment', 'goal']);

/** A preset reads in the athlete's language; anything else is as the reviewer wrote it. */
export const reviewReasonText = (reason: string) =>
  REASONS.has(reason) ? t(`programReview.reason_${reason}` as 'programReview.reason_too_hard') : reason;

/** The athlete's active AI Coach program, for the button on the ready card. */
export async function getActiveAiProgram(userId: string): Promise<{ id: string; week: number } | null> {
  const { data, error } = await supabase
    .from('warrior_programs')
    .select('id, coach_id, current_week')
    .eq('warrior_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data || data.coach_id !== AI_COACH_PROFILE_ID) return null;
  return { id: data.id, week: data.current_week ?? 1 };
}
