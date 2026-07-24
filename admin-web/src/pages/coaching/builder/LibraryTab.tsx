import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveLibraryTemplate,
  fetchLibraryTemplates,
  saveLibraryCriteria,
  type LibraryTemplateRow,
} from '@/api/coaching';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { useAuth } from '@/auth/AuthProvider';
import { importLibraryTemplate } from '@/shared/TemplateLibraryImport';
import { publishLibraryTemplate } from '@/shared/TemplateLibraryPublish';

function LibraryCriteriaModal({ template }: { template: LibraryTemplateRow }) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [goal, setGoal] = useState(template.matching_criteria?.goal ?? '');
  const [min, setMin] = useState(String(template.matching_criteria?.tier_range?.min ?? ''));
  const [max, setMax] = useState(String(template.matching_criteria?.tier_range?.max ?? ''));
  const [tags, setTags] = useState(template.equipment_tags.join(', '));

  const saveMutation = useMutation({
    mutationFn: () =>
      saveLibraryCriteria(
        template.id,
        { goal: goal.trim(), tier_range: { min: Number(min), max: Number(max) } },
        tags.split(',').map((t) => t.trim()).filter(Boolean),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library-templates'] });
      ref.current?.close();
    },
  });

  return (
    <>
      <button type="button" className="btn small" onClick={() => ref.current?.showModal()}>
        Criteria
      </button>
      <dialog className="confirm" ref={ref}>
        <h2 style={{ marginBottom: 8 }}>Matching criteria — {template.name}</h2>
        {saveMutation.error && <ErrorNote error={saveMutation.error} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 16px' }}>
          <input
            className="field"
            placeholder="Goal (e.g. strength)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            aria-label="Goal"
          />
          <div className="row">
            <input
              className="field"
              style={{ flex: 1 }}
              type="number"
              min={0}
              max={9}
              placeholder="Tier min"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              aria-label="Tier range minimum"
            />
            <input
              className="field"
              style={{ flex: 1 }}
              type="number"
              min={0}
              max={9}
              placeholder="Tier max"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              aria-label="Tier range maximum"
            />
          </div>
          <input
            className="field"
            placeholder="Equipment tags, comma separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-label="Equipment tags"
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn small" onClick={() => ref.current?.close()} disabled={saveMutation.isPending}>
            Cancel
          </button>
          <button
            className="btn small primary"
            disabled={!goal.trim() || min === '' || max === '' || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </dialog>
    </>
  );
}

function PublishButton({ template }: { template: LibraryTemplateRow }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => publishLibraryTemplate(template.id),
    onSuccess: (result) => {
      if (!result.valid) {
        setError(result.error ?? 'Failed to publish');
        return;
      }
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['library-templates'] });
    },
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        className="btn small"
        disabled={template.status === 'published' || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Publishing…' : 'Publish'}
      </button>
      {error && <span className="error-note">{error}</span>}
    </div>
  );
}

function ImportButton() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importLibraryTemplate(data, profile!.id);
      void queryClient.invalidateQueries({ queryKey: ['library-templates'] });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Import failed.'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <span className="row" style={{ gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button type="button" className="btn small" disabled={busy || !profile} onClick={() => inputRef.current?.click()}>
        {busy ? 'Importing…' : 'Import from JSON'}
      </button>
      {error && <ErrorNote error={error} />}
    </span>
  );
}

export function LibraryTab({ onSelectTemplate }: { onSelectTemplate: (id: string) => void }) {
  const queryClient = useQueryClient();
  const libraryQ = useQuery({ queryKey: ['library-templates'], queryFn: fetchLibraryTemplates });

  const archiveMutation = useMutation({
    mutationFn: archiveLibraryTemplate,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['library-templates'] }),
  });

  const rows = libraryQ.data ?? [];

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Library templates</h2>
        <ImportButton />
      </div>
      {libraryQ.error && <ErrorNote error={libraryQ.error} />}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Template</th>
              <th>Coach</th>
              <th>Status</th>
              <th>Criteria</th>
              <th>Weeks / blocks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {libraryQ.isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <div className="skeleton" style={{ height: 14 }} />
                  </td>
                </tr>
              ))}
            {rows.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => onSelectTemplate(t.id)}>
                <td style={{ fontWeight: 700 }}>{t.name}</td>
                <td className="dim">{t.coach_name ?? '—'}</td>
                <td>
                  <Badge tone={t.status === 'published' ? 'ok' : t.status === 'archived' ? 'warn' : undefined}>
                    {t.status ?? 'draft'}
                  </Badge>
                </td>
                <td className="dim">
                  {t.matching_criteria
                    ? `${t.matching_criteria.goal} · T${t.matching_criteria.tier_range.min}-${t.matching_criteria.tier_range.max}`
                    : '—'}
                </td>
                <td className="dim num">
                  {t.week_count}w / {t.block_count}b
                </td>
                <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                  <span className="row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' }}>
                    <LibraryCriteriaModal template={t} />
                    <PublishButton template={t} />
                    <ConfirmButton
                      label="Archive"
                      danger
                      disabled={t.status === 'archived'}
                      title={`Archive "${t.name}"?`}
                      body="Removes it from recommendation matching. Existing client copies already assigned are unaffected."
                      confirmLabel="Archive"
                      onConfirm={() => archiveMutation.mutateAsync(t.id)}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!libraryQ.isLoading && rows.length === 0 && (
          <div className="empty">
            <span className="label">Nothing here</span>
          </div>
        )}
      </div>
    </div>
  );
}
