import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteProgramTemplate,
  fetchAssignedTemplateIds,
  fetchExercises,
  fetchProgramTemplates,
} from '@/api/coaching';
import { formatDate } from '@/shared/constants';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { useBuilderClipboard } from '@/contexts/BuilderClipboardContext';
import { loadTemplateWeeks, saveTemplateWeeks } from './builder/builderIO';
import { LibraryTab } from './builder/LibraryTab';
import { WeekGrid } from './builder/WeekGrid';
import type { BuilderWeeks } from './builder/types';

type ListTab = 'master' | 'assigned' | 'library';

export function ProgramBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [tab, setTab] = useState<ListTab>('master');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState<BuilderWeeks>({ 1: [] });
  const [activeWeek, setActiveWeek] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const clipboard = useBuilderClipboard();

  const templatesQ = useQuery({ queryKey: ['program-templates'], queryFn: fetchProgramTemplates });
  const assignedIdsQ = useQuery({ queryKey: ['assigned-template-ids'], queryFn: fetchAssignedTemplateIds });
  const exercisesQ = useQuery({ queryKey: ['exercises'], queryFn: fetchExercises });
  const exerciseOptions = useMemo(
    () => (exercisesQ.data ?? []).map((e) => ({ id: e.id, name: e.name })),
    [exercisesQ.data],
  );

  const loadQ = useQuery({
    queryKey: ['template-weeks', selectedId],
    queryFn: () => loadTemplateWeeks(selectedId as string),
    enabled: !!selectedId && selectedId !== 'new',
  });

  useEffect(() => {
    if (selectedId === 'new') {
      setName('');
      setDescription('');
      setWeeks({ 1: [] });
      setActiveWeek(1);
      setDirty(false);
      setSaveError(null);
    } else if (loadQ.data) {
      setName(loadQ.data.name);
      setDescription(loadQ.data.description);
      setWeeks(loadQ.data.weeks);
      setActiveWeek(Math.min(...Object.keys(loadQ.data.weeks).map(Number)));
      setDirty(false);
      setSaveError(null);
    }
  }, [selectedId, loadQ.data]);

  const weekNums = useMemo(
    () => Object.keys(weeks).map(Number).sort((a, b) => a - b),
    [weeks],
  );
  const days = weeks[activeWeek] ?? [];

  function setDays(next: typeof days) {
    setWeeks((w) => ({ ...w, [activeWeek]: next }));
    setDirty(true);
  }

  function duplicateWeek() {
    const nextNum = Math.max(...weekNums, 0) + 1;
    const cloned = days.map((d) => ({
      ...d,
      id: `${d.id}-w${nextNum}-${Math.random().toString(36).slice(2, 7)}`,
      blocks: d.blocks.map((b) => ({
        ...b,
        id: `${b.id}-w${nextNum}-${Math.random().toString(36).slice(2, 7)}`,
        db_id: null,
        exercises: b.exercises.map((e) => ({ ...e, id: `${e.id}-${Math.random().toString(36).slice(2, 7)}` })),
      })),
    }));
    setWeeks((w) => ({ ...w, [nextNum]: cloned }));
    setActiveWeek(nextNum);
    setDirty(true);
  }

  function deleteWeek() {
    setWeeks((w) => {
      const remaining = Object.keys(w).map(Number).filter((n) => n !== activeWeek).sort((a, b) => a - b);
      const next: BuilderWeeks = {};
      remaining.forEach((n, i) => {
        next[i + 1] = w[n];
      });
      if (Object.keys(next).length === 0) next[1] = [];
      return next;
    });
    setActiveWeek((w) => Math.max(1, w - 1));
    setDirty(true);
  }

  const deleteMutation = useMutation({
    mutationFn: deleteProgramTemplate,
    onSuccess: () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['program-templates'] });
      void queryClient.invalidateQueries({ queryKey: ['assigned-template-ids'] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveTemplateWeeks({
        templateId: selectedId === 'new' ? null : (selectedId as string),
        name,
        description,
        weeks,
      }),
    onSuccess: (result) => {
      setSaveError(null);
      setDirty(false);
      setSelectedId(result.templateId);
      setFlash(
        result.undeletableCount > 0
          ? `Saved — ${result.undeletableCount} removed block(s) kept (already logged by a warrior)`
          : 'Saved',
      );
      window.setTimeout(() => setFlash(null), 3000);
      void queryClient.invalidateQueries({ queryKey: ['program-templates'] });
      void queryClient.invalidateQueries({ queryKey: ['template-weeks', result.templateId] });
    },
    onError: (err: Error) => setSaveError(err),
  });

  // ---------- list view ----------
  if (!selectedId) {
    const master = (templatesQ.data ?? []).filter(
      (t) => !t.is_library_template && !assignedIdsQ.data?.has(t.id),
    );
    const assigned = (templatesQ.data ?? []).filter(
      (t) => !t.is_library_template && assignedIdsQ.data?.has(t.id),
    );
    const library = (templatesQ.data ?? []).filter((t) => t.is_library_template);
    const rows = tab === 'master' ? master : tab === 'assigned' ? assigned : [];

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Program builder</h1>
            <div className="sub">Master templates and client copies, every coach.</div>
          </div>
          <button className="btn primary" onClick={() => setSelectedId('new')}>
            + New template
          </button>
        </div>
        {templatesQ.error && <ErrorNote error={templatesQ.error} />}
        {deleteMutation.error && <ErrorNote error={deleteMutation.error} />}

        <div className="row">
          <button className={`btn small${tab === 'master' ? ' primary' : ''}`} onClick={() => setTab('master')}>
            Master templates ({master.length})
          </button>
          <button className={`btn small${tab === 'assigned' ? ' primary' : ''}`} onClick={() => setTab('assigned')}>
            Assigned copies ({assigned.length})
          </button>
          <button className={`btn small${tab === 'library' ? ' primary' : ''}`} onClick={() => setTab('library')}>
            Library ({library.length})
          </button>
        </div>

        {tab === 'library' ? (
          <LibraryTab onSelectTemplate={setSelectedId} />
        ) : (
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
                  {rows.map((t) => (
                    <tr key={t.id} className="clickable" onClick={() => setSelectedId(t.id)}>
                      <td style={{ fontWeight: 700 }}>{t.name}</td>
                      <td className="dim">{t.coach_name ?? '—'}</td>
                      <td>
                        <Badge tone={t.status === 'published' ? 'ok' : undefined}>{t.status ?? 'draft'}</Badge>
                      </td>
                      <td className="dim">{formatDate(t.created_at)}</td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <ConfirmButton
                          label="Delete"
                          danger
                          title={`Delete template "${t.name}"?`}
                          body="Blocks with logged workouts will refuse to delete — client copies are separate rows and stay intact."
                          confirmLabel="Delete"
                          onConfirm={() => deleteMutation.mutateAsync(t.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!templatesQ.isLoading && rows.length === 0 && (
                <div className="empty">
                  <span className="label">Nothing here</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- editor view ----------
  return (
    <div className="page wide">
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 280 }}>
          <button className="btn small" style={{ marginBottom: 8 }} onClick={() => setSelectedId(null)}>
            ← Templates
          </button>
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
          {flash && <Badge tone="ok">{flash}</Badge>}
          {dirty && !flash && <Badge tone="warn">unsaved</Badge>}
          {clipboard.clipboard && (
            <Badge tone="accent">clipboard: {clipboard.clipboard.type}</Badge>
          )}
          <button
            className="btn primary"
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>

      {loadQ.error && <ErrorNote error={loadQ.error} />}
      {saveError && <ErrorNote error={saveError} />}
      {loadQ.isLoading && selectedId !== 'new' && <div className="skeleton" style={{ height: 160 }} />}

      <div className="row" style={{ borderBottom: '1px solid var(--hairline)', paddingBottom: 10 }}>
        {weekNums.map((w) => (
          <button
            key={w}
            className={`btn small${w === activeWeek ? ' primary' : ''}`}
            onClick={() => setActiveWeek(w)}
          >
            Week {w}
          </button>
        ))}
        <button className="btn small" onClick={duplicateWeek}>
          + Duplicate week
        </button>
        {weekNums.length > 1 && (
          <ConfirmButton
            label="Delete week"
            danger
            title={`Delete week ${activeWeek}?`}
            body="Removes every day and block in this week."
            confirmLabel="Delete"
            onConfirm={deleteWeek}
          />
        )}
      </div>

      <WeekGrid days={days} exerciseOptions={exerciseOptions} onCommit={setDays} />
    </div>
  );
}
