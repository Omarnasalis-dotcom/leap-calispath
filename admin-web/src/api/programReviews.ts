import { supabase } from '@/lib/supabase';

export interface ProgramReviewRow {
  id: string;
  user_id: string;
  week_number: number;
  satisfaction: number;
  note: string | null;
  status: 'open' | 'closed' | 'cancelled';
  outcome: 'accurate' | 'changed' | null;
  requested_at: string;
  closed_at: string | null;
  reverted_at: string | null;
  reviewer_rating: number | null;
  display_name: string | null;
  language: string | null;
  subscription_tier: string | null;
  program_name: string;
  change_count: number;
}

export interface ReviewExercise {
  block_exercise_id: string;
  name: string;
  exercise_id: string;
  sets: number;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  notes: string | null;
}

export interface ReviewBlock {
  block_id: string;
  name: string;
  structure: string | null;
  timing: string | null;
  /** What this block type can change, with a missing one as null. */
  settings: Record<string, string | number | null>;
  logged: boolean;
  exercises: ReviewExercise[];
}

export interface ProgramReviewDetail {
  id: string;
  user_id: string;
  week_number: number;
  satisfaction: number;
  note: string | null;
  status: 'open' | 'closed' | 'cancelled';
  outcome: 'accurate' | 'changed' | null;
  requested_at: string;
  closed_at: string | null;
  reverted_at: string | null;
  revert_skipped: number | null;
  reviewer_rating: number | null;
  reviewer_issues: string[];
  reviewer_message: string | null;
  program_name: string;
  current_week: number;
  athlete: {
    display_name: string | null;
    language: string | null;
    subscription_tier: string | null;
    strength_tier: number | null;
    primary_goal: string | null;
    goals: string[] | null;
    goal_other_text: string | null;
    training_days_per_week: number | null;
    available_equipment: string[] | null;
    power_pbs: Record<string, unknown> | null;
    best_times: Record<string, unknown> | null;
  };
  week: ReviewBlock[];
  changes: Array<{
    id: string;
    kind: 'exercise' | 'settings';
    block_exercise_id: string;
    block_name: string | null;
    exercise_before: string | null;
    exercise_after: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    reason: string;
  }>;
}

export interface ReviewEdit {
  exercise_id: string;
  sets: number;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  notes: string | null;
  reason: string;
}

// The server's bare codes, as the reviewer should read them.
const ERRORS: Record<string, string> = {
  STALE: 'The athlete or AI Coach changed this since you opened it. The page has been refreshed: check it and try again.',
  BLOCK_LOGGED: 'This block is logged, so it stays as it is.',
  ROUND_BLOCK_SETS: 'Sets stay as they are in a superset, circuit or ladder: rounds belong to the block.',
  NO_BLOCK_SETTINGS: 'This block has no settings of its own to change.',
  LADDER_TOO_LONG: 'A ladder going down would reach 0 reps: lower the rounds or the step, or raise the start.',
  REASON_REQUIRED: 'Choose or write a reason.',
  INVALID_VALUES: 'One of the numbers is out of range.',
  REVIEW_CLOSED: 'This review is already closed.',
  PROGRAM_ENDED: 'The athlete has ended this program.',
  NOT_IN_REVIEW: 'This exercise is not in the week under review.',
  INVALID_RATING: 'Rate the program from 1 to 5.',
};
const friendly = (message: string) => new Error(ERRORS[message] ?? message);

export async function fetchProgramReviews(status: 'open' | 'closed' | 'cancelled'): Promise<ProgramReviewRow[]> {
  const { data, error } = await supabase.rpc('admin_list_program_reviews', { p_status: status });
  if (error) throw friendly(error.message);
  return (data ?? []) as ProgramReviewRow[];
}

export async function fetchProgramReview(id: string): Promise<ProgramReviewDetail> {
  const { data, error } = await supabase.rpc('admin_get_program_review', { p_review_id: id });
  if (error) throw friendly(error.message);
  return data as ProgramReviewDetail;
}

export async function updateReviewExercise(reviewId: string, exercise: ReviewExercise, edit: ReviewEdit): Promise<void> {
  const { error } = await supabase.rpc('admin_update_review_exercise', {
    p_review_id: reviewId,
    p_block_exercise_id: exercise.block_exercise_id,
    // The row as loaded, so a newer change is never overwritten.
    p_expected: {
      exercise_id: exercise.exercise_id,
      sets: exercise.sets,
      reps: exercise.reps,
      rest_seconds: exercise.rest_seconds,
      hold_seconds: exercise.hold_seconds,
      notes: exercise.notes,
    },
    p_exercise_id: edit.exercise_id,
    p_sets: edit.sets,
    p_reps: edit.reps,
    p_rest_seconds: edit.rest_seconds,
    p_hold_seconds: edit.hold_seconds,
    p_notes: edit.notes,
    p_reason: edit.reason,
  });
  if (error) throw friendly(error.message);
}

export async function updateReviewBlock(
  reviewId: string,
  block: ReviewBlock,
  settings: Record<string, string>,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_review_block', {
    p_review_id: reviewId,
    p_block_id: block.block_id,
    p_expected: block.settings,
    p_settings: settings,
    p_reason: reason,
  });
  if (error) throw friendly(error.message);
}

export async function closeProgramReview(id: string, rating: number, issues: string[], message: string): Promise<void> {
  const { error } = await supabase.rpc('admin_close_program_review', {
    p_review_id: id,
    p_rating: rating,
    p_issues: issues,
    p_message: message.trim() || null,
  });
  if (error) throw friendly(error.message);
  // The result is saved either way; a failed push only means no phone alert.
  supabase.functions.invoke('notify-program-review', { body: { review_id: id } }).catch(() => {});
}
