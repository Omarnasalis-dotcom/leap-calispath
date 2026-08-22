// State/logic behind WorkoutLibraryBuilderScreen — the admin-only authoring
// UI for standalone_workouts/standalone_workout_blocks/_exercises
// (Workouts + Quick Workouts). A Workout is one full training day built
// from ordered blocks/phases (Warm-Up, Skills, Strength, Cool-Down, ...) —
// same idea as a real program day, just without weeks or CONCEPT metadata.
// Reuses ExercisePickerModal as-is for exercise selection; it just adds
// into whichever block is currently open (activeBlockIndex) instead of a
// single flat list.

import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getAllStandaloneWorkoutsForAdmin,
  getStandaloneWorkoutDetail,
  saveStandaloneWorkout,
  deleteStandaloneWorkout,
  StandaloneWorkoutAdminRow,
  StandaloneWorkoutKind,
  StandaloneWorkoutStatus,
  Difficulty,
  QuickWorkoutFormat,
} from '../../lib/workoutLibrary';

// id: string | number to match ExercisePickerModal's own local type exactly
// (TypeScript treats two structurally-identical interfaces of the same name
// as distinct nominal types across files unless every field matches).
interface ExerciseLibraryItem {
  id: string | number;
  name: string;
  youtube_url: string;
  category: string;
  difficulty: string;
}

export interface BuilderExercise {
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

export interface BuilderBlock {
  key: string;
  name: string;
  exercises: BuilderExercise[];
}

let blockKeySeq = 0;
function newBlockKey(): string {
  blockKeySeq += 1;
  return `block-${Date.now()}-${blockKeySeq}`;
}

function emptyBlock(name: string): BuilderBlock {
  return { key: newBlockKey(), name, exercises: [] };
}

const EMPTY_FORM = {
  title: '',
  description: '',
  kind: 'workout' as StandaloneWorkoutKind,
  category: 'PUSH',
  difficulty: 'beginner' as Difficulty,
  format: 'amrap' as QuickWorkoutFormat,
  duration_minutes: '',
  is_free: false,
  status: 'draft' as StandaloneWorkoutStatus,
};

const CATEGORIES = ['all', 'push', 'pull', 'legs', 'core', 'skill'];

export function useWorkoutLibraryBuilder() {
  const [workouts, setWorkouts] = useState<StandaloneWorkoutAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  // Cover photos are web-only authored (admin-web upload UI, no picker
  // here) — this just round-trips whatever's already set so an edit+save
  // from mobile doesn't silently wipe out an admin-set cover.
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const loadWorkouts = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const rows = await getAllStandaloneWorkoutsForAdmin();
      setWorkouts(rows);
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD WORKOUTS.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExerciseLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const { data, error } = await supabase.from('exercise_library').select('*').order('name', { ascending: true });
      if (error) throw error;
      setExerciseLibrary(data || []);
    } catch (err) {
      console.error('Failed to load exercise library:', err);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const startNew = () => {
    setForm({ ...EMPTY_FORM });
    setBlocks([emptyBlock('Warm-Up'), emptyBlock('Strength'), emptyBlock('Cool-Down')]);
    setCoverImageUrl(null);
    setEditingId('new');
  };

  const startEdit = async (id: string) => {
    setEditingId(id);
    setFormLoading(true);
    try {
      const detail = await getStandaloneWorkoutDetail(id);
      if (!detail) throw new Error('Workout not found');
      setForm({
        title: detail.title,
        description: detail.description || '',
        kind: detail.kind,
        category: detail.category || 'PUSH',
        difficulty: detail.difficulty || 'beginner',
        format: detail.format || 'amrap',
        duration_minutes: detail.duration_minutes != null ? String(detail.duration_minutes) : '',
        is_free: detail.is_free,
        status: (workouts.find((w) => w.id === id)?.status) || 'draft',
      });
      setCoverImageUrl(detail.cover_image_url);
      setBlocks(
        detail.blocks.map((block) => ({
          key: newBlockKey(),
          name: block.name,
          exercises: block.exercises.map((ex) => ({
            exercise_id: ex.exercise_id,
            name: ex.name,
            sets: ex.sets != null ? String(ex.sets) : '',
            reps: ex.reps != null ? String(ex.reps) : '',
            rest_seconds: ex.rest_seconds != null ? String(ex.rest_seconds) : '',
            hold_seconds: ex.hold_seconds != null ? String(ex.hold_seconds) : '',
            work_seconds: ex.work_seconds != null ? String(ex.work_seconds) : '',
            is_weighted: ex.is_weighted,
            notes: ex.notes || '',
          })),
        }))
      );
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD WORKOUT.');
      setEditingId(null);
    } finally {
      setFormLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setBlocks([]);
    setCoverImageUrl(null);
  };

  const updateForm = (field: keyof typeof EMPTY_FORM, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addBlock = () => {
    setBlocks((prev) => [...prev, emptyBlock('')]);
  };

  const removeBlock = (blockIndex: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== blockIndex));
  };

  const moveBlock = (blockIndex: number, direction: -1 | 1) => {
    setBlocks((prev) => {
      const target = blockIndex + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[blockIndex], next[target]] = [next[target], next[blockIndex]];
      return next;
    });
  };

  const updateBlockName = (blockIndex: number, name: string) => {
    setBlocks((prev) => prev.map((b, i) => (i === blockIndex ? { ...b, name } : b)));
  };

  const openPicker = (blockIndex: number) => {
    setActiveBlockIndex(blockIndex);
    setPickerVisible(true);
    if (exerciseLibrary.length === 0) fetchExerciseLibrary();
  };

  const addExercise = (item: ExerciseLibraryItem) => {
    if (activeBlockIndex === null) return;
    const blockIndex = activeBlockIndex;
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIndex
          ? {
              ...b,
              exercises: [
                ...b.exercises,
                {
                  exercise_id: String(item.id),
                  name: item.name,
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
          : b
      )
    );
    setPickerVisible(false);
  };

  const removeExercise = (blockIndex: number, exIndex: number) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === blockIndex ? { ...b, exercises: b.exercises.filter((_, j) => j !== exIndex) } : b))
    );
  };

  const moveExercise = (blockIndex: number, exIndex: number, direction: -1 | 1) => {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== blockIndex) return b;
        const target = exIndex + direction;
        if (target < 0 || target >= b.exercises.length) return b;
        const next = [...b.exercises];
        [next[exIndex], next[target]] = [next[target], next[exIndex]];
        return { ...b, exercises: next };
      })
    );
  };

  const updateExercise = (blockIndex: number, exIndex: number, field: keyof BuilderExercise, value: any) => {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIndex
          ? { ...b, exercises: b.exercises.map((ex, j) => (j === exIndex ? { ...ex, [field]: value } : ex)) }
          : b
      )
    );
  };

  const toInt = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };

  const save = async (): Promise<boolean> => {
    if (!form.title.trim()) {
      setErrorMsg('TITLE IS REQUIRED.');
      return false;
    }
    if (blocks.some((b) => !b.name.trim())) {
      setErrorMsg('EVERY BLOCK NEEDS A NAME.');
      return false;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveStandaloneWorkout({
        id: editingId === 'new' ? null : editingId,
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category || null,
        difficulty: form.difficulty || null,
        format: form.kind === 'quick_workout' ? form.format : null,
        duration_minutes: form.kind === 'quick_workout' ? toInt(form.duration_minutes) : null,
        is_free: form.is_free,
        status: form.status,
        cover_image_url: coverImageUrl,
        blocks: blocks.map((b, bi) => ({
          name: b.name.trim(),
          order_index: bi,
          exercises: b.exercises.map((ex, i) => ({
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
      });
      cancelEdit();
      await loadWorkouts();
      return true;
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO SAVE WORKOUT.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteStandaloneWorkout(id);
      await loadWorkouts();
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO DELETE WORKOUT.');
    } finally {
      setDeletingId(null);
    }
  };

  return {
    workouts, loading, errorMsg, setErrorMsg, loadWorkouts,
    editingId, formLoading, form, updateForm, blocks,
    startNew, startEdit, cancelEdit, saving, deletingId,
    addBlock, removeBlock, moveBlock, updateBlockName,
    pickerVisible, setPickerVisible, openPicker,
    searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
    exerciseLibrary, libraryLoading, categories: CATEGORIES,
    addExercise, removeExercise, moveExercise, updateExercise,
    save, remove,
  };
}
