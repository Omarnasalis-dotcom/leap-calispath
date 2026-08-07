import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, PlayCircle } from 'lucide-react';
import { BlockConceptParser, type ConceptMetadata } from '@/shared/BlockConceptParser';
import { VideoModal } from '@/components/VideoModal';
import type { BuilderExercise, ExerciseOption } from './types';

function StatField({
  label,
  value,
  title,
  ariaLabel,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="label" style={{ fontSize: 10 }}>
        {label}
      </span>
      <input
        className="field num"
        style={{ width: '100%', padding: '6px 8px' }}
        type="number"
        min={0}
        title={title}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        aria-label={ariaLabel}
      />
    </label>
  );
}

export function ExerciseRow({
  exercise,
  exerciseOptions,
  blockMetadata,
  readOnly,
  onChange,
  onRemove,
}: {
  exercise: BuilderExercise;
  exerciseOptions: ExerciseOption[];
  blockMetadata: ConceptMetadata;
  readOnly?: boolean;
  onChange: (patch: Partial<BuilderExercise>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.id,
    disabled: readOnly,
  });

  // Mirrors mobile's BuilderExerciseRow.tsx exactly: which stat fields make
  // sense depends on the block's timing/structure, not the exercise itself.
  // Tabata's work/rest interval and a ladder's rep sequence are both set once
  // at the block level (ConceptWizard) and apply to every exercise in the
  // block, so per-exercise Sets/Rest/Hold would be redundant or meaningless
  // there — only "single" gets the full grid; superset/circuit fall back to
  // one flexible "target reps / work details" field.
  const isSingle =
    !blockMetadata.structure && !blockMetadata.type
      ? true
      : blockMetadata.structure === 'single' || blockMetadata.type === 'single';
  const isTabata = blockMetadata.timing_system === 'tabata';
  const isLadder = !isTabata && blockMetadata.structure === 'ladder';

  const [videoOpen, setVideoOpen] = useState(false);
  // The dropdown only offers exercises the viewer can pick, but the
  // currently-selected one always stays resolvable (name, video button)
  // even if it isn't pickable — otherwise an existing block built from
  // someone else's exercise would silently lose its selection the moment
  // this scoping shipped.
  const selected = exerciseOptions.find((o) => o.id === exercise.exercise_id);
  const pickableOptions = exerciseOptions.filter((o) => o.pickable || o.id === exercise.exercise_id);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        background: 'var(--bg-panel)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius)',
      }}
      data-testid="exercise-row"
    >
      <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
        <button
          type="button"
          className="btn icon ghost"
          style={{ cursor: 'grab' }}
          aria-label="Drag to reorder exercise"
          {...attributes}
          {...listeners}
        >
          <GripVertical />
        </button>
        <select
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          value={exercise.exercise_id}
          disabled={readOnly}
          onChange={(e) => onChange({ exercise_id: e.target.value })}
          aria-label="Exercise"
          title={exercise.exercise_name || undefined}
        >
          <option value="">Exercise…</option>
          {pickableOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {selected?.youtube_url && (
          <button
            type="button"
            className="btn icon"
            title="Watch exercise demo"
            aria-label="Watch exercise demo"
            onClick={() => setVideoOpen(true)}
          >
            <PlayCircle />
          </button>
        )}
        <button
          className="btn icon"
          disabled={readOnly}
          title="Remove exercise"
          onClick={onRemove}
          aria-label="Remove exercise"
        >
          <X />
        </button>
      </div>
      {videoOpen && selected?.youtube_url && (
        <VideoModal url={selected.youtube_url} name={selected.name} onClose={() => setVideoOpen(false)} />
      )}
      {isTabata ? (
        <div className="field" style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 700 }}>
          {blockMetadata.tabata_work_seconds || 20}S WORK / {blockMetadata.tabata_rest_seconds || 10}S REST
        </div>
      ) : isSingle ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <StatField
            label="Sets"
            title="Sets"
            ariaLabel="Sets"
            value={exercise.sets}
            disabled={readOnly}
            onChange={(v) => onChange({ sets: v })}
          />
          <StatField
            label="Reps"
            title="Reps"
            ariaLabel="Reps"
            value={exercise.reps}
            disabled={readOnly}
            onChange={(v) => onChange({ reps: v })}
          />
          <StatField
            label="Rest"
            title="Rest seconds"
            ariaLabel="Rest seconds"
            value={exercise.rest_seconds}
            disabled={readOnly}
            onChange={(v) => onChange({ rest_seconds: v })}
          />
          <StatField
            label="Hold"
            title="Hold seconds"
            ariaLabel="Hold seconds"
            value={exercise.hold_seconds}
            disabled={readOnly}
            onChange={(v) => onChange({ hold_seconds: v })}
          />
        </div>
      ) : isLadder ? (
        <div className="field" style={{ textAlign: 'center', color: 'var(--warn)', fontWeight: 700 }}>
          {BlockConceptParser.getLadderSequence(blockMetadata) || 'Set ladder rounds/start above'}
        </div>
      ) : (
        <StatField
          label="Target reps"
          title="Target reps for this exercise within the block's rounds"
          ariaLabel="Target reps"
          value={exercise.reps}
          disabled={readOnly}
          onChange={(v) => onChange({ reps: v })}
        />
      )}
      <input
        className="field"
        style={{ fontSize: 12 }}
        placeholder="Execution notes, tempo, weights, or details…"
        value={exercise.notes}
        disabled={readOnly}
        onChange={(e) => onChange({ notes: e.target.value })}
        aria-label="Exercise notes"
      />
    </div>
  );
}
