import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteChallenge,
  fetchTemplates,
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
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';

interface GroupForm {
  existingId: string | null;
  title: string;
  description: string;
  scoring_type: 'reps' | 'time';
  time_limit: string; // keep as text for the input; parsed on save
  movements: ChallengeMovement[];
}

const EMPTY_FORM: GroupForm = {
  existingId: null,
  title: '',
  description: '',
  scoring_type: 'reps',
  time_limit: '',
  movements: [],
};

function MovementsEditor({
  movements,
  onChange,
}: {
  movements: ChallengeMovement[];
  onChange: (m: ChallengeMovement[]) => void;
}) {
  function update(i: number, patch: Partial<ChallengeMovement>) {
    onChange(movements.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">Movements</span>
      {movements.map((m, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            className="field"
            style={{ flex: 1 }}
            placeholder="Movement"
            value={m.name}
            onChange={(e) => update(i, { name: e.target.value })}
            aria-label={`Movement ${i + 1} name`}
          />
          <input
            className="field num"
            style={{ width: 64 }}
            type="number"
            min={0}
            placeholder="Reps"
            value={m.reps || ''}
            onChange={(e) => update(i, { reps: Number(e.target.value) })}
            aria-label={`Movement ${i + 1} reps`}
          />
          <input
            className="field num"
            style={{ width: 64 }}
            type="number"
            min={0}
            placeholder="Pts"
            value={m.points || ''}
            onChange={(e) => update(i, { points: Number(e.target.value) })}
            aria-label={`Movement ${i + 1} points`}
          />
          <button
            className="btn small"
            type="button"
            aria-label={`Remove movement ${i + 1}`}
            onClick={() => onChange(movements.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn small"
        type="button"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...movements, { name: '', reps: 0, points: 0 }])}
      >
        + Add movement
      </button>
    </div>
  );
}

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

  const weekQ = useQuery({
    queryKey: ['week-challenges', week],
    queryFn: () => fetchWeekChallenges(week),
  });
  const templatesQ = useQuery({ queryKey: ['challenge-templates'], queryFn: fetchTemplates });

  // Re-seed the form whenever the fetched week changes.
  useEffect(() => {
    if (!weekQ.data) return;
    const next: Record<number, GroupForm> = { 1: EMPTY_FORM, 2: EMPTY_FORM, 3: EMPTY_FORM };
    for (const c of weekQ.data) {
      next[c.group_id] = {
        existingId: c.id,
        title: c.title,
        description: c.description ?? '',
        scoring_type: c.scoring_type,
        time_limit: c.time_limit != null ? String(c.time_limit) : '',
        movements: c.movements ?? [],
      };
    }
    setForms(next);
  }, [weekQ.data]);

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
        is_active: true,
      };
    });
    saveMutation.mutate(rows);
  }

  const isThisWeek = week === thisWeek;
  const isNextWeek = week === shiftWeekStart(thisWeek, 1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Weekly challenges</h1>
          <div className="sub">
            One save writes every group for the chosen week. Blank groups are skipped.
          </div>
        </div>
        <div className="row">
          <button className="btn small" onClick={() => setWeek(shiftWeekStart(week, -1))}>
            ‹
          </button>
          <span className="num" style={{ fontWeight: 700, minWidth: 120, textAlign: 'center' }}>
            {formatDate(week)}
          </span>
          <button className="btn small" onClick={() => setWeek(shiftWeekStart(week, 1))}>
            ›
          </button>
          <button
            className={`btn small${isThisWeek ? ' primary' : ''}`}
            onClick={() => setWeek(thisWeek)}
          >
            This week
          </button>
          <button
            className={`btn small${isNextWeek ? ' primary' : ''}`}
            onClick={() => setWeek(shiftWeekStart(thisWeek, 1))}
          >
            Next week
          </button>
        </div>
      </div>

      {weekQ.error && <ErrorNote error={weekQ.error} />}
      {saveMutation.error && <ErrorNote error={saveMutation.error} />}
      {deleteMutation.error && <ErrorNote error={deleteMutation.error} />}

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
                {f.existingId ? (
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
                  <button
                    className="btn small"
                    disabled={!f.title.trim() || templateMutation.isPending}
                    title="Save this group's setup as a reusable template"
                    onClick={() => {
                      const name = window.prompt('Template name', f.title.trim());
                      if (!name) return;
                      templateMutation.mutate({
                        name,
                        group_id: g.id,
                        title: f.title.trim(),
                        description: f.description.trim() || null,
                        scoring_type: f.scoring_type,
                        movements: f.movements.filter((m) => m.name.trim() !== ''),
                        time_limit: f.time_limit.trim() === '' ? null : Number(f.time_limit),
                      });
                    }}
                  >
                    Save as template
                  </button>
                  {f.existingId && (
                    <ConfirmButton
                      label="Delete"
                      danger
                      title={`Delete ${g.name} challenge for ${formatDate(week)}?`}
                      body="Existing entries keep their rows but the challenge disappears from the app."
                      confirmLabel="Delete"
                      onConfirm={async () => {
                        await deleteMutation.mutateAsync(f.existingId!);
                      }}
                    />
                  )}
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
    </div>
  );
}
