import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { DayColumn } from './DayColumn';
import { newDay, type BuilderDay, type ExerciseOption } from './types';

const DEFAULT_DAY_WIDTH = 300;

/** One column per real day this week actually has — no fixed weekday
 * enumeration. Real programs (including ones authored on mobile, which
 * still allows any day name/count) can have any number of days named
 * anything; forcing them into 7 fixed weekday-named slots was silently
 * dropping days that didn't match, which looked like "blocks with no
 * exercises" since the whole day never rendered at all. */
export function WeekGrid({
  days,
  exerciseOptions,
  onCommit,
  readOnly,
}: {
  days: BuilderDay[];
  exerciseOptions: ExerciseOption[];
  onCommit: (days: BuilderDay[]) => void;
  readOnly?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Per-day column width, adjustable via the drag handle on each DayColumn.
  // Session-only by design — day.id is a client-side key regenerated on
  // every load (see types.ts), so it can't anchor a persisted preference
  // across reloads; this is a "make room while I'm working on this one"
  // control, not a saved layout setting.
  const [widths, setWidths] = useState<Record<string, number>>({});

  function onDayDragEnd(e: DragEndEvent) {
    if (readOnly) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = days.findIndex((d) => d.id === active.id);
    const newIndex = days.findIndex((d) => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onCommit(arrayMove(days, oldIndex, newIndex));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row">
        <button
          className="btn small"
          disabled={readOnly}
          onClick={() => onCommit([...days, newDay(`Day ${days.length + 1}`)])}
        >
          + Day
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDayDragEnd}>
        <SortableContext items={days.map((d) => d.id)} strategy={rectSortingStrategy}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              overflowX: 'auto',
            }}
          >
            {days.map((day, i) => (
              <DayColumn
                key={day.id}
                day={day}
                exerciseOptions={exerciseOptions}
                width={widths[day.id] ?? DEFAULT_DAY_WIDTH}
                onWidthChange={(w) => setWidths((prev) => ({ ...prev, [day.id]: w }))}
                readOnly={readOnly}
                onChange={(patch) => {
                  const next = [...days];
                  next[i] = { ...next[i], ...patch };
                  onCommit(next);
                }}
                onDelete={() => onCommit(days.filter((_, idx) => idx !== i))}
                onInsertAfter={(inserted) => {
                  const next = [...days];
                  next.splice(i + 1, 0, inserted);
                  onCommit(next);
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
