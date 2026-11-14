import { useQuery } from '@tanstack/react-query';
import { fetchCoachingReviews, type CoachingReview } from '@/api/coaching';
import { ErrorNote } from '@/components/bits';
import { formatDate } from '@/shared/constants';

// The athlete's answers: the 6-week check-in (mood + seeing progress) and the
// end-of-package review (stars, continue, recommend), each with an optional
// comment. Sent by the hourly job; answered in the app.

export const MOOD_FACE = ['', '😫', '😕', '😐', '🙂', '🤩'] as const;
export const MOOD_WORD = ['', 'awful', 'not great', 'okay', 'good', 'great'] as const;
export const PROGRESS_LABEL = { not_yet: 'No progress yet', little: 'A little progress', clear: 'Clear progress' } as const;
export const CONTINUE_LABEL = { yes: 'Wants to continue', break: 'Wants a break', no: 'Not continuing' } as const;

/** A sad face, "not seeing progress yet", 1-2 stars or 0-6 on recommend: worth a look. */
export const isLow = (r: { mood: number | null; progress?: string | null; rating: number | null; recommend: number | null }) =>
  (r.mood != null && r.mood <= 2) ||
  r.progress === 'not_yet' ||
  (r.rating != null && r.rating <= 2) ||
  (r.recommend != null && r.recommend <= 6);

function Answer({ r }: { r: CoachingReview }) {
  if (!r.answered_at) {
    return <span className="rv-waiting">Sent {formatDate(r.sent_at)} · not answered yet</span>;
  }
  if (r.kind === 'checkin') {
    return (
      <span className="rv-answers">
        <span className="rv-face" role="img" aria-label={MOOD_WORD[r.mood ?? 0]}>
          {MOOD_FACE[r.mood ?? 0]}
        </span>
        <span>Feeling {MOOD_WORD[r.mood ?? 0]}</span>
        {r.progress && <span className={`rv-chip${r.progress === 'not_yet' ? ' no' : r.progress === 'clear' ? ' yes' : ''}`}>{PROGRESS_LABEL[r.progress]}</span>}
      </span>
    );
  }
  return (
    <span className="rv-answers">
      <span className="rv-stars" aria-label={`${r.rating} of 5 stars`}>
        {'★'.repeat(r.rating ?? 0)}
        <span className="rv-stars-off">{'★'.repeat(5 - (r.rating ?? 0))}</span>
      </span>
      {r.continue && <span className={`rv-chip ${r.continue}`}>{CONTINUE_LABEL[r.continue]}</span>}
      {r.recommend != null && <span className="rv-chip">Recommend {r.recommend}/10</span>}
    </span>
  );
}

/** Every review this client was asked for with this coach, newest first. */
export function ReviewsPanel({ coachId, warriorId }: { coachId: string; warriorId: string }) {
  const q = useQuery({
    queryKey: ['coaching-reviews', coachId, warriorId],
    queryFn: () => fetchCoachingReviews(coachId, warriorId),
  });
  if (q.error) return <ErrorNote error={q.error} />;
  const reviews = q.data ?? [];
  if (reviews.length === 0) return null;
  return (
    <section className="pkg rv" aria-label="Client reviews">
      <span className="label">Reviews</span>
      <ul className="rv-list">
        {reviews.map((r) => (
          <li key={r.id} className={r.answered_at && isLow(r) ? 'low' : undefined}>
            <span className="rv-kind">
              {r.kind === 'checkin' ? '6-week check-in' : 'End of package'}
              {r.answered_at && <span className="pkg-dim"> · {formatDate(r.answered_at)}</span>}
            </span>
            <Answer r={r} />
            {r.comment && <span className="rv-comment">“{r.comment}”</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
