import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import {
  bulkDeleteStandaloneWorkouts,
  bulkSetStandaloneWorkoutStatus,
  deleteStandaloneWorkout,
  fetchStandaloneWorkoutDetail,
  fetchStandaloneWorkouts,
  importStandaloneWorkoutFromJson,
  saveStandaloneWorkout,
  setStandaloneWorkoutCoverImage,
  uploadWorkoutCoverImage,
  validateStandaloneWorkoutImport,
  type ImportedStandaloneWorkout,
  type SaveStandaloneWorkoutBlockInput,
  type StandaloneWorkoutKind,
  type StandaloneWorkoutRow,
  type StandaloneWorkoutStatus,
  type SaveStandaloneWorkoutInput,
} from '@/api/workoutLibrary';
import { fetchExercises } from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { DataTable, type Column } from '@/components/DataTable';
import { ConfirmButton, ErrorNote } from '@/components/bits';
import { useBuilderClipboard } from '@/contexts/BuilderClipboardContext';
import { BlockConceptParser } from '@/shared/BlockConceptParser';
import { BlockCard, fromClipboardBlock } from './builder/BlockCard';
import { clientKey, newBlock, type BuilderBlock, type ExerciseOption } from './builder/types';

// Admin-only page (wrapped in RequireAdmin in App.tsx, unlike the mobile-app
// LIBRARY tab equivalent for Programs, which is visible to every coach and
// only fails server-side for non-admins — this page is hidden outright,
// matching the mobile app's new CONTENT tab).
//
// A Workout is one full training day built from ordered blocks/phases
// (Warm-Up, Skills, Strength, Cool-Down, ...), same idea as a real program
// day — its block editor below reuses Program Builder's own BlockCard/
// ExerciseRow/ConceptWizard components (see ./builder/) so a "workout" is
// authored with exactly the same drag-and-drop, timing/structure config,
// exercise search, and clipboard as one day of a program.
//
// Quick Workouts are effectively flat — AMRAP/EMOM/Tabata content is one
// continuous circuit — but still saved as one implicit block, since
// exercises hang off a block either way. They keep the original simple
// editor (no CONCEPT metadata support server-side for this kind).

const KIND_OPTIONS: StandaloneWorkoutKind[] = ['workout', 'quick_workout'];
const STATUS_OPTIONS: StandaloneWorkoutStatus[] = ['draft', 'published', 'archived'];
const CATEGORY_OPTIONS = ['PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY'];
const DIFFICULTY_OPTIONS = ['beginner', 'intermediate', 'advanced'];
const FORMAT_OPTIONS = ['amrap', 'emom', 'fortime', 'tabata'];

// ---------- kind: 'quick_workout' — flat, unchanged editor shape ----------

interface QuickExercise {
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

interface QuickBlock {
  key: string;
  name: string;
  exercises: QuickExercise[];
}

let keySeq = 0;
function newKey(): string {
  keySeq += 1;
  return `k-${Date.now()}-${keySeq}`;
}

function emptyQuickBlock(name: string): QuickBlock {
  return { key: newKey(), name, exercises: [] };
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
  // kind: 'workout' — full block/exercise builder, mirrors Program
  // Builder's one-day shape (BuilderBlock/BuilderExercise).
  blocks: BuilderBlock[];
  // kind: 'quick_workout' — flat single-block editor, unchanged.
  quickBlocks: QuickBlock[];
  cover_image_url: string | null;
  goal_tags: string[];
  tier_min: string;
  tier_max: string;
  interval_seconds: string;
  rounds: string;
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
    blocks: [newBlock('Warm-Up'), newBlock('Strength'), newBlock('Cool-Down')],
    quickBlocks: [emptyQuickBlock('Warm-Up'), emptyQuickBlock('Strength'), emptyQuickBlock('Cool-Down')],
    cover_image_url: null,
    goal_tags: [],
    tier_min: '',
    tier_max: '',
    interval_seconds: '',
    rounds: '',
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

// kind: 'workout' block editor — a vertical drag-and-drop list of BlockCard,
// the same component/behavior Program Builder's DayColumn uses for one
// day's blocks, just without the day wrapper (day name/focus tag/day-level
// drag+clipboard) since a standalone workout is always exactly one day.
function WorkoutBlocksEditor({
  blocks,
  exerciseOptions,
  onChange,
}: {
  blocks: BuilderBlock[];
  exerciseOptions: ExerciseOption[];
  onChange: (blocks: BuilderBlock[]) => void;
}) {
  const clipboard = useBuilderClipboard();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onBlockDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(blocks, oldIndex, newIndex));
  }

  function patchBlock(blockId: string, patch: Partial<BuilderBlock>) {
    onChange(blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)));
  }

  function insertBlockAfter(afterId: string, inserted: BuilderBlock) {
    const idx = blocks.findIndex((b) => b.id === afterId);
    const next = [...blocks];
    next.splice(idx + 1, 0, inserted);
    onChange(next);
  }

  const canPasteBlock = clipboard.clipboard?.type === 'block';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      {blocks.length === 0 && <div className="dim" style={{ fontSize: 13 }}>No blocks added yet.</div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onBlockDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {blocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                exerciseOptions={exerciseOptions}
                showWorkSeconds
                onChange={(patch) => patchBlock(block.id, patch)}
                onRemove={() => onChange(blocks.filter((b) => b.id !== block.id))}
                onPasteAfter={(pasted) => insertBlockAfter(block.id, pasted)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="row" style={{ gap: 6 }}>
        <button className="btn small" onClick={() => onChange([...blocks, newBlock('')])}>
          + Add block
        </button>
        <button
          className="btn small"
          disabled={!canPasteBlock}
          title={canPasteBlock ? 'Paste block' : 'Clipboard is empty'}
          onClick={() => {
            if (clipboard.clipboard?.type === 'block') {
              onChange([...blocks, fromClipboardBlock(clipboard.clipboard.data)]);
            }
          }}
        >
          Paste block
        </button>
      </div>
    </div>
  );
}

// List-view cover upload — uploads and attaches a cover photo directly from
// the table row, without opening the full edit form.
function CoverCell({ workout }: { workout: StandaloneWorkoutRow }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const url = await uploadWorkoutCoverImage(file);
      await setStandaloneWorkoutCoverImage(workout.id, url);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['standalone-workouts'] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
        {workout.cover_image_url ? (
          <img
            src={workout.cover_image_url}
            alt=""
            style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line, #2a2a2a)' }}
          />
        ) : (
          <span
            className="dim"
            style={{
              width: 44,
              height: 32,
              borderRadius: 4,
              border: '1px dashed var(--line, #2a2a2a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              flex: 'none',
            }}
          >
            —
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) mutation.mutate(file);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn small" disabled={mutation.isPending} onClick={() => inputRef.current?.click()}>
          {mutation.isPending ? 'Uploading…' : workout.cover_image_url ? 'Replace' : 'Upload'}
        </button>
      </span>
      {mutation.error && (
        <span style={{ color: 'var(--danger, #d33)', fontSize: 11 }}>{mutation.error.message}</span>
      )}
    </div>
  );
}

export function WorkoutLibraryPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | StandaloneWorkoutKind>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StandaloneWorkoutStatus>('draft');
  const [exerciseToAdd, setExerciseToAdd] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['standalone-workouts'],
    queryFn: fetchStandaloneWorkouts,
  });
  const exercisesQ = useQuery({ queryKey: ['exercises'], queryFn: fetchExercises });
  // Every exercise is pickable here — this whole page is admin-only
  // (wrapped in RequireAdmin), unlike Program Builder where coaches only
  // get to pick their own exercises plus admin-authored ones.
  const exerciseOptions: ExerciseOption[] = (exercisesQ.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    youtube_url: e.youtube_url,
    pickable: true,
  }));

  const loadMutation = useMutation({
    mutationFn: fetchStandaloneWorkoutDetail,
    onSuccess: (detail) => {
      const base = {
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
        cover_image_url: detail.cover_image_url,
        goal_tags: detail.goal_tags ?? [],
        tier_min: detail.tier_min != null ? String(detail.tier_min) : '',
        tier_max: detail.tier_max != null ? String(detail.tier_max) : '',
        interval_seconds: detail.interval_seconds != null ? String(detail.interval_seconds) : '',
        rounds: detail.rounds != null ? String(detail.rounds) : '',
      };

      if (detail.kind === 'workout') {
        setDraft({
          ...base,
          blocks: detail.blocks.map((block) => {
            const { metadata, cleanNotes } = BlockConceptParser.parse(block.notes);
            return {
              id: clientKey(),
              db_id: block.id,
              name: block.name,
              notes: cleanNotes,
              metadata,
              exercises: block.exercises.map((ex) => ({
                id: clientKey(),
                exercise_id: ex.exercise_id,
                exercise_name: ex.exercise_name ?? 'Unknown exercise',
                sets: ex.sets,
                reps: ex.reps,
                rest_seconds: ex.rest_seconds,
                hold_seconds: ex.hold_seconds,
                work_seconds: ex.work_seconds,
                notes: ex.notes ?? '',
              })),
            };
          }),
          quickBlocks: [emptyQuickBlock('Warm-Up'), emptyQuickBlock('Strength'), emptyQuickBlock('Cool-Down')],
        });
      } else {
        setDraft({
          ...base,
          blocks: [newBlock('Warm-Up'), newBlock('Strength'), newBlock('Cool-Down')],
          quickBlocks: detail.blocks.map((block) => ({
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
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: (d: Draft) => {
      const isWorkout = d.kind === 'workout';
      const blocks: SaveStandaloneWorkoutBlockInput[] = isWorkout
        ? d.blocks.map((block, bi) => ({
            name: block.name.trim(),
            // Same "[CONCEPT:{json}] notes" encoding program_blocks.notes
            // uses — see BlockConceptParser and builderIO.ts's saveTemplateWeeks.
            notes: BlockConceptParser.stringify(block.metadata, block.notes),
            order_index: bi,
            exercises: block.exercises.map((ex, i) => ({
              exercise_id: ex.exercise_id,
              sets: ex.sets,
              reps: ex.reps,
              rest_seconds: ex.rest_seconds,
              hold_seconds: ex.hold_seconds,
              work_seconds: ex.work_seconds ?? null,
              // Weighted is a per-block concept-wizard flag here, applied to
              // every exercise in the block — exactly how builderIO.ts
              // derives block_exercises.is_weighted for Program Builder.
              is_weighted: !!block.metadata.is_weighted,
              notes: ex.notes.trim() || null,
              order_index: i,
            })),
          }))
        : d.quickBlocks.map((block, bi) => ({
            name: block.name.trim(),
            notes: null,
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
          }));

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
        cover_image_url: d.cover_image_url,
        goal_tags: d.goal_tags,
        tier_min: toInt(d.tier_min),
        tier_max: toInt(d.tier_max),
        interval_seconds: d.kind === 'quick_workout' ? toInt(d.interval_seconds) : null,
        rounds: d.kind === 'quick_workout' ? toInt(d.rounds) : null,
        blocks,
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
    onSuccess: (_data, id) => {
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['standalone-workouts'] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteStandaloneWorkouts(ids),
    onSuccess: () => {
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ['standalone-workouts'] });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: (status: StandaloneWorkoutStatus) => bulkSetStandaloneWorkoutStatus(Array.from(selectedIds), status),
    onSuccess: () => {
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ['standalone-workouts'] });
    },
  });

  const uploadCoverMutation = useMutation({
    mutationFn: uploadWorkoutCoverImage,
    onSuccess: (url) => {
      setDraft((prev) => (prev ? { ...prev, cover_image_url: url } : prev));
    },
  });

  const filtered = data?.filter(
    (w) => (kindFilter === 'all' || w.kind === kindFilter) && (statusFilter === 'all' || w.status === statusFilter),
  );

  // ---------- kind: 'quick_workout' block/exercise handlers ----------

  function addQuickBlock() {
    if (!draft) return;
    setDraft({ ...draft, quickBlocks: [...draft.quickBlocks, emptyQuickBlock('')] });
  }

  function updateQuickBlockName(blockIndex: number, name: string) {
    if (!draft) return;
    setDraft({ ...draft, quickBlocks: draft.quickBlocks.map((b, i) => (i === blockIndex ? { ...b, name } : b)) });
  }

  function moveQuickBlock(blockIndex: number, dir: -1 | 1) {
    if (!draft) return;
    const target = blockIndex + dir;
    if (target < 0 || target >= draft.quickBlocks.length) return;
    const next = [...draft.quickBlocks];
    [next[blockIndex], next[target]] = [next[target], next[blockIndex]];
    setDraft({ ...draft, quickBlocks: next });
  }

  function removeQuickBlock(blockIndex: number) {
    if (!draft) return;
    setDraft({ ...draft, quickBlocks: draft.quickBlocks.filter((_, i) => i !== blockIndex) });
  }

  function addExerciseToQuickBlock(blockIndex: number) {
    if (!draft) return;
    const block = draft.quickBlocks[blockIndex];
    const exerciseId = exerciseToAdd[block.key];
    if (!exerciseId) return;
    const ex = exercisesQ.data?.find((e) => e.id === exerciseId);
    if (!ex) return;
    setDraft({
      ...draft,
      quickBlocks: draft.quickBlocks.map((b, i) =>
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

  function updateQuickExercise(blockIndex: number, exIndex: number, patch: Partial<QuickExercise>) {
    if (!draft) return;
    setDraft({
      ...draft,
      quickBlocks: draft.quickBlocks.map((b, i) =>
        i === blockIndex
          ? { ...b, exercises: b.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)) }
          : b,
      ),
    });
  }

  function moveQuickExercise(blockIndex: number, exIndex: number, dir: -1 | 1) {
    if (!draft) return;
    setDraft({
      ...draft,
      quickBlocks: draft.quickBlocks.map((b, i) => {
        if (i !== blockIndex) return b;
        const target = exIndex + dir;
        if (target < 0 || target >= b.exercises.length) return b;
        const next = [...b.exercises];
        [next[exIndex], next[target]] = [next[target], next[exIndex]];
        return { ...b, exercises: next };
      }),
    });
  }

  function removeQuickExercise(blockIndex: number, exIndex: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      quickBlocks: draft.quickBlocks.map((b, i) =>
        i === blockIndex ? { ...b, exercises: b.exercises.filter((_, j) => j !== exIndex) } : b,
      ),
    });
  }

  const columns: Column<StandaloneWorkoutRow>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={!!filtered && filtered.length > 0 && filtered.every((w) => selectedIds.has(w.id))}
          onChange={(e) => setSelectedIds(e.target.checked ? new Set(filtered?.map((w) => w.id)) : new Set())}
          aria-label="Select all visible workouts"
        />
      ),
      render: (w) => (
        <input
          type="checkbox"
          checked={selectedIds.has(w.id)}
          onChange={(e) =>
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (e.target.checked) next.add(w.id);
              else next.delete(w.id);
              return next;
            })
          }
          aria-label={`Select "${w.title}"`}
        />
      ),
    },
    { key: 'cover', header: 'Cover', render: (w) => <CoverCell workout={w} /> },
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

  const saveDisabled =
    !draft ||
    !draft.title.trim() ||
    (draft.kind === 'workout'
      ? draft.blocks.some((b) => !b.name.trim() || b.exercises.length === 0 || b.exercises.some((ex) => !ex.exercise_id))
      : draft.quickBlocks.some((b) => !b.name.trim() || b.exercises.length === 0)) ||
    saveMutation.isPending;

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
      {uploadCoverMutation.error && <ErrorNote error={uploadCoverMutation.error} />}

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

            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              {draft.cover_image_url ? (
                <img
                  src={draft.cover_image_url}
                  alt="Cover preview"
                  style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line, #2a2a2a)' }}
                />
              ) : (
                <div className="dim" style={{ fontSize: 13 }}>No cover photo — falls back to a category-color tile.</div>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadCoverMutation.mutate(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn small"
                disabled={uploadCoverMutation.isPending}
                onClick={() => coverInputRef.current?.click()}
              >
                {uploadCoverMutation.isPending ? 'Uploading…' : draft.cover_image_url ? 'Replace cover' : 'Upload cover'}
              </button>
              {draft.cover_image_url && (
                <button type="button" className="btn small danger" onClick={() => setDraft({ ...draft, cover_image_url: null })}>
                  Remove cover
                </button>
              )}
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
                {draft.format === 'emom' && (
                  <input
                    className="field"
                    style={{ flex: 1, minWidth: 160 }}
                    placeholder="Seconds per round (default 60)"
                    type="number"
                    value={draft.interval_seconds}
                    onChange={(e) => setDraft({ ...draft, interval_seconds: e.target.value })}
                    aria-label="Seconds per EMOM round"
                  />
                )}
                {(draft.format === 'tabata' || draft.format === 'fortime') && (
                  <input
                    className="field"
                    style={{ flex: 1, minWidth: 160 }}
                    placeholder={draft.format === 'tabata' ? 'Rounds (default from duration)' : 'Target rounds (blank = uncapped)'}
                    type="number"
                    value={draft.rounds}
                    onChange={(e) => setDraft({ ...draft, rounds: e.target.value })}
                    aria-label="Rounds"
                  />
                )}
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

              {draft.kind === 'workout' ? (
                <WorkoutBlocksEditor
                  blocks={draft.blocks}
                  exerciseOptions={exerciseOptions}
                  onChange={(blocks) => setDraft({ ...draft, blocks })}
                />
              ) : (
                <>
                  {draft.quickBlocks.length === 0 && <div className="dim" style={{ fontSize: 13, margin: '8px 0' }}>No blocks added yet.</div>}

                  {draft.quickBlocks.map((block, bi) => (
                    <div key={block.key} className="panel" style={{ margin: '10px 0', padding: 12 }}>
                      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <input
                          className="field"
                          style={{ flex: 1, minWidth: 160, fontWeight: 700 }}
                          placeholder="Block name (e.g. Warm-Up)"
                          value={block.name}
                          onChange={(e) => updateQuickBlockName(bi, e.target.value)}
                          aria-label="Block name"
                        />
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn small" onClick={() => moveQuickBlock(bi, -1)} disabled={bi === 0} aria-label="Move block up">↑</button>
                          <button className="btn small" onClick={() => moveQuickBlock(bi, 1)} disabled={bi === draft.quickBlocks.length - 1} aria-label="Move block down">↓</button>
                          <button className="btn small danger" onClick={() => removeQuickBlock(bi)}>Remove block</button>
                        </div>
                      </div>

                      {block.exercises.length === 0 && (
                        <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>No exercises in this block yet — add at least one before saving.</div>
                      )}

                      {block.exercises.map((ex, i) => (
                        <div key={ex.key} className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ minWidth: 160, fontWeight: 600 }}>{ex.name}</span>
                          <input className="field" style={{ width: 70 }} placeholder="Sets" value={ex.sets} onChange={(e) => updateQuickExercise(bi, i, { sets: e.target.value })} aria-label="Sets" />
                          <input className="field" style={{ width: 70 }} placeholder="Reps" value={ex.reps} onChange={(e) => updateQuickExercise(bi, i, { reps: e.target.value })} aria-label="Reps" />
                          <input className="field" style={{ width: 80 }} placeholder="Rest s" value={ex.rest_seconds} onChange={(e) => updateQuickExercise(bi, i, { rest_seconds: e.target.value })} aria-label="Rest seconds" />
                          <input className="field" style={{ width: 80 }} placeholder="Hold s" value={ex.hold_seconds} onChange={(e) => updateQuickExercise(bi, i, { hold_seconds: e.target.value })} aria-label="Hold seconds" />
                          <input className="field" style={{ width: 80 }} placeholder="Work s" value={ex.work_seconds} onChange={(e) => updateQuickExercise(bi, i, { work_seconds: e.target.value })} aria-label="Work seconds" />
                          <label className="row" style={{ gap: 4, alignItems: 'center' }}>
                            <input type="checkbox" checked={ex.is_weighted} onChange={(e) => updateQuickExercise(bi, i, { is_weighted: e.target.checked })} />
                            Weighted
                          </label>
                          <input className="field" style={{ flex: 1, minWidth: 140 }} placeholder="Notes" value={ex.notes} onChange={(e) => updateQuickExercise(bi, i, { notes: e.target.value })} aria-label="Notes" />
                          <button className="btn small" onClick={() => moveQuickExercise(bi, i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                          <button className="btn small" onClick={() => moveQuickExercise(bi, i, 1)} disabled={i === block.exercises.length - 1} aria-label="Move down">↓</button>
                          <button className="btn small danger" onClick={() => removeQuickExercise(bi, i)}>Remove</button>
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
                        <button className="btn small" disabled={!exerciseToAdd[block.key]} onClick={() => addExerciseToQuickBlock(bi)}>
                          Add exercise
                        </button>
                      </div>
                    </div>
                  ))}

                  <button className="btn small" onClick={addQuickBlock} style={{ marginTop: 4 }}>
                    + Add block
                  </button>
                </>
              )}
            </div>

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
              <button
                className="btn primary"
                disabled={saveDisabled}
                onClick={() => draft && saveMutation.mutate(draft)}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </section>
      )}

      {bulkDeleteMutation.error && <ErrorNote error={bulkDeleteMutation.error} />}
      {bulkStatusMutation.error && <ErrorNote error={bulkStatusMutation.error} />}

      {selectedIds.size > 0 && (
        <div className="panel row" style={{ alignItems: 'center', gap: 10, padding: 10 }}>
          <strong>{selectedIds.size} selected</strong>
          <button
            className="btn small"
            disabled={bulkStatusMutation.isPending}
            onClick={() => bulkStatusMutation.mutate('published')}
          >
            Publish
          </button>
          <button
            className="btn small"
            disabled={bulkStatusMutation.isPending}
            onClick={() => bulkStatusMutation.mutate('archived')}
          >
            Archive
          </button>
          <button
            className="btn small"
            disabled={bulkStatusMutation.isPending}
            onClick={() => bulkStatusMutation.mutate('draft')}
          >
            Move to draft
          </button>
          <ConfirmButton
            label="Delete"
            danger
            disabled={bulkDeleteMutation.isPending}
            title={`Delete ${selectedIds.size} workout${selectedIds.size === 1 ? '' : 's'}?`}
            body="This cannot be undone."
            confirmLabel="Delete"
            onConfirm={() => bulkDeleteMutation.mutateAsync(Array.from(selectedIds))}
          />
          <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
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
