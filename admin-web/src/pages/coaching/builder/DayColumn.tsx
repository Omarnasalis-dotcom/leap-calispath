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
import type { ConceptMetadata } from '@/shared/BlockConceptParser';
import { useBuilderClipboard, type ClipboardDay } from '@/contexts/BuilderClipboardContext';
import { BlockCard, fromClipboardBlock } from './BlockCard';
import { clientKey, newBlock, type BuilderDay, type BuilderBlock } from './types';

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

export function DayColumn({
  day,
  exerciseOptions,
  onChange,
  onDelete,
  onInsertAfter,
}: {
  day: BuilderDay;
  exerciseOptions: Array<{ id: string; name: string }>;
  onChange: (patch: Partial<BuilderDay>) => void;
  onDelete: () => void;
  onInsertAfter: (day: BuilderDay) => void;
}) {
  const clipboard = useBuilderClipboard();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const {
    attributes: dayAttributes,
    listeners: dayListeners,
    setNodeRef: setDayNodeRef,
    transform: dayTransform,
    transition: dayTransition,
    isDragging: isDayDragging,
  } = useSortable({ id: day.id });

  function patchBlock(blockId: string, patch: Partial<BuilderBlock>) {
    onChange({ blocks: day.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) });
  }

  function onBlockDragEnd(e: DragEndEvent) {
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
            className="btn small"
            style={{ cursor: 'grab', padding: '4px 8px', flex: 'none' }}
            aria-label="Drag to reorder this day"
            {...dayAttributes}
            {...dayListeners}
          >
            ⠿
          </button>
          <input
            className="field"
            style={{ flex: 1, fontWeight: 800, fontSize: 13 }}
            value={day.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-label="Day name"
          />
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn small" onClick={() => clipboard.copyDay(toClipboardDay(day))}>
            Copy
          </button>
          <button className="btn small" onClick={() => clipboard.cutDay(toClipboardDay(day), onDelete)}>
            Cut
          </button>
          <button
            className="btn small"
            disabled={!canPasteDay}
            title={canPasteDay ? 'Insert a copy of the clipboard day after this one' : 'Clipboard is empty'}
            onClick={() => {
              if (clipboard.clipboard?.type === 'day') {
                onInsertAfter(fromClipboardDay(clipboard.clipboard.data));
              }
            }}
          >
            Paste
          </button>
          <button className="btn small danger" onClick={() => onChange({ blocks: [] })} aria-label="Clear day">
            Clear
          </button>
          <button className="btn small danger" onClick={onDelete} aria-label="Delete day">
            Delete
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select
          className="field"
          value={day.focus_tag ?? 'NONE'}
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
                  onChange={(patch) => patchBlock(block.id, patch)}
                  onRemove={() => onChange({ blocks: day.blocks.filter((b) => b.id !== block.id) })}
                  onPasteAfter={(pasted) => insertBlockAfter(block.id, pasted)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => onChange({ blocks: [...day.blocks, newBlock()] })}>
            + Block
          </button>
          <button
            className="btn small"
            disabled={!canPasteBlock}
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
    </div>
  );
}
