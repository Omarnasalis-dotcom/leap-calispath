import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteExercise,
  fetchExercises,
  saveExercise,
  type Exercise,
} from '@/api/coaching';
import { DataTable, type Column } from '@/components/DataTable';
import { ConfirmButton, ErrorNote } from '@/components/bits';

interface Draft {
  id?: string;
  name: string;
  youtube_url: string;
  category: string;
  difficulty: string;
}

const EMPTY: Draft = { name: '', youtube_url: '', category: '', difficulty: '' };

export function ExerciseLibraryPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['exercises'],
    queryFn: fetchExercises,
  });

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      saveExercise({
        id: d.id,
        name: d.name.trim(),
        youtube_url: d.youtube_url.trim() || null,
        category: d.category.trim() || null,
        difficulty: d.difficulty.trim() || null,
      }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: deleteExercise,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });

  const filtered = data?.filter(
    (e) =>
      !filter ||
      e.name.toLowerCase().includes(filter.toLowerCase()) ||
      (e.category ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  const columns: Column<Exercise>[] = [
    {
      key: 'name',
      header: 'Exercise',
      render: (e) => <span style={{ fontWeight: 700 }}>{e.name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (e) => <span className="dim">{e.category ?? '—'}</span>,
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      render: (e) => <span className="dim">{e.difficulty ?? '—'}</span>,
    },
    {
      key: 'video',
      header: 'Video',
      render: (e) =>
        e.youtube_url ? (
          <a href={e.youtube_url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
            link
          </a>
        ) : (
          <span className="dim">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          <button
            className="btn small"
            onClick={(ev) => {
              ev.stopPropagation();
              setDraft({
                id: e.id,
                name: e.name,
                youtube_url: e.youtube_url ?? '',
                category: e.category ?? '',
                difficulty: e.difficulty ?? '',
              });
            }}
          >
            Edit
          </button>
          <ConfirmButton
            label="Delete"
            danger
            title={`Delete “${e.name}”?`}
            body="Programs already referencing it keep their rows; it just leaves the library."
            confirmLabel="Delete"
            onConfirm={() => removeMutation.mutateAsync(e.id)}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Exercise library</h1>
          <div className="sub num">{data ? `${data.length} exercises` : ' '}</div>
        </div>
        <div className="row">
          <input
            className="field"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter exercises"
          />
          <button className="btn primary" onClick={() => setDraft({ ...EMPTY })}>
            + New exercise
          </button>
        </div>
      </div>

      {error && <ErrorNote error={error} />}
      {saveMutation.error && <ErrorNote error={saveMutation.error} />}
      {removeMutation.error && <ErrorNote error={removeMutation.error} />}

      {draft && (
        <section className="panel">
          <div className="panel-head">
            <h2>{draft.id ? 'Edit exercise' : 'New exercise'}</h2>
          </div>
          <div className="panel-body row" style={{ alignItems: 'flex-end' }}>
            <input
              className="field"
              style={{ flex: 2, minWidth: 160 }}
              placeholder="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              aria-label="Exercise name"
            />
            <input
              className="field"
              style={{ flex: 1, minWidth: 120 }}
              placeholder="Category"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              aria-label="Exercise category"
            />
            <input
              className="field"
              style={{ flex: 1, minWidth: 120 }}
              placeholder="Difficulty"
              value={draft.difficulty}
              onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
              aria-label="Exercise difficulty"
            />
            <input
              className="field"
              style={{ flex: 2, minWidth: 180 }}
              placeholder="YouTube URL"
              value={draft.youtube_url}
              onChange={(e) => setDraft({ ...draft, youtube_url: e.target.value })}
              aria-label="Exercise video URL"
            />
            <button
              className="btn primary"
              disabled={!draft.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate(draft)}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="panel">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(e) => e.id}
          loading={isLoading}
          emptyLabel="No exercises"
          emptyHint="Add the first movement to the shared library."
        />
      </div>
    </div>
  );
}
