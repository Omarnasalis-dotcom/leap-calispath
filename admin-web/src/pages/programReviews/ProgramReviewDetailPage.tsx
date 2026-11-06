import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeProgramReview,
  fetchProgramReview,
  updateReviewExercise,
  type ProgramReviewDetail,
  type ReviewBlock,
  type ReviewExercise,
} from '@/api/programReviews';
import { fetchExercises, type Exercise } from '@/api/coaching';
import { formatDateTime } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';

// Keys the app shows in the athlete's language.
const REASONS: Array<[string, string]> = [
  ['too_hard', 'Too hard for their current max'],
  ['too_easy', 'Too easy for their current max'],
  ['volume', 'Too much volume for one session'],
  ['rest', 'Better rest for this exercise'],
  ['safer', 'A safer option'],
  ['equipment', 'Better fit for their equipment'],
  ['goal', 'Better fit for their goal'],
];
const ISSUES = ['Too hard', 'Too easy', 'Too much volume', 'Wrong exercise', 'Equipment mismatch', 'Goal mismatch', 'Poor structure'];
const ROUND_STRUCTURES = new Set(['superset', 'circuit', 'ladder']);

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

function ExerciseEditor({ reviewId, block, exercise, exercises }: {
  reviewId: string;
  block: ReviewBlock;
  exercise: ReviewExercise;
  exercises: Exercise[];
}) {
  const queryClient = useQueryClient();
  const [exerciseId, setExerciseId] = useState(exercise.exercise_id);
  const [sets, setSets] = useState(String(exercise.sets ?? ''));
  const [reps, setReps] = useState(String(exercise.reps ?? ''));
  const [hold, setHold] = useState(String(exercise.hold_seconds ?? ''));
  const [rest, setRest] = useState(String(exercise.rest_seconds ?? ''));
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const dirty = exerciseId !== exercise.exercise_id
    || sets !== String(exercise.sets ?? '')
    || reps !== String(exercise.reps ?? '')
    || hold !== String(exercise.hold_seconds ?? '')
    || rest !== String(exercise.rest_seconds ?? '')
    || notes !== (exercise.notes ?? '');

  const save = useMutation({
    mutationFn: () => updateReviewExercise(reviewId, exercise, {
      exercise_id: exerciseId,
      sets: Number(sets),
      reps: numberOrNull(reps),
      hold_seconds: numberOrNull(hold),
      rest_seconds: numberOrNull(rest),
      notes: notes.trim() || null,
      reason: reason === 'custom' ? customReason : reason,
    }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['program-review', reviewId] }),
  });

  const roundBlock = ROUND_STRUCTURES.has(block.structure ?? '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderTop: '1px solid var(--hairline)' }}>
      <select className="field" aria-label="Exercise" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} disabled={block.logged}>
        {exercises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <div className="row" style={{ gap: 6 }}>
        <label className="label">Sets<input className="field" type="number" min={1} value={sets} onChange={(e) => setSets(e.target.value)} disabled={block.logged || roundBlock} title={roundBlock ? 'Rounds belong to the block' : undefined} /></label>
        <label className="label">Reps<input className="field" type="number" min={0} value={reps} onChange={(e) => setReps(e.target.value)} disabled={block.logged} /></label>
        <label className="label">Hold (s)<input className="field" type="number" min={0} value={hold} onChange={(e) => setHold(e.target.value)} disabled={block.logged} /></label>
        <label className="label">Rest (s)<input className="field" type="number" min={0} value={rest} onChange={(e) => setRest(e.target.value)} disabled={block.logged} /></label>
      </div>
      <input className="field" aria-label="Notes" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={block.logged} />
      {dirty && (
        <div className="row" style={{ gap: 6 }}>
          <select className="field" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }}>
            <option value="">Reason shown to the athlete…</option>
            {REASONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            <option value="custom">Write my own…</option>
          </select>
          {reason === 'custom' && (
            <input className="field" maxLength={300} placeholder="In the athlete's language" value={customReason} onChange={(e) => setCustomReason(e.target.value)} style={{ flex: 1 }} />
          )}
          <button
            className="btn small"
            disabled={save.isPending || !reason || (reason === 'custom' && !customReason.trim()) || !sets}
            onClick={() => save.mutate()}
          >
            Save change
          </button>
        </div>
      )}
      {save.error && <ErrorNote error={save.error} />}
    </div>
  );
}

function CloseForm({ review }: { review: ProgramReviewDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const close = useMutation({
    mutationFn: () => closeProgramReview(review.id, rating, issues, message),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['program-reviews'] });
      navigate('/program-reviews');
    },
  });

  const changed = review.changes.length > 0;
  return (
    <section className="panel">
      <div className="panel-head"><span className="label">Close the review</span></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13 }}>
          {changed
            ? `The athlete will see ${review.changes.length} change(s) and can revert all of them.`
            : 'No changes: the athlete will see that their program is accurate.'}
        </div>
        <label className="label">
          How good was the AI Coach's week? Private, never shown to the athlete.
          <select className="field" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            <option value={0}>Rate 1 to 5…</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="row" style={{ gap: 10 }}>
          {ISSUES.map((issue) => (
            <label key={issue} className="row" style={{ gap: 4, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={issues.includes(issue)}
                onChange={(e) => setIssues(e.target.checked ? [...issues, issue] : issues.filter((x) => x !== issue))}
              />
              {issue}
            </label>
          ))}
        </div>
        <textarea
          className="field"
          maxLength={500}
          rows={3}
          placeholder={`Optional message to the athlete, in ${review.athlete.language === 'ar' ? 'Arabic' : 'English'}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {close.error && <ErrorNote error={close.error} />}
        <button className="btn" disabled={!rating || close.isPending} onClick={() => close.mutate()}>
          Close and tell the athlete
        </button>
      </div>
    </section>
  );
}

export function ProgramReviewDetailPage() {
  const { id = '' } = useParams();
  const reviewQ = useQuery({ queryKey: ['program-review', id], queryFn: () => fetchProgramReview(id) });
  const exercisesQ = useQuery({ queryKey: ['exercises'], queryFn: fetchExercises });

  const review = reviewQ.data;
  if (reviewQ.error) return <div className="page"><ErrorNote error={reviewQ.error} /></div>;
  if (!review || !exercisesQ.data) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;

  const editable = review.status === 'open';
  const { athlete } = review;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{athlete.display_name || 'Athlete'}: week {review.week_number}</h1>
          <div className="sub">
            {review.program_name} · asked {formatDateTime(review.requested_at)} · <Link to={`/users/${review.user_id}`}>View user</Link>
          </div>
        </div>
        <Badge tone={editable ? 'warn' : 'ok'}>{review.status}</Badge>
      </div>

      <section className="panel">
        <div className="panel-head"><span className="label">What they said</span></div>
        <div className="panel-body" style={{ fontSize: 13 }}>
          <div>Satisfied: {review.satisfaction} / 5</div>
          <div>{review.note || <span className="dim">No note</span>}</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><span className="label">Athlete</span></div>
        <div className="panel-body" style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>Plan: {athlete.subscription_tier ?? 'none'} · Strength tier: {athlete.strength_tier ?? 0} · Language: {athlete.language === 'ar' ? 'Arabic' : 'English'}</div>
          <div>Goal: {[athlete.primary_goal, ...(athlete.goals ?? []), athlete.goal_other_text].filter(Boolean).join(', ') || 'Not set'}</div>
          <div>Days a week: {athlete.training_days_per_week ?? 'Not set'} · Equipment: {(athlete.available_equipment ?? []).join(', ') || 'Not set'}</div>
          <div>Power bests: {JSON.stringify(athlete.power_pbs ?? {})}</div>
        </div>
      </section>

      {review.week.map((block) => (
        <section key={block.block_id} className="panel">
          <div className="panel-head">
            <div className="row">
              <span className="label">{block.name}</span>
              {block.structure && <Badge>{block.structure}</Badge>}
              {block.logged && <Badge tone="ok">logged, locked</Badge>}
            </div>
          </div>
          <div className="panel-body">
            {block.exercises.map((exercise) => (
              <ExerciseEditor
                // A saved or refreshed row starts from what's really there.
                key={JSON.stringify(exercise)}
                reviewId={review.id}
                block={editable ? block : { ...block, logged: true }}
                exercise={exercise}
                exercises={exercisesQ.data}
              />
            ))}
          </div>
        </section>
      ))}

      {review.changes.length > 0 && (
        <section className="panel">
          <div className="panel-head"><span className="label">Changes so far</span></div>
          <div className="panel-body" style={{ fontSize: 13 }}>
            {review.changes.map((change) => (
              <div key={change.id}>
                {change.block_name}: {change.exercise_before}
                {change.exercise_after !== change.exercise_before ? ` → ${change.exercise_after}` : ''}
                {` ${change.before.sets}×${change.before.reps ?? change.before.hold_seconds} → ${change.after.sets}×${change.after.reps ?? change.after.hold_seconds}`}
                <span className="dim"> ({change.reason})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {editable ? <CloseForm review={review} /> : (
        <section className="panel">
          <div className="panel-body" style={{ fontSize: 13 }}>
            Closed as {review.outcome} {review.reviewer_rating != null ? `· rated ${review.reviewer_rating}/5` : ''}
            {review.reverted_at && ` · athlete reverted ${formatDateTime(review.reverted_at)}${review.revert_skipped ? ` (${review.revert_skipped} kept)` : ''}`}
          </div>
        </section>
      )}
    </div>
  );
}
