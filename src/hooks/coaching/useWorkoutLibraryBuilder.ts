// State/logic behind WorkoutLibraryBuilderScreen — the admin-only authoring
// UI for standalone_workouts/standalone_workout_exercises (Workouts + Quick
// Workouts). Deliberately simpler than useProgramBuilder: one flat ordered
// exercise list per workout, no weeks/days/blocks, so this reuses
// ExercisePickerModal as-is but skips useProgramBuilder's block-tree state
// entirely.

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
  const [exercises, setExercises] = useState<BuilderExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
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
    setExercises([]);
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
      setExercises(
        detail.exercises.map((ex) => ({
          exercise_id: ex.exercise_id,
          name: ex.name,
          sets: ex.sets != null ? String(ex.sets) : '',
          reps: ex.reps != null ? String(ex.reps) : '',
          rest_seconds: ex.rest_seconds != null ? String(ex.rest_seconds) : '',
          hold_seconds: ex.hold_seconds != null ? String(ex.hold_seconds) : '',
          work_seconds: ex.work_seconds != null ? String(ex.work_seconds) : '',
          is_weighted: ex.is_weighted,
          notes: ex.notes || '',
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
    setExercises([]);
  };

  const updateForm = (field: keyof typeof EMPTY_FORM, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openPicker = () => {
    setPickerVisible(true);
    if (exerciseLibrary.length === 0) fetchExerciseLibrary();
  };

  const addExercise = (item: ExerciseLibraryItem) => {
    setExercises((prev) => [
      ...prev,
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
    ]);
    setPickerVisible(false);
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const moveExercise = (index: number, direction: -1 | 1) => {
    setExercises((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateExercise = (index: number, field: keyof BuilderExercise, value: any) => {
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)));
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
        exercises: exercises.map((ex, i) => ({
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
    editingId, formLoading, form, updateForm, exercises,
    startNew, startEdit, cancelEdit, saving, deletingId,
    pickerVisible, setPickerVisible, openPicker,
    searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
    exerciseLibrary, libraryLoading, categories: CATEGORIES,
    addExercise, removeExercise, moveExercise, updateExercise,
    save, remove,
  };
}
