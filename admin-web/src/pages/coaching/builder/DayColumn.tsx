import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Scissors, ClipboardPaste, Eraser, Trash2, GripVertical } from 'lucide-react';
import type { ConceptMetadata } from '@/shared/BlockConceptParser';
import { useBuilderClipboard, type ClipboardDay } from '@/contexts/BuilderClipboardContext';
import { ConfirmButton } from '@/components/bits';
import { BlockCard, fromClipboardBlock } from './BlockCard';
import { clientKey, newBlock, type BuilderDay, type BuilderBlock, type ExerciseOption } from './types';

const FOCUS_TAGS: Array<ConceptMetadata['focus_tag']> = [
  'NONE',
  'PULL',
  'PUSH',
  'LEGS',
  'FULL_BODY',
  'CORE',
];

function toClipboardDay(day: BuilderDay): ClipboardDay {
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
        notes: e.notes,
      })),
    })),
  };
}

function fromClipboardDay(data: ClipboardDay): BuilderDay {
  return {
    id: clientKey(),
    name: `${data.name} (copy)`,
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

const MIN_DAY_WIDTH = 220;
const MAX_DAY_WIDTH = 640;

export function DayColumn({
  day,
  exerciseOptions,
  width,
  onWidthChange,
  readOnly,
  onChange,
  onDelete,
  onInsertAfter,
}: {
  day: BuilderDay;
  exerciseOptions: ExerciseOption[];
  width: number;
  onWidthChange: (width: number) => void;
  readOnly?: boolean;
  onChange: (patch: Partial<BuilderDay>) => void;
  onDelete: () => void;
  onInsertAfter: (day: BuilderDay) => void;
}) {
  const clipboard = useBuilderClipboard();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onResizeStart(e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    function onMove(ev: PointerEvent) {
      const next = Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, startWidth + (ev.clientX - startX)));
      onWidthChange(next);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  const {
    attributes: dayAttributes,
    listeners: dayListeners,
    setNodeRef: setDayNodeRef,
    transform: dayTransform,
    transition: dayTransition,
    isDragging: isDayDragging,
  } = useSortable({ id: day.id, disabled: readOnly });

  function patchBlock(blockId: string, patch: Partial<BuilderBlock>) {
    onChange({ blocks: day.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) });
  }

  function onBlockDragEnd(e: DragEndEvent) {
    if (readOnly) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = day.blocks.findIndex((b) => b.id === active.id);
    const newIndex = day.blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ blocks: arrayMove(day.blocks, oldIndex, newIndex) });
  }

  function insertBlockAfter(afterId: string, block: BuilderBlock) {
    const idx = day.blocks.findIndex((b) => b.id === afterId);
    const next = [...day.blocks];
    next.splice(idx + 1, 0, block);
    onChange({ blocks: next });
  }

  const canPasteBlock = clipboard.clipboard?.type === 'block';
  const canPasteDay = clipboard.clipboard?.type === 'day';

  return (
    <div
      ref={setDayNodeRef}
      className="panel"
      style={{
        transform: CSS.Transform.toString(dayTransform),
        transition: dayTransition,
        opacity: isDayDragging ? 0.5 : 1,
        position: 'relative',
        width,
        flex: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
          <button
            type="button"
            className="btn icon ghost"
            style={{ cursor: 'grab' }}
            aria-label="Drag to reorder this day"
            {...dayAttributes}
            {...dayListeners}
          >
            <GripVertical />
          </button>
          <input
            className="field"
            style={{ flex: 1, fontWeight: 800, fontSize: 13 }}
            value={day.name}
            disabled={readOnly}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-label="Day name"
          />
        </div>
        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          <button
            className="btn icon"
            disabled={readOnly}
            title="Copy day"
            aria-label="Copy day"
            onClick={() => clipboard.copyDay(toClipboardDay(day))}
          >
            <Copy />
          </button>
          <button
            className="btn icon"
            disabled={readOnly}
            title="Cut day"
            aria-label="Cut day"
            onClick={() => clipboard.cutDay(toClipboardDay(day), onDelete)}
          >
            <Scissors />
          </button>
          <button
            className="btn icon"
            disabled={readOnly || !canPasteDay}
            title={canPasteDay ? 'Insert a copy of the clipboard day after this one' : 'Clipboard is empty'}
            aria-label="Paste day after this one"
            onClick={() => {
              if (clipboard.clipboard?.type === 'day') {
                onInsertAfter(fromClipboardDay(clipboard.clipboard.data));
              }
            }}
          >
            <ClipboardPaste />
          </button>
          <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--hairline)', margin: '0 2px' }} />
          <ConfirmButton
            icon={<Eraser />}
            ariaLabel="Clear day"
            danger
            disabled={readOnly || day.blocks.length === 0}
            title={`Clear "${day.name || 'this day'}"?`}
            body="Removes every block and exercise in this day. The day itself stays, but this can't be undone."
            confirmLabel="Clear"
            onConfirm={() => onChange({ blocks: [] })}
          />
          <ConfirmButton
            icon={<Trash2 />}
            ariaLabel="Delete day"
            danger
            disabled={readOnly}
            title={`Delete "${day.name || 'this day'}"?`}
            body="Removes this day and every block and exercise in it. This can't be undone."
            confirmLabel="Delete"
            onConfirm={onDelete}
          />
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select
          className="field"
          value={day.focus_tag ?? 'NONE'}
          disabled={readOnly}
          onChange={(e) => onChange({ focus_tag: e.target.value as ConceptMetadata['focus_tag'] })}
          aria-label="Day focus tag"
        >
          {FOCUS_TAGS.map((t) => (
            <option key={t} value={t}>
              {t === 'NONE' ? 'No focus tag' : t}
            </option>
          ))}
        </select>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onBlockDragEnd}>
          <SortableContext items={day.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {day.blocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  exerciseOptions={exerciseOptions}
                  readOnly={readOnly}
                  onChange={(patch) => patchBlock(block.id, patch)}
                  onRemove={() => onChange({ blocks: day.blocks.filter((b) => b.id !== block.id) })}
                  onPasteAfter={(pasted) => insertBlockAfter(block.id, pasted)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn small"
            disabled={readOnly}
            onClick={() => onChange({ blocks: [...day.blocks, newBlock()] })}
          >
            + Block
          </button>
          <button
            className="btn small"
            disabled={readOnly || !canPasteBlock}
            title={canPasteBlock ? 'Paste block into this day' : 'Clipboard is empty'}
            onClick={() => {
              if (clipboard.clipboard?.type === 'block') {
                onChange({ blocks: [...day.blocks, fromClipboardBlock(clipboard.clipboard.data)] });
              }
            }}
          >
            Paste block
          </button>
        </div>
      </div>

      {/* Drag to resize this one day column — width is session-only (see
          WeekGrid), a "make room while I'm working on this one" control.
          Invisible strip until hover, per .day-resize-handle in App.css. */}
      <div
        className="day-resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize this day"
        aria-hidden="true"
      />
    </div>
  );
}
