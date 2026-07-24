import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BlockConceptParser } from '@/shared/BlockConceptParser';
import { useBuilderClipboard, type ClipboardBlock } from '@/contexts/BuilderClipboardContext';
import { ConceptWizard } from './ConceptWizard';
import { ExerciseRow } from './ExerciseRow';
import { clientKey, newBlock, type BuilderBlock } from './types';

function toClipboardBlock(block: BuilderBlock): ClipboardBlock {
  return {
    name: block.name,
    notes: block.notes,
    metadata: { ...block.metadata },
    exercises: block.exercises.map((e) => ({
      exercise_id: e.exercise_id,
      exercise_name: e.exercise_name,
      sets: e.sets,
      reps: e.reps,
      rest_seconds: e.rest_seconds,
      hold_seconds: e.hold_seconds,
      notes: e.notes,
    })),
  };
}

export function fromClipboardBlock(data: ClipboardBlock): BuilderBlock {
  return {
    id: clientKey(),
    db_id: null,
    name: `${data.name} (copy)`,
    notes: data.notes,
    metadata: { ...data.metadata },
    exercises: data.exercises.map((e) => ({ ...e, id: clientKey(), notes: e.notes ?? '' })),
  };
}

export function BlockCard({
  block,
  exerciseOptions,
  onChange,
  onRemove,
  onPasteAfter,
}: {
  block: BuilderBlock;
  exerciseOptions: Array<{ id: string; name: string }>;
  onChange: (patch: Partial<BuilderBlock>) => void;
  onRemove: () => void;
  onPasteAfter: (block: BuilderBlock) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const clipboard = useBuilderClipboard();
  const [expanded, setExpanded] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onExerciseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = block.exercises.findIndex((ex) => ex.id === active.id);
    const newIndex = block.exercises.findIndex((ex) => ex.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ exercises: arrayMove(block.exercises, oldIndex, newIndex) });
  }

  const canPaste = clipboard.clipboard?.type === 'block';

  return (
    <div
      ref={setNodeRef}
      className="panel"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        // One tone lighter than the day column's own --surface, so a block
        // reads as nested inside its day rather than blending into it.
        background: 'var(--surface-2)',
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
            aria-label="Drag to reorder block"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <input
            className="field"
            style={{ flex: 1, fontWeight: 700 }}
            placeholder="Block name"
            value={block.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-label="Block name"
          />
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn small" onClick={() => clipboard.copyBlock(toClipboardBlock(block))}>
            Copy
          </button>
          <button
            className="btn small"
            onClick={() => clipboard.cutBlock(toClipboardBlock(block), onRemove)}
          >
            Cut
          </button>
          <button
            className="btn small"
            disabled={!canPaste}
            title={canPaste ? 'Paste a new block after this one' : 'Clipboard is empty'}
            onClick={() => {
              if (clipboard.clipboard?.type === 'block') {
                onPasteAfter(fromClipboardBlock(clipboard.clipboard.data));
              }
            }}
          >
            Paste
          </button>
          <button className="btn small danger" onClick={onRemove} aria-label="Delete block">
            Delete
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          className="label"
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onClick={() => setExpanded((v) => !v)}
        >
          {BlockConceptParser.getSubtitle(
            block.metadata,
            block.exercises.map((e) => e.exercise_name || '?'),
          )}{' '}
          {expanded ? '▲' : '▼ edit'}
        </button>

        {expanded && (
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
            <ConceptWizard
              metadata={block.metadata}
              onChange={(m) => onChange({ metadata: m })}
              exerciseCount={block.exercises.length}
            />
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onExerciseDragEnd}>
          <SortableContext items={block.exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {block.exercises.map((ex) => (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  exerciseOptions={exerciseOptions}
                  blockMetadata={block.metadata}
                  onChange={(patch) =>
                    onChange({
                      exercises: block.exercises.map((x) => (x.id === ex.id ? { ...x, ...patch } : x)),
                    })
                  }
                  onRemove={() => onChange({ exercises: block.exercises.filter((x) => x.id !== ex.id) })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          className="btn small"
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            onChange({
              exercises: [
                ...block.exercises,
                { id: clientKey(), exercise_id: '', sets: 3, reps: null, rest_seconds: null, hold_seconds: null, notes: '' },
              ],
            })
          }
        >
          + Exercise
        </button>
      </div>
    </div>
  );
}

export { newBlock };
