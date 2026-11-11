import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteChallenge,
  fetchEntryCounts,
  fetchTemplates,
  setChallengeActive,
  fetchWeekChallenges,
  saveTemplate,
  upsertChallenges,
  type ChallengeMovement,
  type ChallengeUpsert,
} from '@/api/challenges';
import {
  CHALLENGE_GROUPS,
  currentWeekStart,
  formatDate,
  shiftWeekStart,
} from '@/shared/constants';
import { Badge, ConfirmButton, ErrorNote, PromptButton } from '@/components/bits';
import { MovementsEditor } from '@/components/MovementsEditor';
import { useUnsavedChanges } from '@/components/UnsavedChanges';
import { PageHeader } from '@/components/layout';

interface GroupForm {
  existingId: string | null;
  /** Kept on save: a hidden challenge stays hidden. */
  is_active: boolean;
  title: string;
  description: string;
  scoring_type: 'reps' | 'time';
  time_limit: string; // keep as text for the input; parsed on save
  movements: ChallengeMovement[];
}

const EMPTY_FORM: GroupForm = {
  existingId: null,
  is_active: true,
  title: '',
  description: '',
  scoring_type: 'reps',
  time_limit: '',
  movements: [],
};

export function ChallengeWeekPage() {
  const queryClient = useQueryClient();
  const thisWeek = currentWeekStart();
  const [week, setWeek] = useState(shiftWeekStart(thisWeek, 1)); // default: prep next week
  const [forms, setForms] = useState<Record<number, GroupForm>>({
    1: EMPTY_FORM,
    2: EMPTY_FORM,
    3: EMPTY_FORM,
  });
  const [templateChoice, setTemplateChoice] = useState<Record<number, string>>({});
  const [savedFlash, setSavedFlash] = useState(false);
  // The forms as last loaded, to tell whether anything is unsaved.
  const [seeded, setSeeded] = useState<string | null>(null);

  const weekQ = useQuery({
    queryKey: ['week-challenges', week],
    queryFn: () => fetchWeekChallenges(week),
  });
  const templatesQ = useQuery({ queryKey: ['challenge-templates'], queryFn: fetchTemplates });
  const challengeIds = (weekQ.data ?? []).map((c) => c.id);
  const entriesQ = useQuery({
    queryKey: ['week-challenge-entries', challengeIds],
    queryFn: () => fetchEntryCounts(challengeIds),
    enabled: challengeIds.length > 0,
  });

  // Re-seed the form whenever the fetched week changes.
  useEffect(() => {
    if (!weekQ.data) return;
    const next: Record<number, GroupForm> = { 1: EMPTY_FORM, 2: EMPTY_FORM, 3: EMPTY_FORM };
    for (const c of weekQ.data) {
      next[c.group_id] = {
        existingId: c.id,
        is_active: c.is_active,
        title: c.title,
        description: c.description ?? '',
        scoring_type: c.scoring_type,
        time_limit: c.time_limit != null ? String(c.time_limit) : '',
        movements: c.movements ?? [],
      };
    }
    setForms(next);
    setSeeded(JSON.stringify(next));
  }, [weekQ.data]);

  const dirty = seeded !== null && JSON.stringify(forms) !== seeded;
  const unsaved = useUnsavedChanges(dirty, `the challenges for ${formatDate(week)}`);
  const goToWeek = (w: string) => unsaved.confirmDiscard(() => setWeek(w));

  const saveMutation = useMutation({
    mutationFn: (rows: ChallengeUpsert[]) => upsertChallenges(rows),
    onSuccess: () => {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
      void queryClient.invalidateQueries({ queryKey: ['week-challenges', week] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChallenge(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['week-challenges', week] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
  });

  const activeMutation = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => setChallengeActive(vars.id, vars.isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['week-challenges', week] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
  });

  const templateMutation = useMutation({
    mutationFn: saveTemplate,
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['challenge-templates'] }),
  });

  const filledGroups = useMemo(
    () => CHALLENGE_GROUPS.filter((g) => forms[g.id].title.trim() !== ''),
    [forms],
  );

  function setForm(groupId: number, patch: Partial<GroupForm>) {
    setForms((f) => ({ ...f, [groupId]: { ...f[groupId], ...patch } }));
  }

  function applyTemplate(groupId: number) {
    const tpl = templatesQ.data?.find((t) => t.id === templateChoice[groupId]);
    if (!tpl) return;
    setForm(groupId, {
      title: tpl.title,
      description: tpl.description ?? '',
      scoring_type: tpl.scoring_type,
      time_limit: tpl.time_limit != null ? String(tpl.time_limit) : '',
      movements: tpl.movements ?? [],
    });
  }

  function saveWeek() {
    const rows: ChallengeUpsert[] = filledGroups.map((g) => {
      const f = forms[g.id];
      return {
        group_id: g.id,
        week_start: week,
        title: f.title.trim(),
        description: f.description.trim() || null,
        scoring_type: f.scoring_type,
        time_limit: f.time_limit.trim() === '' ? null : Number(f.time_limit),
        movements: f.movements.filter((m) => m.name.trim() !== ''),
        is_active: f.is_active,
      };
    });
    saveMutation.mutate(rows);
  }

  const isThisWeek = week === thisWeek;
  const isNextWeek = week === shiftWeekStart(thisWeek, 1);

  return (
    <div className="page">
      <PageHeader
        title="Weekly challenges"
        sub="One save writes every group for the chosen week. Blank groups are skipped."
        actions={
          <>
            <div className="row">
              <button className="btn small" aria-label="Previous week" onClick={() => goToWeek(shiftWeekStart(week, -1))}>
                ‹
              </button>
              <span className="num" style={{ fontWeight: 700, minWidth: 120, textAlign: 'center' }}>
                {formatDate(week)}
              </span>
              <button className="btn small" aria-label="Next week" onClick={() => goToWeek(shiftWeekStart(week, 1))}>
                ›
              </button>
              <button
                className={`btn small${isThisWeek ? ' primary' : ''}`}
                onClick={() => goToWeek(thisWeek)}
              >
                This week
              </button>
              <button
                className={`btn small${isNextWeek ? ' primary' : ''}`}
                onClick={() => goToWeek(shiftWeekStart(thisWeek, 1))}
              >
                Next week
              </button>
            </div>
          </>
        }
      />

      {weekQ.error && <ErrorNote error={weekQ.error} />}
      {saveMutation.error && <ErrorNote error={saveMutation.error} />}
      {deleteMutation.error && <ErrorNote error={deleteMutation.error} />}
      {activeMutation.error && <ErrorNote error={activeMutation.error} />}
      {entriesQ.error && <ErrorNote error={entriesQ.error} />}

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {CHALLENGE_GROUPS.map((g) => {
          const f = forms[g.id];
          return (
            <section key={g.id} className="panel">
              <div className="panel-head">
                <div className="row" style={{ gap: 8 }}>
                  <h2>{g.name}</h2>
                  <span className="label">{g.tiers}</span>
                </div>
                {f.existingId && !f.is_active ? (
                  <Badge tone="warn">hidden</Badge>
                ) : f.existingId ? (
                  <Badge tone="ok">live</Badge>
                ) : f.title.trim() ? (
                  <Badge tone="accent">unsaved</Badge>
                ) : (
                  <Badge tone="warn">missing</Badge>
                )}
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  className="field"
                  placeholder="Challenge title"
                  value={f.title}
                  onChange={(e) => setForm(g.id, { title: e.target.value })}
                  aria-label={`${g.name} title`}
                />
                <textarea
                  className="field"
                  placeholder="Description (optional)"
                  rows={2}
                  value={f.description}
                  onChange={(e) => setForm(g.id, { description: e.target.value })}
                  aria-label={`${g.name} description`}
                />
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <select
                    className="field"
                    style={{ flex: 1 }}
                    value={f.scoring_type}
                    onChange={(e) =>
                      setForm(g.id, { scoring_type: e.target.value as 'reps' | 'time' })
                    }
                    aria-label={`${g.name} scoring type`}
                  >
                    <option value="reps">Score by reps</option>
                    <option value="time">Score by time</option>
                  </select>
                  <input
                    className="field num"
                    style={{ width: 110 }}
                    type="number"
                    min={0}
                    placeholder="Time limit (s)"
                    value={f.time_limit}
                    onChange={(e) => setForm(g.id, { time_limit: e.target.value })}
                    aria-label={`${g.name} time limit seconds`}
                  />
                </div>
                <MovementsEditor
                  movements={f.movements}
                  onChange={(m) => setForm(g.id, { movements: m })}
                />
                <div
                  className="row"
                  style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}
                >
                  <select
                    className="field"
                    style={{ flex: 1, minWidth: 120 }}
                    value={templateChoice[g.id] ?? ''}
                    onChange={(e) =>
                      setTemplateChoice((t) => ({ ...t, [g.id]: e.target.value }))
                    }
                    aria-label={`${g.name} template`}
                  >
                    <option value="">Template…</option>
                    {templatesQ.data
                      ?.filter((t) => t.group_id == null || t.group_id === g.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn small"
                    disabled={!templateChoice[g.id]}
                    onClick={() => applyTemplate(g.id)}
                  >
                    Load
                  </button>
                  <PromptButton
                    label="Save as template"
                    title="Save as a reusable template"
                    fieldLabel="Template name"
                    initialValue={f.title.trim()}
                    disabled={!f.title.trim() || templateMutation.isPending}
                    onConfirm={async (name) => {
                      await templateMutation.mutateAsync({
                        name,
                        group_id: g.id,
                        title: f.title.trim(),
                        description: f.description.trim() || null,
                        scoring_type: f.scoring_type,
                        movements: f.movements.filter((m) => m.name.trim() !== ''),
                        time_limit: f.time_limit.trim() === '' ? null : Number(f.time_limit),
                      });
                    }}
                  />
                  {f.existingId && (() => {
                    const id = f.existingId;
                    const entries = entriesQ.data?.[id];
                    if (entries === undefined) return null; // still counting
                    if (entries > 0) {
                      // Deleting would erase every entry (ON DELETE CASCADE).
                      return f.is_active ? (
                        <ConfirmButton
                          label={`Hide (${entries} ${entries === 1 ? 'entry' : 'entries'})`}
                          title={`Hide the ${g.name} challenge for ${formatDate(week)}?`}
                          body={`It disappears from the app, including its leaderboard. The ${entries} ${entries === 1 ? 'entry stays' : 'entries stay'} saved, and you can show it again any time.`}
                          confirmLabel="Hide"
                          onConfirm={async () => {
                            await activeMutation.mutateAsync({ id, isActive: false });
                          }}
                        />
                      ) : (
                        <button
                          className="btn small"
                          disabled={activeMutation.isPending}
                          onClick={() => activeMutation.mutate({ id, isActive: true })}
                        >
                          Show in app
                        </button>
                      );
                    }
                    return (
                      <ConfirmButton
                        label="Delete"
                        danger
                        title={`Delete the ${g.name} challenge for ${formatDate(week)}?`}
                        body="Nobody has entered it yet. It disappears from the app. This can't be undone."
                        confirmLabel="Delete"
                        onConfirm={async () => {
                          await deleteMutation.mutateAsync(id);
                        }}
                      />
                    );
                  })()}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {savedFlash && <Badge tone="ok">saved</Badge>}
        <button
          className="btn primary"
          disabled={filledGroups.length === 0 || saveMutation.isPending}
          onClick={saveWeek}
        >
          {saveMutation.isPending
            ? 'Saving…'
            : `Save week (${filledGroups.length} group${filledGroups.length === 1 ? '' : 's'})`}
        </button>
      </div>
      {unsaved.dialog}
    </div>
  );
}
