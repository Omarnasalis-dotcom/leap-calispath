import { supabase } from './supabase';

// The athlete's coaching reviews: a 6-week check-in (mood + progress) and an
// end-of-package review (stars, continue, recommend), asked by push and by a
// card on the Journey tab. Server: 20261114100000_coaching_reviews.sql.

export type ReviewKind = 'checkin' | 'final';
export type Progress = 'not_yet' | 'little' | 'clear';
export type ContinueChoice = 'yes' | 'break' | 'no';

export interface OpenCoachingReview {
  id: string;
  kind: ReviewKind;
  coach_name: string;
  ends_on: string;
  /** For the end-of-package recap. */
  weeks: number;
  workouts: number;
}

/** The open review (a given one, or the latest), or null when there's none. */
export async function getMyCoachingReview(reviewId?: string | null): Promise<OpenCoachingReview | null> {
  const { data, error } = await supabase.rpc('get_my_coaching_review', { p_review_id: reviewId ?? null });
  if (error) throw error;
  return (data as OpenCoachingReview | null) ?? null;
}

export type ReviewAnswers =
  | { kind: 'checkin'; mood: number; progress: Progress; comment: string }
  | { kind: 'final'; rating: number; continueChoice: ContinueChoice; recommend: number; comment: string };

export async function submitCoachingReview(reviewId: string, answers: ReviewAnswers): Promise<void> {
  const comment = answers.comment.trim() || null;
  const { error } = await supabase.rpc(
    'submit_coaching_review',
    answers.kind === 'checkin'
      ? { p_review_id: reviewId, p_mood: answers.mood, p_progress: answers.progress, p_comment: comment }
      : {
          p_review_id: reviewId,
          p_rating: answers.rating,
          p_continue: answers.continueChoice,
          p_recommend: answers.recommend,
          p_comment: comment,
        },
  );
  if (error) throw error;
}

/** Both answers given? (the comment is optional) */
export function isComplete(kind: ReviewKind, a: { mood: number | null; progress: Progress | null; rating: number | null; continueChoice: ContinueChoice | null; recommend: number | null }): boolean {
  return kind === 'checkin'
    ? a.mood != null && a.progress != null
    : a.rating != null && a.continueChoice != null && a.recommend != null;
}
