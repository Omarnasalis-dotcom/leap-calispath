import { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSwappingStrategy } from '@dnd-kit/sortable';
import { DayColumn } from './DayColumn';
import { WEEKDAY_NAMES, newDay, type BuilderDay } from './types';

/** Ensures exactly one day per weekday name for a fixed 7-column grid —
 * synthesizes an empty column for any weekday the program doesn't already
 * have a day for. */
function toSevenColumns(days: BuilderDay[]): BuilderDay[] {
  const byName = new Map(days.map((d) => [d.name.trim().toUpperCase(), d]));
  return WEEKDAY_NAMES.map((wd) => byName.get(wd) ?? { ...newDay(wd), blocks: [] });
}

export function WeekGrid({
  days,
  exerciseOptions,
  onCommit,
}: {
  days: BuilderDay[];
  exerciseOptions: Array<{ id: string; name: string }>;
  /** Receives the full 7-column array on every edit, unfiltered — dropping
   * untouched placeholder days is a save-time concern (see builderIO.ts's
   * saveTemplateWeeks), not a live-editing one. Filtering here would erase
   * a block the instant it's added, before its exercises can be filled in. */
  onCommit: (days: BuilderDay[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const columns = useMemo(() => toSevenColumns(days), [days]);

  function onDayDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = WEEKDAY_NAMES.indexOf(active.id as (typeof WEEKDAY_NAMES)[number]);
    const newIndex = WEEKDAY_NAMES.indexOf(over.id as (typeof WEEKDAY_NAMES)[number]);
    if (oldIndex === -1 || newIndex === -1) return;
    // Swap only content between the two fixed slots — weekday identity
    // (name/position) stays pinned to grid position, never moves.
    const next = [...columns];
    const a = next[oldIndex];
    const b = next[newIndex];
    next[oldIndex] = { ...a, blocks: b.blocks, focus_tag: b.focus_tag };
    next[newIndex] = { ...b, blocks: a.blocks, focus_tag: a.focus_tag };
    onCommit(next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDayDragEnd}>
      <SortableContext items={[...WEEKDAY_NAMES]} strategy={rectSwappingStrategy}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(240px, 1fr))',
            gap: 10,
            overflowX: 'auto',
          }}
        >
          {columns.map((day, i) => (
            <DayColumn
              key={WEEKDAY_NAMES[i]}
              weekday={WEEKDAY_NAMES[i]}
              day={day}
              exerciseOptions={exerciseOptions}
              onChange={(patch) => {
                const next = [...columns];
                next[i] = { ...next[i], ...patch };
                onCommit(next);
              }}
              onRemove={() => {
                const next = [...columns];
                next[i] = { ...next[i], blocks: [] };
                onCommit(next);
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
