import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeProgramReview,
  fetchProgramReview,
  reviewBlockOp,
  updateReviewExercise,
  updateReviewBlock,
  type ProgramReviewDetail,
  type ReviewBlockOp,
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

const SETTING_LABELS: Record<string, string> = {
  rounds: 'Rounds (the set count for this whole block)',
  rest_after_round: 'Rest between rounds (s)',
  time_cap_min: 'Time cap (min)',
  tabata_work_seconds: 'Work (s)',
  tabata_rest_seconds: 'Rest (s)',
  tabata_rounds: 'Tabata rounds',
  ladder_start: 'Ladder start (reps)',
  ladder_sub: 'Ladder step (reps)',
  ladder_direction: 'Ladder direction',
};

const asText = (value: string | number | null | undefined) => (value == null ? '' : String(value));

/** "Weighted pull-up 40 kg · Dip 55 kg" from power_pbs ({ weighted_pullup_1rm: 40, … }). */
function formatPowerBests(pbs: Record<string, unknown> | null): string {
  const parts = Object.entries(pbs ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => {
      const name = k.replace(/_1rm$/, '').replace(/_/g, ' ');
      return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${Number(v)} kg`;
    });
  return parts.length ? parts.join(' · ') : 'None logged';
}

/** An exercise <select> with a type-to-filter box: the library has ~300
 * exercises. The chosen one always stays in the list. */
function ExerciseSelect({ value, exercises, onChange, disabled, placeholder }: {
  value: string;
  exercises: Exercise[];
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const shown = q ? exercises.filter((x) => x.id === value || x.name.toLowerCase().includes(q)) : exercises;
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <input
        className="field"
        style={{ width: 160 }}
        placeholder="Filter exercises…"
        value={filter}
        disabled={disabled}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter exercises"
      />
      <select className="field" style={{ flex: 1, minWidth: 0 }} aria-label="Exercise" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {shown.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </div>
  );
}

function ReasonPicker({ reason, customReason, onReason, onCustomReason }: {
  reason: string;
  customReason: string;
  onReason: (value: string) => void;
  onCustomReason: (value: string) => void;
}) {
  return (
    <>
      <select className="field" aria-label="Reason" value={reason} onChange={(e) => onReason(e.target.value)} style={{ flex: 1 }}>
        <option value="">Reason shown to the athlete…</option>
        {REASONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        <option value="custom">Write my own…</option>
      </select>
      {reason === 'custom' && (
        <input className="field" maxLength={300} placeholder="In the athlete's language" value={customReason} onChange={(e) => onCustomReason(e.target.value)} style={{ flex: 1 }} />
      )}
    </>
  );
}

function BlockSettingsEditor({ reviewId, block, locked }: { reviewId: string; block: ReviewBlock; locked: boolean }) {
  const queryClient = useQueryClient();
  const keys = Object.keys(SETTING_LABELS).filter((key) => key in block.settings);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(keys.map((key) => [key, asText(block.settings[key])])),
  );
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const dirty = keys.some((key) => values[key] !== asText(block.settings[key]));

  const save = useMutation({
    mutationFn: () => updateReviewBlock(reviewId, block, values, reason === 'custom' ? customReason : reason),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['program-review', reviewId] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10 }}>
      <div className="row" style={{ gap: 6 }}>
        {keys.map((key) => (
          <label key={key} className="label">
            {SETTING_LABELS[key]}
            {key === 'ladder_direction' ? (
              <select className="field" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} disabled={locked}>
                <option value="down">Down</option>
                <option value="up">Up</option>
              </select>
            ) : (
              <input
                className="field"
                type="number"
                min={0}
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                disabled={locked}
              />
            )}
          </label>
        ))}
      </div>
      {dirty && (
        <div className="row" style={{ gap: 6 }}>
          <ReasonPicker reason={reason} customReason={customReason} onReason={setReason} onCustomReason={setCustomReason} />
          <button
            className="btn small"
            disabled={save.isPending || !reason || (reason === 'custom' && !customReason.trim())}
            onClick={() => save.mutate()}
          >
            Save block settings
          </button>
        </div>
      )}
      {save.error && <ErrorNote error={save.error} />}
    </div>
  );
}

interface PendingOp {
  op: ReviewBlockOp;
  label: string;
  args?: Record<string, unknown>;
}

const TIMINGS: Array<[string, string]> = [['straight_set', 'Straight sets'], ['amrap', 'AMRAP'], ['fortime', 'For Time'], ['tabata', 'Tabata']];
const STRUCTURES: Array<[string, string]> = [['single', 'Single'], ['superset', 'Superset'], ['circuit', 'Circuit'], ['ladder', 'Ladder']];

// The block's name after "DAY | ", which is all a reviewer can change.
const blockTitle = (name: string) => name.split(' | ').slice(1).join(' | ') || name;

/** Anything that changes the block's shape: fields for the action, a reason, Apply. */
function BlockOpForm({ reviewId, block, pending, exercises, onDone }: {
  reviewId: string;
  block: ReviewBlock;
  pending: PendingOp;
  exercises: Exercise[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { op } = pending;
  const [form, setForm] = useState<Record<string, string>>({
    name: op === 'rename_block' ? blockTitle(block.name) : '',
    note: block.note ?? '',
    timing_system: block.timing ?? 'straight_set',
    structure: block.structure ?? 'single',
  });
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const set = (key: string, value: string) => setForm({ ...form, [key]: value });

  const apply = useMutation({
    mutationFn: () => {
      const numbers = Object.fromEntries(
        ['sets', 'reps', 'hold_seconds', 'rest_seconds']
          .filter((key) => form[key]?.trim())
          .map((key) => [key, Number(form[key])]),
      );
      const args: Record<string, unknown> = { ...pending.args, ...numbers };
      if (op === 'rename_block' || op === 'add_block') args.name = form.name;
      if (op === 'set_block_note') args.note = form.note;
      if (op === 'change_type') {
        args.timing_system = form.timing_system;
        args.structure = form.structure;
      }
      if (op === 'add_exercise' || op === 'add_block') args.exercise_id = form.exercise_id;
      return reviewBlockOp(reviewId, block, op, args, reason === 'custom' ? customReason : reason);
    },
    onSuccess: onDone,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['program-review', reviewId] }),
  });

  const addsExercise = op === 'add_exercise' || op === 'add_block';
  const named = op === 'rename_block' || op === 'add_block';
  const ready = !!reason
    && (reason !== 'custom' || !!customReason.trim())
    && (!addsExercise || !!form.exercise_id)
    && (!named || !!form.name?.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderTop: '1px solid var(--hairline)' }}>
      <span className="label">{pending.label}</span>
      {named && <input className="field" maxLength={60} placeholder="Block name" value={form.name} onChange={(e) => set('name', e.target.value)} />}
      {op === 'set_block_note' && <textarea className="field" rows={2} maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} />}
      {op === 'change_type' && (
        <div className="row" style={{ gap: 6 }}>
          <select className="field" aria-label="Timing" value={form.timing_system} onChange={(e) => set('timing_system', e.target.value)}>
            {TIMINGS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select className="field" aria-label="Structure" value={form.structure} onChange={(e) => set('structure', e.target.value)}>
            {STRUCTURES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <span className="dim" style={{ fontSize: 12 }}>You can fine-tune its settings after saving.</span>
        </div>
      )}
      {addsExercise && (
        <>
          <ExerciseSelect
            value={form.exercise_id ?? ''}
            exercises={exercises}
            placeholder="Choose an exercise…"
            onChange={(id) => set('exercise_id', id)}
          />
          <div className="row" style={{ gap: 6 }}>
            {[['sets', 'Sets'], ['reps', 'Reps'], ['hold_seconds', 'Hold (s)'], ['rest_seconds', 'Rest (s)']].map(([key, label]) => (
              <label key={key} className="label">{label}<input className="field" type="number" min={0} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} /></label>
            ))}
          </div>
        </>
      )}
      <div className="row" style={{ gap: 6 }}>
        <ReasonPicker reason={reason} customReason={customReason} onReason={setReason} onCustomReason={setCustomReason} />
        <button className="btn small" disabled={!ready || apply.isPending} onClick={() => apply.mutate()}>Apply</button>
        <button className="btn small ghost" onClick={onDone}>Cancel</button>
      </div>
      {apply.error && <ErrorNote error={apply.error} />}
    </div>
  );
}

function ExerciseEditor({ reviewId, block, exercise, exercises, onOp }: {
  reviewId: string;
  block: ReviewBlock;
  exercise: ReviewExercise;
  exercises: Exercise[];
  onOp: (pending: PendingOp) => void;
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
      <ExerciseSelect value={exerciseId} exercises={exercises} onChange={setExerciseId} disabled={block.logged} />
      <div className="row" style={{ gap: 6 }}>
        {!roundBlock && (
          <label className="label">Sets<input className="field" type="number" min={1} value={sets} onChange={(e) => setSets(e.target.value)} disabled={block.logged} /></label>
        )}
        <label className="label">Reps<input className="field" type="number" min={0} value={reps} onChange={(e) => setReps(e.target.value)} disabled={block.logged} /></label>
        <label className="label">Hold (s)<input className="field" type="number" min={0} value={hold} onChange={(e) => setHold(e.target.value)} disabled={block.logged} /></label>
        <label className="label">Rest (s)<input className="field" type="number" min={0} value={rest} onChange={(e) => setRest(e.target.value)} disabled={block.logged} /></label>
      </div>
      <input className="field" aria-label="Notes" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={block.logged} />
      {!block.logged && (
        <div className="row" style={{ gap: 6 }}>
          <label className="row" style={{ gap: 4, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={exercise.is_weighted}
              onChange={(e) => onOp({
                op: 'set_weighted',
                label: `${e.target.checked ? 'Set' : 'Unset'} weighted: ${exercise.name}`,
                args: { block_exercise_id: exercise.block_exercise_id, is_weighted: e.target.checked },
              })}
            />
            Weighted
          </label>
          <button className="btn small ghost" onClick={() => onOp({ op: 'move_exercise', label: `Move up: ${exercise.name}`, args: { block_exercise_id: exercise.block_exercise_id, direction: 'up' } })}>Up</button>
          <button className="btn small ghost" onClick={() => onOp({ op: 'move_exercise', label: `Move down: ${exercise.name}`, args: { block_exercise_id: exercise.block_exercise_id, direction: 'down' } })}>Down</button>
          <button className="btn small ghost" onClick={() => onOp({ op: 'remove_exercise', label: `Remove: ${exercise.name}`, args: { block_exercise_id: exercise.block_exercise_id } })}>Remove</button>
        </div>
      )}
      {dirty && (
        <div className="row" style={{ gap: 6 }}>
          <ReasonPicker reason={reason} customReason={customReason} onReason={setReason} onCustomReason={setCustomReason} />
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

function BlockCard({ reviewId, block, editable, exercises }: {
  reviewId: string;
  block: ReviewBlock;
  editable: boolean;
  exercises: Exercise[];
}) {
  const [pending, setPending] = useState<PendingOp | null>(null);
  const shown = editable ? block : { ...block, logged: true };
  const canEdit = editable && !block.logged;
  const tools: Array<[string, PendingOp]> = [
    ['Rename', { op: 'rename_block', label: 'Rename this block' }],
    ['Block note', { op: 'set_block_note', label: 'Block note' }],
    ['Change type', { op: 'change_type', label: 'Change the block type' }],
    ['Add exercise', { op: 'add_exercise', label: 'Add an exercise' }],
    ['Add block after', { op: 'add_block', label: 'Add a block after this one, in the same day' }],
    ['Move up', { op: 'move_block', label: 'Move this block up', args: { direction: 'up' } }],
    ['Move down', { op: 'move_block', label: 'Move this block down', args: { direction: 'down' } }],
    ['Delete', { op: 'delete_block', label: 'Delete this block and its exercises. Revert brings it back.' }],
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="row">
          <span className="label">{block.name}</span>
          {block.structure && <Badge>{block.structure}</Badge>}
          {block.timing && block.timing !== 'straight_set' && <Badge>{block.timing}</Badge>}
          {block.logged && <Badge tone="ok">logged, locked</Badge>}
        </div>
      </div>
      <div className="panel-body">
        {canEdit && (
          <div className="row" style={{ gap: 6, paddingBottom: 10 }}>
            {tools.map(([label, op]) => (
              <button key={label} className="btn small ghost" onClick={() => setPending(op)}>{label}</button>
            ))}
          </div>
        )}
        {pending && (
          <BlockOpForm
            key={`${pending.op}${JSON.stringify(pending.args)}`}
            reviewId={reviewId}
            block={block}
            pending={pending}
            exercises={exercises}
            onDone={() => setPending(null)}
          />
        )}
        {block.note && <div className="dim" style={{ fontSize: 13, paddingBottom: 8 }}>{block.note}</div>}
        {Object.keys(block.settings).length > 0 && (
          <BlockSettingsEditor
            // A saved or refreshed block starts from what's really there.
            key={JSON.stringify(block.settings)}
            reviewId={reviewId}
            block={block}
            locked={!canEdit}
          />
        )}
        {block.exercises.map((exercise) => (
          <ExerciseEditor
            key={JSON.stringify(exercise)}
            reviewId={reviewId}
            block={shown}
            exercise={exercise}
            exercises={exercises}
            onOp={setPending}
          />
        ))}
      </div>
    </section>
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
          <div>Power bests: {formatPowerBests(athlete.power_pbs)}</div>
        </div>
      </section>

      {review.week.map((block, i) => {
        // Blocks arrive in program order, named "<Day> | <Block>": a heading
        // whenever the day changes.
        const day = block.name.split(' | ')[0];
        const prevDay = i > 0 ? review.week[i - 1].name.split(' | ')[0] : null;
        return (
          <div key={block.block_id} style={{ display: 'contents' }}>
            {day !== prevDay && <h2 style={{ margin: '8px 0 0' }}>{day}</h2>}
            <BlockCard reviewId={review.id} block={block} editable={editable} exercises={exercisesQ.data} />
          </div>
        );
      })}

      {review.changes.length > 0 && (
        <section className="panel">
          <div className="panel-head"><span className="label">Changes so far</span></div>
          <div className="panel-body" style={{ fontSize: 13 }}>
            {review.changes.map((change) => (
              <div key={change.id}>
                {change.kind === 'structure' ? (
                  `${change.block_name}: ${change.detail?.op?.replace(/_/g, ' ') ?? 'moved'}${change.detail?.exercise ? ` ${change.detail.exercise}` : ''}${change.detail?.to ? ` to ${change.detail.to}` : ''}`
                ) : change.kind !== 'exercise' ? (
                  `${change.block_name}: ${Object.keys(change.after ?? {})
                    .filter((key) => asText(change.before?.[key] as string) !== asText(change.after?.[key] as string))
                    .map((key) => `${SETTING_LABELS[key] ?? key} ${asText(change.before?.[key] as string) || 'none'} → ${asText(change.after?.[key] as string) || 'none'}`)
                    .join(', ')}`
                ) : (
                  <>
                    {change.block_name}: {change.exercise_before}
                    {change.exercise_after !== change.exercise_before ? ` → ${change.exercise_after}` : ''}
                    {` ${change.before?.sets}×${change.before?.reps ?? change.before?.hold_seconds} → ${change.after?.sets}×${change.after?.reps ?? change.after?.hold_seconds}`}
                  </>
                )}
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
