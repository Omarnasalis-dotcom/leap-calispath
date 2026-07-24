import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bulkCreateExercises,
  deleteExercise,
  fetchExercises,
  saveExercise,
  type Exercise,
} from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { DataTable, type Column } from '@/components/DataTable';
import { ConfirmButton, ErrorNote } from '@/components/bits';

// Must match mobile's newCategory/newConcept enums exactly (src/screens/coaching/ExerciseLibraryScreen.tsx)
// — the two apps read/write the same comma-joined exercise_library.category column.
const CATEGORY_OPTIONS = ['push', 'pull', 'legs', 'core'] as const;
const CONCEPT_OPTIONS = ['skill', 'flexibility', 'strength', 'mobility'] as const;

const BULK_IMPORT_ROW_LIMIT = 200;

const TEMPLATE_CSV =
  'name,youtube_url,category,concept,difficulty\n' +
  'Muscle Up,https://youtube.com/watch?v=1234567,,skill,intermediate\n' +
  'Pancake Stretch,https://youtube.com/watch?v=2345678,,flexibility,beginner\n' +
  'Weighted Pullup,https://youtube.com/watch?v=3456789,,strength,advanced\n' +
  'Scapular Rotations,https://youtube.com/watch?v=4567890,,mobility,beginner\n' +
  'Handstand Pushup,https://youtube.com/watch?v=5678901,push,,advanced\n' +
  'Pullup,https://youtube.com/watch?v=6789012,pull,,intermediate\n' +
  'Pistol Squat,https://youtube.com/watch?v=7890123,legs,,beginner\n' +
  'Hanging Knee Raise,https://youtube.com/watch?v=8901234,core,,beginner\n';

// Mirrors ExerciseLibraryScreen.tsx's isValidYouTubeUrl exactly.
function isValidYouTubeUrl(url: string): boolean {
  const trimmed = url.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const match = withProtocol.match(/^https?:\/\/([^/?#]+)/i);
  if (!match) return false;
  const host = match[1].toLowerCase().replace(/^(www\.|m\.)/, '');
  return host === 'youtube.com' || host === 'youtu.be';
}

// Mirrors ExerciseLibraryScreen.tsx's parseCSV exactly — a minimal quoted-field
// parser, not a full RFC4180 implementation (matches the mobile behavior
// this is round-tripping with, including its same edge-case gaps).
function parseExerciseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      let val = values[index] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      row[header] = val;
    });

    if (row.name && (row.category || row.concept) && row.difficulty) {
      rows.push(row);
    }
  }
  return rows;
}

function downloadTemplateCsv(): void {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'exercise_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function BulkImportModal() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [csvText, setCsvText] = useState('');
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  function reset() {
    setStep(1);
    setCsvText('');
    setPreviewRows([]);
    setParseError(null);
    importMutation.reset();
  }

  function tryParse(text: string) {
    setParseError(null);
    const rows = parseExerciseCSV(text);
    if (rows.length === 0) {
      setParseError('No valid exercise rows found. Each row needs a name, a category or concept, and a difficulty.');
      return;
    }
    setPreviewRows(rows);
    setStep(2);
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (previewRows.length > BULK_IMPORT_ROW_LIMIT) {
        throw new Error(`Maximum ${BULK_IMPORT_ROW_LIMIT} exercises per import — split your CSV into smaller batches.`);
      }
      const rows = previewRows.map((row) => {
        const parts = [row.category?.trim().toLowerCase(), row.concept?.trim().toLowerCase()].filter(Boolean);
        return {
          name: row.name.trim(),
          youtube_url: row.youtube_url && isValidYouTubeUrl(row.youtube_url) ? row.youtube_url.trim() : null,
          category: parts.length ? parts.join(',') : 'push',
          difficulty: (row.difficulty || 'beginner').toLowerCase().trim(),
          created_by: profile!.id,
        };
      });
      await bulkCreateExercises(rows);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercises'] });
      dialogRef.current?.close();
      reset();
    },
  });

  return (
    <>
      <button type="button" className="btn" onClick={() => dialogRef.current?.showModal()}>
        Bulk import
      </button>
      <dialog className="confirm" style={{ maxWidth: 640 }} ref={dialogRef} onClose={reset}>
        <h2 style={{ marginBottom: 8 }}>Bulk import exercises</h2>

        {step === 1 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 16px' }}>
            <div className="dim" style={{ fontSize: 13 }}>
              CSV columns: <code>name, youtube_url, category, concept, difficulty</code>. Each row needs a name, a
              category or concept, and a difficulty.
            </div>
            {parseError && <ErrorNote error={new Error(parseError)} />}
            <div className="row">
              <button type="button" className="btn small" onClick={() => fileInputRef.current?.click()}>
                Choose CSV file…
              </button>
              <button type="button" className="btn small" onClick={downloadTemplateCsv}>
                Download template CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then(tryParse);
                  e.target.value = '';
                }}
              />
            </div>
            <textarea
              className="field"
              rows={6}
              placeholder="…or paste CSV content here"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              aria-label="Paste CSV content"
            />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn small" onClick={() => dialogRef.current?.close()}>
                Cancel
              </button>
              <button type="button" className="btn small primary" onClick={() => tryParse(csvText)}>
                Preview
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 16px' }}>
            {importMutation.error && <ErrorNote error={importMutation.error} />}
            <div className="dim" style={{ fontSize: 13 }}>
              {previewRows.length} exercise{previewRows.length === 1 ? '' : 's'} parsed. Review before importing.
            </div>
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Concept</th>
                    <th>Difficulty</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.name}</td>
                      <td className="dim">{row.category || '—'}</td>
                      <td className="dim">{row.concept || '—'}</td>
                      <td className="dim">{row.difficulty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn small" disabled={importMutation.isPending} onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={importMutation.isPending || !profile}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? 'Importing…' : `Import ${previewRows.length}`}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

interface Draft {
  id?: string;
  name: string;
  youtube_url: string;
  category: string;
  concept: string;
  difficulty: string;
}

const EMPTY: Draft = {
  name: '',
  youtube_url: '',
  category: CATEGORY_OPTIONS[0],
  concept: CONCEPT_OPTIONS[0],
  difficulty: '',
};

// Splits the raw "push,skill" column value into its two parts, matching each half
// against its own enum independently (not positionally) since legacy rows may only
// have one half set. Mirrors ExerciseLibraryScreen.tsx's parse.
function parseCategoryConcept(raw: string | null | undefined): { category: string; concept: string } {
  const parts = (raw ?? '').split(',').map((p) => p.trim().toLowerCase());
  const category = parts.find((p) => (CATEGORY_OPTIONS as readonly string[]).includes(p)) ?? CATEGORY_OPTIONS[0];
  const concept = parts.find((p) => (CONCEPT_OPTIONS as readonly string[]).includes(p)) ?? CONCEPT_OPTIONS[0];
  return { category, concept };
}

function formatCategoryConcept(raw: string | null | undefined): string {
  const parts = (raw ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts.map((p) => p.toUpperCase()).join(' · ') : '—';
}

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
        category: [d.category, d.concept].filter(Boolean).join(',') || null,
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
      render: (e) => <span className="dim">{formatCategoryConcept(e.category)}</span>,
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
                ...parseCategoryConcept(e.category),
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
          <BulkImportModal />
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
            <select
              className="field"
              style={{ flex: 1, minWidth: 110 }}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              aria-label="Exercise category"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              className="field"
              style={{ flex: 1, minWidth: 110 }}
              value={draft.concept}
              onChange={(e) => setDraft({ ...draft, concept: e.target.value })}
              aria-label="Exercise concept"
            >
              {CONCEPT_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
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
