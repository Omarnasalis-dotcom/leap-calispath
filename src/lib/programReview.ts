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
  /** A superset or circuit's rounds, as text like the block's own. */
  rounds?: string;
}

export interface ProgramReviewChange {
  /** Absent means one exercise. */
  kind?: 'exercise' | 'rounds';
  block_name: string | null;
  exercise_before: string | null;
  exercise_after: string | null;
  before: ReviewRowValues;
  after: ReviewRowValues;
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

/** One line, like "Pull Ups 5×8 → 4×6" or "Pull Ups 5×8 → Ring Rows 4×6". */
export function reviewChangeLine(change: ProgramReviewChange): string {
  const { before, after, exercise_before: from, exercise_after: to } = change;
  if (change.kind === 'rounds') {
    return t('programReview.rounds', { block: ltr(change.block_name ?? ''), from: before.rounds, to: after.rounds });
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
