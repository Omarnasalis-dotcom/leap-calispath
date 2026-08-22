import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteStandaloneWorkout,
  fetchStandaloneWorkoutDetail,
  fetchStandaloneWorkouts,
  saveStandaloneWorkout,
  type StandaloneWorkoutKind,
  type StandaloneWorkoutRow,
  type StandaloneWorkoutStatus,
  type SaveStandaloneWorkoutInput,
} from '@/api/workoutLibrary';
import { fetchExercises } from '@/api/coaching';
import { DataTable, type Column } from '@/components/DataTable';
import { ConfirmButton, ErrorNote } from '@/components/bits';

// Admin-only page (wrapped in RequireAdmin in App.tsx, unlike the mobile-app
// LIBRARY tab equivalent for Programs, which is visible to every coach and
// only fails server-side for non-admins — this page is hidden outright,
// matching the mobile app's new CONTENT tab).

const KIND_OPTIONS: StandaloneWorkoutKind[] = ['workout', 'quick_workout'];
const STATUS_OPTIONS: StandaloneWorkoutStatus[] = ['draft', 'published', 'archived'];
const CATEGORY_OPTIONS = ['PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY'];
const DIFFICULTY_OPTIONS = ['beginner', 'intermediate', 'advanced'];
const FORMAT_OPTIONS = ['amrap', 'emom', 'fortime', 'tabata'];

interface DraftExercise {
  key: string; // local key for React lists, not persisted
  exercise_id: string;
  name: string;
  sets: string;
  reps: string;
  rest_seconds: string;
  hold_seconds: string;
  work_seconds: string;
  is_weighted: boolean;
  notes: string;
}

interface Draft {
  id: string | null;
  kind: StandaloneWorkoutKind;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  format: string;
  duration_minutes: string;
  is_free: boolean;
  status: StandaloneWorkoutStatus;
  exercises: DraftExercise[];
}

const EMPTY_DRAFT: Draft = {
  id: null,
  kind: 'workout',
  title: '',
  description: '',
  category: CATEGORY_OPTIONS[0],
  difficulty: DIFFICULTY_OPTIONS[0],
  format: FORMAT_OPTIONS[0],
  duration_minutes: '',
  is_free: false,
  status: 'draft',
  exercises: [],
};

function toInt(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

export function WorkoutLibraryPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | StandaloneWorkoutKind>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StandaloneWorkoutStatus>('draft');
  const [exerciseToAdd, setExerciseToAdd] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['standalone-workouts'],
    queryFn: fetchStandaloneWorkouts,
  });
  const exercisesQ = useQuery({ queryKey: ['exercises'], queryFn: fetchExercises });

  const loadMutation = useMutation({
    mutationFn: fetchStandaloneWorkoutDetail,
    onSuccess: (detail) => {
      setDraft({
        id: detail.id,
        kind: detail.kind,
        title: detail.title,
        description: detail.description ?? '',
        category: detail.category ?? CATEGORY_OPTIONS[0],
        difficulty: detail.difficulty ?? DIFFICULTY_OPTIONS[0],
        format: detail.format ?? FORMAT_OPTIONS[0],
        duration_minutes: detail.duration_minutes != null ? String(detail.duration_minutes) : '',
        is_free: detail.is_free,
        status: detail.status,
        exercises: detail.exercises.map((ex, i) => ({
          key: `${ex.exercise_id}-${i}`,
          exercise_id: ex.exercise_id,
          name: ex.exercise_name ?? 'Unknown exercise',
          sets: ex.sets != null ? String(ex.sets) : '',
          reps: ex.reps != null ? String(ex.reps) : '',
          rest_seconds: ex.rest_seconds != null ? String(ex.rest_seconds) : '',
          hold_seconds: ex.hold_seconds != null ? String(ex.hold_seconds) : '',
          work_seconds: ex.work_seconds != null ? String(ex.work_seconds) : '',
          is_weighted: ex.is_weighted,
          notes: ex.notes ?? '',
        })),
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (d: Draft) => {
      const input: SaveStandaloneWorkoutInput = {
        id: d.id,
        kind: d.kind,
        title: d.title.trim(),
        description: d.description.trim() || null,
        category: d.category || null,
        difficulty: d.difficulty || null,
        format: d.kind === 'quick_workout' ? d.format : null,
        duration_minutes: d.kind === 'quick_workout' ? toInt(d.duration_minutes) : null,
        is_free: d.is_free,
        status: d.status,
        exercises: d.exercises.map((ex, i) => ({
          exercise_id: ex.exercise_id,
          sets: toInt(ex.sets),
          reps: toInt(ex.reps),
          rest_seconds: toInt(ex.rest_seconds),
          hold_seconds: toInt(ex.hold_seconds),
          work_seconds: toInt(ex.work_seconds),
          is_weighted: ex.is_weighted,
          notes: ex.notes.trim() || null,
          order_index: i,
        })),
      };
      return saveStandaloneWorkout(input);
    },
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['standalone-workouts'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: deleteStandaloneWorkout,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['standalone-workouts'] }),
  });

  const filtered = data?.filter(
    (w) => (kindFilter === 'all' || w.kind === kindFilter) && (statusFilter === 'all' || w.status === statusFilter),
  );

  function addExerciseToDraft() {
    if (!draft || !exerciseToAdd) return;
    const ex = exercisesQ.data?.find((e) => e.id === exerciseToAdd);
    if (!ex) return;
    setDraft({
      ...draft,
      exercises: [
        ...draft.exercises,
        {
          key: `${ex.id}-${draft.exercises.length}`,
          exercise_id: ex.id,
          name: ex.name,
          sets: '3',
          reps: '10',
          rest_seconds: '60',
          hold_seconds: '',
          work_seconds: '',
          is_weighted: false,
          notes: '',
        },
      ],
    });
    setExerciseToAdd('');
  }

  function updateExercise(i: number, patch: Partial<DraftExercise>) {
    if (!draft) return;
    setDraft({ ...draft, exercises: draft.exercises.map((ex, idx) => (idx === i ? { ...ex, ...patch } : ex)) });
  }

  function moveExercise(i: number, dir: -1 | 1) {
    if (!draft) return;
    const target = i + dir;
    if (target < 0 || target >= draft.exercises.length) return;
    const next = [...draft.exercises];
    [next[i], next[target]] = [next[target], next[i]];
    setDraft({ ...draft, exercises: next });
  }

  function removeExercise(i: number) {
    if (!draft) return;
    setDraft({ ...draft, exercises: draft.exercises.filter((_, idx) => idx !== i) });
  }

  const columns: Column<StandaloneWorkoutRow>[] = [
    { key: 'title', header: 'Title', render: (w) => <span style={{ fontWeight: 700 }}>{w.title}</span> },
    { key: 'kind', header: 'Kind', render: (w) => <span className="dim">{w.kind.replace('_', ' ')}</span> },
    { key: 'category', header: 'Category', render: (w) => <span className="dim">{w.category ?? '—'}</span> },
    { key: 'difficulty', header: 'Difficulty', render: (w) => <span className="dim">{w.difficulty ?? '—'}</span> },
    { key: 'free', header: 'Access', render: (w) => <span className={`badge ${w.is_free ? 'ok' : 'accent'}`}>{w.is_free ? 'Free' : 'Pro'}</span> },
    { key: 'status', header: 'Status', render: (w) => <span className="badge">{w.status}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (w) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          <button className="btn small" onClick={(e) => { e.stopPropagation(); loadMutation.mutate(w.id); }}>
            Edit
          </button>
          <ConfirmButton
            label="Delete"
            danger
            title={`Delete "${w.title}"?`}
            body="This cannot be undone."
            confirmLabel="Delete"
            onConfirm={() => removeMutation.mutateAsync(w.id)}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Workout content</h1>
          <div className="sub num">{data ? `${data.length} items` : ' '}</div>
        </div>
        <div className="row">
          <select className="field" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as any)} aria-label="Filter by kind">
            <option value="all">All kinds</option>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>{k.replace('_', ' ')}</option>
            ))}
          </select>
          <select className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            + New workout
          </button>
        </div>
      </div>

      {error && <ErrorNote error={error} />}
      {loadMutation.error && <ErrorNote error={loadMutation.error} />}
      {saveMutation.error && <ErrorNote error={saveMutation.error} />}
      {removeMutation.error && <ErrorNote error={removeMutation.error} />}

      {draft && (
        <section className="panel">
          <div className="panel-head">
            <h2>{draft.id ? 'Edit workout' : 'New workout'}</h2>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <input
                className="field"
                style={{ flex: 2, minWidth: 200 }}
                placeholder="Title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                aria-label="Workout title"
              />
              <select className="field" style={{ flex: 1, minWidth: 130 }} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as StandaloneWorkoutKind })} aria-label="Kind">
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
              <select className="field" style={{ flex: 1, minWidth: 130 }} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category">
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select className="field" style={{ flex: 1, minWidth: 130 }} value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })} aria-label="Difficulty">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {draft.kind === 'quick_workout' && (
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <select className="field" style={{ flex: 1, minWidth: 130 }} value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })} aria-label="Format">
                  {FORMAT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <input
                  className="field"
                  style={{ flex: 1, minWidth: 130 }}
                  placeholder="Duration (minutes)"
                  type="number"
                  value={draft.duration_minutes}
                  onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })}
                  aria-label="Duration in minutes"
                />
              </div>
            )}

            <textarea
              className="field"
              rows={2}
              placeholder="Description (optional)"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              aria-label="Description"
            />

            <div className="row" style={{ alignItems: 'center', gap: 16 }}>
              <label className="row" style={{ gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={draft.is_free} onChange={(e) => setDraft({ ...draft, is_free: e.target.checked })} />
                Free (not Pro-locked)
              </label>
              <select className="field" style={{ minWidth: 130 }} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as StandaloneWorkoutStatus })} aria-label="Status">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--line, #2a2a2a)', paddingTop: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>Exercises</strong>
              </div>

              {draft.exercises.length === 0 && <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>No exercises added yet.</div>}

              {draft.exercises.map((ex, i) => (
                <div key={ex.key} className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 160, fontWeight: 600 }}>{ex.name}</span>
                  <input className="field" style={{ width: 70 }} placeholder="Sets" value={ex.sets} onChange={(e) => updateExercise(i, { sets: e.target.value })} aria-label="Sets" />
                  <input className="field" style={{ width: 70 }} placeholder="Reps" value={ex.reps} onChange={(e) => updateExercise(i, { reps: e.target.value })} aria-label="Reps" />
                  <input className="field" style={{ width: 80 }} placeholder="Rest s" value={ex.rest_seconds} onChange={(e) => updateExercise(i, { rest_seconds: e.target.value })} aria-label="Rest seconds" />
                  <input className="field" style={{ width: 80 }} placeholder="Hold s" value={ex.hold_seconds} onChange={(e) => updateExercise(i, { hold_seconds: e.target.value })} aria-label="Hold seconds" />
                  <input className="field" style={{ width: 80 }} placeholder="Work s" value={ex.work_seconds} onChange={(e) => updateExercise(i, { work_seconds: e.target.value })} aria-label="Work seconds" />
                  <label className="row" style={{ gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={ex.is_weighted} onChange={(e) => updateExercise(i, { is_weighted: e.target.checked })} />
                    Weighted
                  </label>
                  <input className="field" style={{ flex: 1, minWidth: 140 }} placeholder="Notes" value={ex.notes} onChange={(e) => updateExercise(i, { notes: e.target.value })} aria-label="Notes" />
                  <button className="btn small" onClick={() => moveExercise(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="btn small" onClick={() => moveExercise(i, 1)} disabled={i === draft.exercises.length - 1} aria-label="Move down">↓</button>
                  <button className="btn small danger" onClick={() => removeExercise(i)}>Remove</button>
                </div>
              ))}

              <div className="row" style={{ marginTop: 8 }}>
                <select className="field" style={{ minWidth: 220 }} value={exerciseToAdd} onChange={(e) => setExerciseToAdd(e.target.value)} aria-label="Choose exercise to add">
                  <option value="">Choose an exercise…</option>
                  {exercisesQ.data?.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <button className="btn small" disabled={!exerciseToAdd} onClick={addExerciseToDraft}>
                  Add exercise
                </button>
              </div>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
              <button
                className="btn primary"
                disabled={!draft.title.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate(draft)}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="panel">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(w) => w.id}
          loading={isLoading}
          emptyLabel="No workouts"
          emptyHint="Add the first Workout or Quick Workout."
        />
      </div>
    </div>
  );
}
