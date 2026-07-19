import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteProgramTemplate,
  fetchExercises,
  fetchProgramTemplates,
  fetchTemplateBlocks,
  saveProgramTemplate,
  type BlockExercise,
  type ProgramBlock,
} from '@/api/coaching';
import { formatDate } from '@/shared/constants';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';

let localKey = 0;
const nextKey = () => `local-${++localKey}`;

function ExerciseRow({
  ex,
  onChange,
  onRemove,
  exerciseOptions,
}: {
  ex: BlockExercise;
  onChange: (patch: Partial<BlockExercise>) => void;
  onRemove: () => void;
  exerciseOptions: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
      <select
        className="field"
        style={{ flex: 2, minWidth: 140 }}
        value={ex.exercise_id}
        onChange={(e) => onChange({ exercise_id: e.target.value })}
        aria-label="Exercise"
      >
        <option value="">Exercise…</option>
        {exerciseOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <input
        className="field num"
        style={{ width: 58 }}
        type="number"
        min={0}
        placeholder="Sets"
        title="Sets"
        value={ex.sets ?? ''}
        onChange={(e) => onChange({ sets: e.target.value === '' ? null : Number(e.target.value) })}
        aria-label="Sets"
      />
      <input
        className="field num"
        style={{ width: 58 }}
        type="number"
        min={0}
        placeholder="Reps"
        title="Reps"
        value={ex.reps ?? ''}
        onChange={(e) => onChange({ reps: e.target.value === '' ? null : Number(e.target.value) })}
        aria-label="Reps"
      />
      <input
        className="field num"
        style={{ width: 66 }}
        type="number"
        min={0}
        placeholder="Rest s"
        title="Rest seconds"
        value={ex.rest_seconds ?? ''}
        onChange={(e) =>
          onChange({ rest_seconds: e.target.value === '' ? null : Number(e.target.value) })
        }
        aria-label="Rest seconds"
      />
      <input
        className="field num"
        style={{ width: 66 }}
        type="number"
        min={0}
        placeholder="Hold s"
        title="Hold seconds"
        value={ex.hold_seconds ?? ''}
        onChange={(e) =>
          onChange({ hold_seconds: e.target.value === '' ? null : Number(e.target.value) })
        }
        aria-label="Hold seconds"
      />
      <button className="btn small" onClick={onRemove} aria-label="Remove exercise">
        ✕
      </button>
    </div>
  );
}

export function ProgramBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<ProgramBlock[]>([]);
  const [dirty, setDirty] = useState(false);

  const templatesQ = useQuery({
    queryKey: ['program-templates'],
    queryFn: fetchProgramTemplates,
  });
  const exercisesQ = useQuery({ queryKey: ['exercises'], queryFn: fetchExercises });
  const blocksQ = useQuery({
    queryKey: ['template-blocks', selectedId],
    queryFn: () => fetchTemplateBlocks(selectedId as string),
    enabled: !!selectedId && selectedId !== 'new',
  });

  const selected = templatesQ.data?.find((t) => t.id === selectedId);

  // seed editor when a template is opened
  useEffect(() => {
    if (selectedId === 'new') {
      setName('');
      setDescription('');
      setBlocks([]);
      setDirty(false);
    } else if (selected && blocksQ.data) {
      setName(selected.name);
      setDescription(selected.description ?? '');
      setBlocks(blocksQ.data);
      setDirty(false);
    }
  }, [selectedId, selected, blocksQ.data]);

  const weeks = useMemo(() => {
    const nums = [...new Set(blocks.map((b) => b.week_number))].sort((a, b) => a - b);
    return nums.length > 0 ? nums : [];
  }, [blocks]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveProgramTemplate({
        templateId: selectedId === 'new' ? null : (selectedId as string),
        name: name.trim(),
        description: description.trim() || null,
        blocks: blocks.map((b) => ({
          ...b,
          exercises: b.exercises.filter((e) => e.exercise_id),
        })),
      }),
    onSuccess: (templateId) => {
      setDirty(false);
      setSelectedId(templateId);
      void queryClient.invalidateQueries({ queryKey: ['program-templates'] });
      void queryClient.invalidateQueries({ queryKey: ['template-blocks', templateId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProgramTemplate,
    onSuccess: () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['program-templates'] });
    },
  });

  function patchBlock(id: string, patch: Partial<ProgramBlock>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setDirty(true);
  }

  function addBlock(week: number) {
    setBlocks((bs) => [
      ...bs,
      {
        id: nextKey(),
        db_id: null,
        name: `Day ${bs.filter((b) => b.week_number === week).length + 1}`,
        notes: null,
        week_number: week,
        order_index: bs.length,
        exercises: [],
      },
    ]);
    setDirty(true);
  }

  function addWeek() {
    const next = weeks.length > 0 ? Math.max(...weeks) + 1 : 1;
    addBlock(next);
  }

  const exerciseOptions = (exercisesQ.data ?? []).map((e) => ({ id: e.id, name: e.name }));

  // ---------- template list view ----------
  if (!selectedId) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Program builder</h1>
            <div className="sub">Every coach's templates, plus the shared library.</div>
          </div>
          <button className="btn primary" onClick={() => setSelectedId('new')}>
            + New template
          </button>
        </div>
        {templatesQ.error && <ErrorNote error={templatesQ.error} />}
        {deleteMutation.error && <ErrorNote error={deleteMutation.error} />}
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Coach</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templatesQ.isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5}>
                        <div className="skeleton" style={{ height: 14 }} />
                      </td>
                    </tr>
                  ))}
                {templatesQ.data?.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => setSelectedId(t.id)}>
                    <td style={{ fontWeight: 700 }}>
                      {t.name}{' '}
                      {t.is_library_template && <Badge tone="accent">library</Badge>}
                    </td>
                    <td className="dim">{t.coach_name ?? '—'}</td>
                    <td>
                      <Badge tone={t.status === 'published' ? 'ok' : undefined}>
                        {t.status ?? 'draft'}
                      </Badge>
                    </td>
                    <td className="dim">{formatDate(t.created_at)}</td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <ConfirmButton
                        label="Delete"
                        danger
                        title={`Delete template “${t.name}”?`}
                        body="Blocks with logged workouts will refuse to delete — assigned client programs are separate copies and stay intact."
                        confirmLabel="Delete"
                        onConfirm={() => deleteMutation.mutateAsync(t.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {templatesQ.data && templatesQ.data.length === 0 && (
              <div className="empty">
                <span className="label">No templates</span>
                Create the first program template.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- editor view ----------
  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            <button
              className="btn small"
              onClick={() => setSelectedId(null)}
              style={{ marginRight: 8 }}
            >
              ← Templates
            </button>
            {selected?.is_library_template && <Badge tone="accent">library</Badge>}
          </div>
          <input
            className="field"
            style={{ width: '100%', fontSize: 16, fontWeight: 700 }}
            placeholder="Template name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            aria-label="Template name"
          />
          <textarea
            className="field"
            style={{ width: '100%', marginTop: 8 }}
            rows={2}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDirty(true);
            }}
            aria-label="Template description"
          />
        </div>
        <div className="row">
          {dirty && <Badge tone="warn">unsaved</Badge>}
          <button
            className="btn primary"
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>

      {blocksQ.error && <ErrorNote error={blocksQ.error} />}
      {saveMutation.error && <ErrorNote error={saveMutation.error} />}
      {blocksQ.isLoading && selectedId !== 'new' && (
        <div className="skeleton" style={{ height: 160 }} />
      )}

      {weeks.map((week) => (
        <section key={week} className="panel">
          <div className="panel-head">
            <h2>Week {week}</h2>
            <button className="btn small" onClick={() => addBlock(week)}>
              + Add day
            </button>
          </div>
          <div
            className="panel-body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 12,
            }}
          >
            {blocks
              .filter((b) => b.week_number === week)
              .map((b) => (
                <div
                  key={b.id}
                  style={{
                    border: '1px solid var(--hairline)',
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    background: 'var(--bg-panel)',
                  }}
                >
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      placeholder="Day name"
                      value={b.name}
                      onChange={(e) => patchBlock(b.id, { name: e.target.value })}
                      aria-label="Block name"
                    />
                    <button
                      className="btn small"
                      onClick={() => {
                        setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                        setDirty(true);
                      }}
                      aria-label="Remove day"
                    >
                      ✕
                    </button>
                  </div>
                  {b.exercises.map((ex) => (
                    <ExerciseRow
                      key={ex.id}
                      ex={ex}
                      exerciseOptions={exerciseOptions}
                      onChange={(patch) =>
                        patchBlock(b.id, {
                          exercises: b.exercises.map((x) =>
                            x.id === ex.id ? { ...x, ...patch } : x,
                          ),
                        })
                      }
                      onRemove={() =>
                        patchBlock(b.id, {
                          exercises: b.exercises.filter((x) => x.id !== ex.id),
                        })
                      }
                    />
                  ))}
                  <button
                    className="btn small"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() =>
                      patchBlock(b.id, {
                        exercises: [
                          ...b.exercises,
                          {
                            id: nextKey(),
                            exercise_id: '',
                            sets: 3,
                            reps: null,
                            rest_seconds: null,
                            hold_seconds: null,
                            notes: null,
                            order_index: b.exercises.length,
                          },
                        ],
                      })
                    }
                  >
                    + Exercise
                  </button>
                </div>
              ))}
          </div>
        </section>
      ))}

      <div className="row">
        <button className="btn" onClick={addWeek}>
          + Add week
        </button>
      </div>
    </div>
  );
}
