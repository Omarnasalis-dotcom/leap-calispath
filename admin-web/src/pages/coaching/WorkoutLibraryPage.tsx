import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteStandaloneWorkout,
  fetchStandaloneWorkoutDetail,
  fetchStandaloneWorkouts,
  importStandaloneWorkoutFromJson,
  saveStandaloneWorkout,
  validateStandaloneWorkoutImport,
  type ImportedStandaloneWorkout,
  type StandaloneWorkoutKind,
  type StandaloneWorkoutRow,
  type StandaloneWorkoutStatus,
  type SaveStandaloneWorkoutInput,
} from '@/api/workoutLibrary';
import { fetchExercises } from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { DataTable, type Column } from '@/components/DataTable';
import { ConfirmButton, ErrorNote } from '@/components/bits';

// Admin-only page (wrapped in RequireAdmin in App.tsx, unlike the mobile-app
// LIBRARY tab equivalent for Programs, which is visible to every coach and
// only fails server-side for non-admins — this page is hidden outright,
// matching the mobile app's new CONTENT tab).
//
// A Workout is one full training day built from ordered blocks/phases
// (Warm-Up, Skills, Strength, Cool-Down, ...), same idea as a real program
// day. Quick Workouts are effectively flat — AMRAP/EMOM/Tabata content is
// one continuous circuit — but still saved as one implicit block, since
// exercises hang off a block either way.

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

interface DraftBlock {
  key: string;
  name: string;
  exercises: DraftExercise[];
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
  blocks: DraftBlock[];
}

let keySeq = 0;
function newKey(): string {
  keySeq += 1;
  return `k-${Date.now()}-${keySeq}`;
}

function emptyBlock(name: string): DraftBlock {
  return { key: newKey(), name, exercises: [] };
}

function newDraft(): Draft {
  return {
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
    blocks: [emptyBlock('Warm-Up'), emptyBlock('Strength'), emptyBlock('Cool-Down')],
  };
}

function toInt(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// One workout per file, two-step (paste/upload -> preview -> confirm) —
// same dialog shape as ExerciseLibraryPage's BulkImportModal. Schema is
// documented in docs/features/workout-content-import-format.md.
function ImportWorkoutModal() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportedStandaloneWorkout | null>(null);

  function reset() {
    setJsonText('');
    setParseError(null);
    setPreview(null);
    importMutation.reset();
  }

  function tryParse(text: string) {
    setParseError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      setParseError('That file is not valid JSON.');
      return;
    }
    const result = validateStandaloneWorkoutImport(parsed);
    if (!result.valid) {
      setParseError(result.error ?? 'Invalid workout JSON.');
      return;
    }
    setPreview(parsed);
  }

  const importMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('Nothing to import.');
      if (!profile?.id) throw new Error('Your profile hasn’t loaded yet — reload and try again.');
      return importStandaloneWorkoutFromJson(preview, profile.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['standalone-workouts'] });
      dialogRef.current?.close();
      reset();
    },
  });

  const blockCount = preview?.blocks?.length ?? 0;
  const exerciseCount = (preview?.blocks ?? []).reduce((sum, b) => sum + (b.exercises?.length ?? 0), 0);

  return (
    <>
      <button type="button" className="btn" onClick={() => dialogRef.current?.showModal()}>
        Import JSON
      </button>
      <dialog className="confirm" style={{ maxWidth: 560 }} ref={dialogRef} onClose={reset}>
        <h2 style={{ marginBottom: 8 }}>Import workout from JSON</h2>

        {!preview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 16px' }}>
            <div className="dim" style={{ fontSize: 13 }}>
              One workout per file — see{' '}
              <code>docs/features/workout-content-import-format.md</code> for the schema.
            </div>
            {parseError && <ErrorNote error={new Error(parseError)} />}
            <div className="row">
              <button type="button" className="btn small" onClick={() => fileInputRef.current?.click()}>
                Choose JSON file…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void file.text().then(tryParse);
                  e.target.value = '';
                }}
              />
            </div>
            <textarea
              className="field"
              rows={8}
              placeholder="…or paste JSON content here"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              aria-label="Paste JSON content"
            />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn small" onClick={() => dialogRef.current?.close()}>
                Cancel
              </button>
              <button type="button" className="btn small primary" onClick={() => tryParse(jsonText)}>
                Preview
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 16px' }}>
            {importMutation.error && <ErrorNote error={importMutation.error} />}
            <div className="dim" style={{ fontSize: 13 }}>
              <strong>{preview.title}</strong> — {preview.kind === 'quick_workout' ? 'Quick Workout' : 'Workout'} —{' '}
              {blockCount} block{blockCount === 1 ? '' : 's'}, {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'}.
              Will be created as a draft for review.
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn small"
                disabled={importMutation.isPending}
                onClick={() => setPreview(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={importMutation.isPending || !profile?.id}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

export function WorkoutLibraryPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | StandaloneWorkoutKind>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StandaloneWorkoutStatus>('draft');
  const [exerciseToAdd, setExerciseToAdd] = useState<Record<string, string>>({});

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
        blocks: detail.blocks.map((block) => ({
          key: newKey(),
          name: block.name,
          exercises: block.exercises.map((ex) => ({
            key: newKey(),
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
        blocks: d.blocks.map((block, bi) => ({
          name: block.name.trim(),
          order_index: bi,
          exercises: block.exercises.map((ex, i) => ({
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

  function addBlock() {
    if (!draft) return;
    setDraft({ ...draft, blocks: [...draft.blocks, emptyBlock('')] });
  }

  function updateBlockName(blockIndex: number, name: string) {
    if (!draft) return;
    setDraft({ ...draft, blocks: draft.blocks.map((b, i) => (i === blockIndex ? { ...b, name } : b)) });
  }

  function moveBlock(blockIndex: number, dir: -1 | 1) {
    if (!draft) return;
    const target = blockIndex + dir;
    if (target < 0 || target >= draft.blocks.length) return;
    const next = [...draft.blocks];
    [next[blockIndex], next[target]] = [next[target], next[blockIndex]];
    setDraft({ ...draft, blocks: next });
  }

  function removeBlock(blockIndex: number) {
    if (!draft) return;
    setDraft({ ...draft, blocks: draft.blocks.filter((_, i) => i !== blockIndex) });
  }

  function addExerciseToBlock(blockIndex: number) {
    if (!draft) return;
    const block = draft.blocks[blockIndex];
    const exerciseId = exerciseToAdd[block.key];
    if (!exerciseId) return;
    const ex = exercisesQ.data?.find((e) => e.id === exerciseId);
    if (!ex) return;
    setDraft({
      ...draft,
      blocks: draft.blocks.map((b, i) =>
        i === blockIndex
          ? {
              ...b,
              exercises: [
                ...b.exercises,
                {
                  key: newKey(),
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
            }
          : b,
      ),
    });
    setExerciseToAdd({ ...exerciseToAdd, [block.key]: '' });
  }

  function updateExercise(blockIndex: number, exIndex: number, patch: Partial<DraftExercise>) {
    if (!draft) return;
    setDraft({
      ...draft,
      blocks: draft.blocks.map((b, i) =>
        i === blockIndex
          ? { ...b, exercises: b.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)) }
          : b,
      ),
    });
  }

  function moveExercise(blockIndex: number, exIndex: number, dir: -1 | 1) {
    if (!draft) return;
    setDraft({
      ...draft,
      blocks: draft.blocks.map((b, i) => {
        if (i !== blockIndex) return b;
        const target = exIndex + dir;
        if (target < 0 || target >= b.exercises.length) return b;
        const next = [...b.exercises];
        [next[exIndex], next[target]] = [next[target], next[exIndex]];
        return { ...b, exercises: next };
      }),
    });
  }

  function removeExercise(blockIndex: number, exIndex: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      blocks: draft.blocks.map((b, i) =>
        i === blockIndex ? { ...b, exercises: b.exercises.filter((_, j) => j !== exIndex) } : b,
      ),
    });
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
          <ImportWorkoutModal />
          <button className="btn primary" onClick={() => setDraft(newDraft())}>
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
              <strong>{draft.kind === 'quick_workout' ? 'Block (usually just one)' : 'Blocks — Warm-Up through Cool-Down'}</strong>

              {draft.blocks.length === 0 && <div className="dim" style={{ fontSize: 13, margin: '8px 0' }}>No blocks added yet.</div>}

              {draft.blocks.map((block, bi) => (
                <div key={block.key} className="panel" style={{ margin: '10px 0', padding: 12 }}>
                  <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <input
                      className="field"
                      style={{ flex: 1, minWidth: 160, fontWeight: 700 }}
                      placeholder="Block name (e.g. Warm-Up)"
                      value={block.name}
                      onChange={(e) => updateBlockName(bi, e.target.value)}
                      aria-label="Block name"
                    />
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn small" onClick={() => moveBlock(bi, -1)} disabled={bi === 0} aria-label="Move block up">↑</button>
                      <button className="btn small" onClick={() => moveBlock(bi, 1)} disabled={bi === draft.blocks.length - 1} aria-label="Move block down">↓</button>
                      <button className="btn small danger" onClick={() => removeBlock(bi)}>Remove block</button>
                    </div>
                  </div>

                  {block.exercises.length === 0 && (
                    <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>No exercises in this block yet.</div>
                  )}

                  {block.exercises.map((ex, i) => (
                    <div key={ex.key} className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 160, fontWeight: 600 }}>{ex.name}</span>
                      <input className="field" style={{ width: 70 }} placeholder="Sets" value={ex.sets} onChange={(e) => updateExercise(bi, i, { sets: e.target.value })} aria-label="Sets" />
                      <input className="field" style={{ width: 70 }} placeholder="Reps" value={ex.reps} onChange={(e) => updateExercise(bi, i, { reps: e.target.value })} aria-label="Reps" />
                      <input className="field" style={{ width: 80 }} placeholder="Rest s" value={ex.rest_seconds} onChange={(e) => updateExercise(bi, i, { rest_seconds: e.target.value })} aria-label="Rest seconds" />
                      <input className="field" style={{ width: 80 }} placeholder="Hold s" value={ex.hold_seconds} onChange={(e) => updateExercise(bi, i, { hold_seconds: e.target.value })} aria-label="Hold seconds" />
                      <input className="field" style={{ width: 80 }} placeholder="Work s" value={ex.work_seconds} onChange={(e) => updateExercise(bi, i, { work_seconds: e.target.value })} aria-label="Work seconds" />
                      <label className="row" style={{ gap: 4, alignItems: 'center' }}>
                        <input type="checkbox" checked={ex.is_weighted} onChange={(e) => updateExercise(bi, i, { is_weighted: e.target.checked })} />
                        Weighted
                      </label>
                      <input className="field" style={{ flex: 1, minWidth: 140 }} placeholder="Notes" value={ex.notes} onChange={(e) => updateExercise(bi, i, { notes: e.target.value })} aria-label="Notes" />
                      <button className="btn small" onClick={() => moveExercise(bi, i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="btn small" onClick={() => moveExercise(bi, i, 1)} disabled={i === block.exercises.length - 1} aria-label="Move down">↓</button>
                      <button className="btn small danger" onClick={() => removeExercise(bi, i)}>Remove</button>
                    </div>
                  ))}

                  <div className="row" style={{ marginTop: 8 }}>
                    <select
                      className="field"
                      style={{ minWidth: 220 }}
                      value={exerciseToAdd[block.key] ?? ''}
                      onChange={(e) => setExerciseToAdd({ ...exerciseToAdd, [block.key]: e.target.value })}
                      aria-label="Choose exercise to add"
                    >
                      <option value="">Choose an exercise…</option>
                      {exercisesQ.data?.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    <button className="btn small" disabled={!exerciseToAdd[block.key]} onClick={() => addExerciseToBlock(bi)}>
                      Add exercise
                    </button>
                  </div>
                </div>
              ))}

              <button className="btn small" onClick={addBlock} style={{ marginTop: 4 }}>
                + Add block
              </button>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
              <button
                className="btn primary"
                disabled={!draft.title.trim() || draft.blocks.some((b) => !b.name.trim()) || saveMutation.isPending}
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
