import type { ClipboardDay, ClipboardWeek } from '@/contexts/BuilderClipboardContext';
import { clientKey, type BuilderDay } from './types';

/** A day as the shared builder clipboard stores it: no client keys or db ids. */
export function toClipboardDay(day: BuilderDay): ClipboardDay {
  return {
    name: day.name,
    focus_tag: day.focus_tag,
    blocks: day.blocks.map((b) => ({
      name: b.name,
      notes: b.notes,
      metadata: { ...b.metadata },
      exercises: b.exercises.map((e) => ({
        exercise_id: e.exercise_id,
        exercise_name: e.exercise_name,
        sets: e.sets,
        reps: e.reps,
        rest_seconds: e.rest_seconds,
        hold_seconds: e.hold_seconds,
        is_weighted: e.is_weighted,
        notes: e.notes,
      })),
    })),
  };
}

/** A new, unsaved day from the clipboard. A pasted day is marked "(copy)";
 * a pasted week keeps its day names, since it is a week of its own. */
export function fromClipboardDay(data: ClipboardDay, opts: { keepName?: boolean } = {}): BuilderDay {
  return {
    id: clientKey(),
    name: opts.keepName ? data.name : `${data.name} (copy)`,
    focus_tag: data.focus_tag,
    blocks: data.blocks.map((b) => ({
      id: clientKey(),
      db_id: null,
      name: b.name,
      notes: b.notes,
      metadata: { ...b.metadata },
      exercises: b.exercises.map((e) => ({ ...e, id: clientKey(), notes: e.notes ?? '' })),
    })),
  };
}

export function toClipboardWeek(days: BuilderDay[]): ClipboardWeek {
  return { days: days.map(toClipboardDay) };
}

export function fromClipboardWeek(week: ClipboardWeek): BuilderDay[] {
  return week.days.map((d) => fromClipboardDay(d, { keepName: true }));
}
