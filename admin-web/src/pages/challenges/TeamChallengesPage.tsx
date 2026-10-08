import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteTeam,
  deleteTeamChallenge,
  fetchChallengeTeams,
  fetchTeamChallenges,
  saveTeamChallenge,
  type AdminTeamChallenge,
  type AdminTeamRow,
  type TeamFormat,
  type TeamScoringType,
} from '@/api/teamChallenges';
import { fetchTemplates, type ChallengeMovement } from '@/api/challenges';
import { currentWeekStart, formatDate, shiftWeekStart } from '@/shared/constants';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { DataTable, type Column } from '@/components/DataTable';
import { MovementsEditor } from '@/components/MovementsEditor';

const FORMATS: Record<TeamFormat, { label: string; help: string }> = {
  sync: {
    label: 'Team Sync',
    help: 'Everyone does the same movement at the same time. The leader submits the team result.',
  },
  switch: {
    label: 'Team Switch',
    help: 'One player works while the others rest; they switch whenever they like. The leader submits the team result.',
  },
  collect: {
    label: 'Collect',
    help: 'Everyone works at their own pace. Each player submits; the team score is the sum (total time, or total points).',
  },
};

const SCORING: Record<TeamScoringType, { label: string; help: string }> = {
  reps: { label: 'AMRAP', help: 'Clock counts down; most points wins (reps × points per rep).' },
  time: {
    label: 'For Time',
    help: 'Clock counts up; fastest wins. Hitting the cap scores the cap + 1 s per missing rep.',
  },
};

interface Form {
  id: string | null;
  title: string;
  description: string;
  format: TeamFormat;
  scoring_type: TeamScoringType;
  movements: ChallengeMovement[];
  rounds: string;
  time_limit_min: string;
  team_size: number;
  start_date: string; // yyyy-mm-dd, UTC midnight
  end_date: string;
  is_active: boolean;
}

function emptyForm(): Form {
  const start = shiftWeekStart(currentWeekStart(), 1); // default: prep next week
  return {
    id: null,
    title: '',
    description: '',
    format: 'sync',
    scoring_type: 'reps',
    movements: [],
    rounds: '1',
    time_limit_min: '10',
    team_size: 2,
    start_date: start,
    end_date: shiftWeekStart(start, 1),
    is_active: true,
  };
}

function formFrom(c: AdminTeamChallenge): Form {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    format: c.format,
    scoring_type: c.scoring_type,
    movements: c.movements,
    rounds: String(c.rounds),
    time_limit_min: String(c.time_limit_sec / 60),
    team_size: c.team_size,
    start_date: c.starts_at.slice(0, 10),
    end_date: c.ends_at.slice(0, 10),
    is_active: c.is_active,
  };
}

const utcMidnight = (date: string) => `${date}T00:00:00Z`;

/** Same limits the server enforces, so mistakes show before saving. */
function validate(f: Form): string | null {
  const title = f.title.trim();
  if (title.length < 1 || title.length > 80) return 'Title must be 1–80 characters.';
  const movements = f.movements.filter((m) => m.name.trim() !== '');
  if (movements.length < 1 || movements.length > 12) return 'Add 1–12 movements.';
  if (movements.some((m) => !Number.isInteger(m.reps) || m.reps < 1 || m.reps > 500))
    return 'Each movement needs 1–500 reps.';
  if (movements.some((m) => !(m.points >= 0 && m.points <= 1000)))
    return 'Points per rep must be 0–1000.';
  const minutes = Number(f.time_limit_min);
  if (!(minutes >= 1 && minutes <= 120)) return 'Time limit must be 1–120 minutes.';
  if (f.scoring_type === 'time') {
    const rounds = Number(f.rounds);
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 50) return 'Rounds must be 1–50.';
  }
  if (!f.start_date || !f.end_date || f.end_date <= f.start_date)
    return 'End date must be after the start date.';
  return null;
}

function status(c: AdminTeamChallenge): { label: string; tone?: 'ok' | 'accent' | 'warn' } {
  const now = Date.now();
  if (!c.is_active) return { label: 'hidden', tone: 'warn' };
  if (now < Date.parse(c.starts_at)) return { label: 'upcoming', tone: 'accent' };
  if (now >= Date.parse(c.ends_at)) return { label: 'ended' };
  return { label: 'live', tone: 'ok' };
}

function formatScore(type: TeamScoringType, score: number | null): string {
  if (score == null) return '—';
  if (type === 'reps') return `${score} pts`;
  const m = Math.floor(score / 60);
  const s = score - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function TeamChallengesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateChoice, setTemplateChoice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const challengesQ = useQuery({ queryKey: ['team-challenges'], queryFn: fetchTeamChallenges });
  const templatesQ = useQuery({ queryKey: ['challenge-templates'], queryFn: fetchTemplates });
  const teamsQ = useQuery({
    queryKey: ['team-challenge-teams', selectedId],
    queryFn: () => fetchChallengeTeams(selectedId!),
    enabled: selectedId != null,
  });

  const selected = useMemo(
    () => challengesQ.data?.find((c) => c.id === selectedId) ?? null,
    [challengesQ.data, selectedId],
  );
  // Once a team exists, the server freezes everything that affects scoring.
  const scoringLocked = form?.id != null && (selected?.team_count ?? 0) > 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['team-challenges'] });
    void queryClient.invalidateQueries({ queryKey: ['team-challenge-teams'] });
  };

  const saveMutation = useMutation({
    mutationFn: (f: Form) =>
      saveTeamChallenge({
        id: f.id,
        title: f.title.trim(),
        description: f.description.trim(),
        format: f.format,
        scoring_type: f.scoring_type,
        movements: f.movements
          .filter((m) => m.name.trim() !== '')
          .map((m) => ({ ...m, name: m.name.trim() })),
        rounds: f.scoring_type === 'time' ? Number(f.rounds) : 1,
        time_limit_sec: Math.round(Number(f.time_limit_min) * 60),
        team_size: f.team_size,
        starts_at: utcMidnight(f.start_date),
        ends_at: utcMidnight(f.end_date),
        is_active: f.is_active,
      }),
    onSuccess: (id) => {
      setForm(null);
      setSelectedId(id);
      refresh();
    },
  });

  const deleteChallengeMutation = useMutation({
    mutationFn: ({ id, includeTeams }: { id: string; includeTeams: boolean }) =>
      deleteTeamChallenge(id, includeTeams),
    onSuccess: () => {
      setForm(null);
      setSelectedId(null);
      refresh();
    },
  });

  const deleteTeamMutation = useMutation({ mutationFn: deleteTeam, onSuccess: refresh });

  function patch(p: Partial<Form>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  function applyTemplate() {
    const tpl = templatesQ.data?.find((t) => t.id === templateChoice);
    if (!tpl) return;
    // Workout only: weekly templates have no team format, size or rounds.
    patch({
      title: tpl.title,
      description: tpl.description ?? '',
      scoring_type: tpl.scoring_type,
      movements: tpl.movements ?? [],
    });
  }

  function save() {
    if (!form) return;
    const problem = validate(form);
    setFormError(problem);
    if (!problem) saveMutation.mutate(form);
  }

  const challengeColumns: Column<AdminTeamChallenge>[] = [
    { key: 'title', header: 'Challenge', render: (c) => <strong>{c.title}</strong> },
    {
      key: 'format',
      header: 'Format',
      render: (c) => `${FORMATS[c.format].label} · ${SCORING[c.scoring_type].label}`,
    },
    { key: 'size', header: 'Team', render: (c) => `${c.team_size} players` },
    {
      key: 'window',
      header: 'Window (UTC)',
      render: (c) => `${formatDate(c.starts_at)} – ${formatDate(c.ends_at)}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const s = status(c);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: 'teams', header: 'Teams', align: 'right', render: (c) => <span className="num">{c.team_count}</span> },
    { key: 'ranked', header: 'Ranked', align: 'right', render: (c) => <span className="num">{c.ranked_team_count}</span> },
    { key: 'players', header: 'Players', align: 'right', render: (c) => <span className="num">{c.player_count}</span> },
    { key: 'attempts', header: 'Attempts', align: 'right', render: (c) => <span className="num">{c.submitted_attempts}</span> },
  ];

  const teamColumns: Column<AdminTeamRow>[] = [
    { key: 'name', header: 'Team', render: (t) => <strong>{t.name}</strong> },
    {
      key: 'members',
      header: 'Members',
      render: (t) =>
        t.members
          .map((m) => `${m.display_name ?? 'Deleted user'}${m.is_leader ? ' (leader)' : ''}`)
          .join(', '),
    },
    {
      key: 'best',
      header: 'Best',
      align: 'right',
      render: (t) => <span className="num">{formatScore(selected?.scoring_type ?? 'reps', t.best_score)}</span>,
    },
    { key: 'attempts', header: 'Attempts', align: 'right', render: (t) => <span className="num">{t.attempts_count}</span> },
    {
      key: 'state',
      header: 'Roster',
      render: (t) =>
        t.locked_at ? (
          <Badge>locked</Badge>
        ) : (
          <Badge tone="accent">{`${t.member_count}/${selected?.team_size ?? '?'}`}</Badge>
        ),
    },
    {
      key: 'delete',
      header: '',
      align: 'right',
      render: (t) => (
        <ConfirmButton
          label="Delete"
          danger
          title={`Delete team “${t.name}”?`}
          body="The team, its members and all its attempts are removed from the challenge and its leaderboard. This can't be undone."
          confirmLabel="Delete team"
          onConfirm={async () => {
            await deleteTeamMutation.mutateAsync(t.team_id);
          }}
        />
      ),
    },
  ];

  const thisWeek = currentWeekStart();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Team challenges</h1>
          <div className="sub">
            Teams of 2–4 join with an invite code and compete for the best attempt. Dates are UTC.
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setForm(emptyForm());
            setFormError(null);
            setSelectedId(null);
          }}
        >
          New challenge
        </button>
      </div>

      {challengesQ.error && <ErrorNote error={challengesQ.error} />}
      {deleteChallengeMutation.error && <ErrorNote error={deleteChallengeMutation.error} />}
      {deleteTeamMutation.error && <ErrorNote error={deleteTeamMutation.error} />}

      {form && (
        <section className="panel">
          <div className="panel-head">
            <h2>{form.id ? 'Edit challenge' : 'New challenge'}</h2>
            <button className="btn small" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scoringLocked && (
              <div className="sub">
                Teams have joined, so only the title, description, end date and visibility can change.
              </div>
            )}
            <input
              className="field"
              placeholder="Challenge title"
              maxLength={80}
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              aria-label="Title"
            />
            <textarea
              className="field"
              placeholder="Description shown to players (how to do it, standards…)"
              rows={3}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              aria-label="Description"
            />

            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Team format</span>
                <select
                  className="field"
                  value={form.format}
                  disabled={scoringLocked}
                  onChange={(e) => patch({ format: e.target.value as TeamFormat })}
                >
                  {(Object.keys(FORMATS) as TeamFormat[]).map((k) => (
                    <option key={k} value={k}>
                      {FORMATS[k].label}
                    </option>
                  ))}
                </select>
                <span className="sub">{FORMATS[form.format].help}</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Workout type</span>
                <select
                  className="field"
                  value={form.scoring_type}
                  disabled={scoringLocked}
                  onChange={(e) => patch({ scoring_type: e.target.value as TeamScoringType })}
                >
                  {(Object.keys(SCORING) as TeamScoringType[]).map((k) => (
                    <option key={k} value={k}>
                      {SCORING[k].label}
                    </option>
                  ))}
                </select>
                <span className="sub">{SCORING[form.scoring_type].help}</span>
              </label>
            </div>

            <div className="row">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">
                  {form.scoring_type === 'reps' ? 'Duration (min)' : 'Time cap (min)'}
                </span>
                <input
                  className="field num"
                  style={{ width: 120 }}
                  type="number"
                  min={1}
                  max={120}
                  step={0.5}
                  value={form.time_limit_min}
                  disabled={scoringLocked}
                  onChange={(e) => patch({ time_limit_min: e.target.value })}
                />
              </label>
              {form.scoring_type === 'time' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="label">Rounds</span>
                  <input
                    className="field num"
                    style={{ width: 90 }}
                    type="number"
                    min={1}
                    max={50}
                    value={form.rounds}
                    disabled={scoringLocked}
                    onChange={(e) => patch({ rounds: e.target.value })}
                  />
                </label>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Team size</span>
                <select
                  className="field"
                  value={form.team_size}
                  disabled={scoringLocked}
                  onChange={(e) => patch({ team_size: Number(e.target.value) })}
                >
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} players
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Starts (UTC)</span>
                <input
                  className="field"
                  type="date"
                  value={form.start_date}
                  disabled={scoringLocked}
                  onChange={(e) => patch({ start_date: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Ends (UTC)</span>
                <input
                  className="field"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => patch({ end_date: e.target.value })}
                />
              </label>
              {!scoringLocked && (
                <div className="row" style={{ alignSelf: 'flex-end' }}>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => patch({ start_date: thisWeek, end_date: shiftWeekStart(thisWeek, 1) })}
                  >
                    This week
                  </button>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() =>
                      patch({
                        start_date: shiftWeekStart(thisWeek, 1),
                        end_date: shiftWeekStart(thisWeek, 2),
                      })
                    }
                  >
                    Next week
                  </button>
                </div>
              )}
            </div>

            <fieldset disabled={scoringLocked} style={{ border: 0, padding: 0, margin: 0 }}>
              <MovementsEditor movements={form.movements} onChange={(m) => patch({ movements: m })} />
            </fieldset>

            <div className="row" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
              {!scoringLocked && (
                <>
                  <select
                    className="field"
                    style={{ flex: 1, minWidth: 160 }}
                    value={templateChoice}
                    onChange={(e) => setTemplateChoice(e.target.value)}
                    aria-label="Weekly challenge template"
                  >
                    <option value="">Load workout from a weekly template…</option>
                    {templatesQ.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn small" disabled={!templateChoice} onClick={applyTemplate}>
                    Load
                  </button>
                </>
              )}
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => patch({ is_active: e.target.checked })}
                />
                <span>Visible in the app</span>
              </label>
              <div style={{ flex: 1 }} />
              {form.id && (() => {
                const teams = selected?.team_count ?? 0;
                const attempts = selected?.submitted_attempts ?? 0;
                return (
                  <ConfirmButton
                    label={teams > 0 ? `Delete challenge + ${teams} team${teams === 1 ? '' : 's'}` : 'Delete challenge'}
                    danger
                    title={`Delete “${form.title}”?`}
                    body={
                      teams > 0
                        ? `This also deletes ${teams} team${teams === 1 ? '' : 's'}, their members and ${attempts} submitted attempt${attempts === 1 ? '' : 's'}, and removes them from the leaderboard and from players' team history. This can't be undone. To keep the results, hide the challenge instead.`
                        : "This can't be undone."
                    }
                    confirmLabel={teams > 0 ? 'Delete everything' : 'Delete'}
                    onConfirm={async () => {
                      await deleteChallengeMutation.mutateAsync({ id: form.id!, includeTeams: teams > 0 });
                    }}
                  />
                );
              })()}
              <button className="btn primary" disabled={saveMutation.isPending} onClick={save}>
                {saveMutation.isPending ? 'Saving…' : form.id ? 'Save changes' : 'Publish challenge'}
              </button>
            </div>
            {formError && <div className="error-note">{formError}</div>}
            {saveMutation.error && <ErrorNote error={saveMutation.error} />}
          </div>
        </section>
      )}

      <DataTable
        columns={challengeColumns}
        rows={challengesQ.data}
        rowKey={(c) => c.id}
        loading={challengesQ.isLoading}
        emptyLabel="No team challenges yet"
        emptyHint="Create one with “New challenge”."
        onRowClick={(c) => {
          setSelectedId(c.id);
          setForm(formFrom(c));
          setFormError(null);
        }}
      />

      {selected && (
        <section className="panel">
          <div className="panel-head">
            <h2>Teams · {selected.title}</h2>
            <span className="label">{teamsQ.data?.length ?? 0} teams</span>
          </div>
          <div className="panel-body">
            {teamsQ.error && <ErrorNote error={teamsQ.error} />}
            <DataTable
              columns={teamColumns}
              rows={teamsQ.data}
              rowKey={(t) => t.team_id}
              loading={teamsQ.isLoading}
              emptyLabel="No teams yet"
            />
          </div>
        </section>
      )}
    </div>
  );
}
