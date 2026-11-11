import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  abandonLiveRoom,
  deleteLiveChallenge,
  fetchLiveChallenges,
  fetchLiveRooms,
  fetchLiveTemplates,
  saveLiveChallenge,
  saveLiveTemplate,
  type AdminLiveChallenge,
  type AdminLiveRoom,
  type LiveChallengeTemplate,
  type LiveFormat,
  type LiveRoomStatus,
} from '@/api/liveChallenges';
import { fetchTemplates, type ChallengeMovement } from '@/api/challenges';
import { currentWeekStart, formatDate, shiftWeekStart } from '@/shared/constants';
import { Badge, ConfirmButton, ErrorNote, PromptButton } from '@/components/bits';
import { DataTable, type Column } from '@/components/DataTable';
import { MovementsEditor } from '@/components/MovementsEditor';
import { PageHeader } from '@/components/layout';

interface HalfForm {
  minutes: string;
  movements: ChallengeMovement[];
}

interface Form {
  id: string | null;
  title: string;
  description: string;
  halves: HalfForm[];
  rest_sec: string;
  team_size: number;
  format: LiveFormat;
  start_date: string; // yyyy-mm-dd, UTC midnight
  end_date: string;
  is_active: boolean;
}

const emptyHalf = (): HalfForm => ({ minutes: '4', movements: [] });

function emptyForm(): Form {
  const start = shiftWeekStart(currentWeekStart(), 1); // default: prep next week
  return {
    id: null,
    title: '',
    description: '',
    halves: [emptyHalf(), emptyHalf()],
    rest_sec: '60',
    team_size: 2,
    format: 'teams',
    start_date: start,
    end_date: shiftWeekStart(start, 1),
    is_active: true,
  };
}

/** The parts a duplicate or template carries over; dates and visibility are set each time. */
type Setup = Pick<LiveChallengeTemplate, 'title' | 'description' | 'halves' | 'rest_sec' | 'team_size' | 'format'>;

const setupFields = (s: Setup) => ({
  title: s.title,
  description: s.description,
  halves: s.halves.map((h) => ({ minutes: String(h.duration_sec / 60), movements: h.movements })),
  rest_sec: String(s.rest_sec),
  team_size: s.team_size,
  format: s.format,
});

function formFrom(c: AdminLiveChallenge): Form {
  return {
    ...setupFields(c),
    id: c.id,
    start_date: c.starts_at.slice(0, 10),
    end_date: c.ends_at.slice(0, 10),
    is_active: c.is_active,
  };
}

/** A new, unsaved challenge with another challenge's or a template's setup. */
const copyForm = (s: Setup): Form => ({ ...emptyForm(), ...setupFields(s) });

const utcMidnight = (date: string) => `${date}T00:00:00Z`;

const cleanMovements = (movements: ChallengeMovement[]) =>
  movements.filter((m) => m.name.trim() !== '').map((m) => ({ ...m, name: m.name.trim() }));

/** Same limits the server enforces (live_valid_halves), so mistakes show before saving. */
function validateSetup(f: Form): string | null {
  const title = f.title.trim();
  if (title.length < 1 || title.length > 80) return 'Title must be 1–80 characters.';
  if (f.halves.length < 1 || f.halves.length > 3) return 'A live challenge has 1 to 3 halves.';
  for (const [i, h] of f.halves.entries()) {
    const n = i + 1;
    const seconds = Math.round(Number(h.minutes) * 60);
    if (!(seconds >= 60 && seconds <= 1800)) return `Half ${n}: length must be 1–30 minutes.`;
    const movements = cleanMovements(h.movements);
    if (movements.length < 1 || movements.length > 8) return `Half ${n}: add 1–8 exercises.`;
    if (movements.some((m) => !Number.isInteger(m.reps) || m.reps < 1 || m.reps > 500))
      return `Half ${n}: each exercise needs a max of 1–500 reps.`;
    if (movements.some((m) => !(m.points >= 0 && m.points <= 1000) || Math.round(m.points * 100) !== m.points * 100))
      return `Half ${n}: points per rep must be 0–1000, with at most 2 decimals.`;
  }
  const rest = Number(f.rest_sec);
  if (!Number.isInteger(rest) || rest < 0 || rest > 600) return 'Rest must be 0–600 seconds.';
  return null;
}

function validate(f: Form): string | null {
  const problem = validateSetup(f);
  if (problem) return problem;
  if (!f.start_date || !f.end_date || f.end_date <= f.start_date)
    return 'End date must be after the start date.';
  return null;
}

function status(c: AdminLiveChallenge): { label: string; tone?: 'ok' | 'accent' | 'warn' } {
  const now = Date.now();
  if (!c.is_active) return { label: 'hidden', tone: 'warn' };
  if (now < Date.parse(c.starts_at)) return { label: 'upcoming', tone: 'accent' };
  if (now >= Date.parse(c.ends_at)) return { label: 'ended' };
  return { label: 'live', tone: 'ok' };
}

const ROOM_TONE: Record<LiveRoomStatus, 'ok' | 'accent' | 'warn' | undefined> = {
  lobby: 'accent',
  playing: 'ok',
  finished: undefined,
  abandoned: 'warn',
};

const sideLetter = (side: number) => String.fromCharCode(64 + side);

const halvesSummary = (c: Setup) =>
  c.halves.map((h) => `${h.duration_sec / 60}′`).join(' + ') + ` · ${c.rest_sec}s rest`;

const toHalves = (f: Form) =>
  f.halves.map((h) => ({
    duration_sec: Math.round(Number(h.minutes) * 60),
    movements: cleanMovements(h.movements),
  }));

export function LiveChallengesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Title of the challenge the open new form was duplicated from, for the heading.
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  // "t:<id>" = live template, "c:<id>" = live challenge.
  const [loadChoice, setLoadChoice] = useState('');
  // Weekly template picked per half (index → template id).
  const [weeklyChoice, setWeeklyChoice] = useState<Record<number, string>>({});
  const [templateSaved, setTemplateSaved] = useState(false);

  const challengesQ = useQuery({ queryKey: ['live-challenges'], queryFn: fetchLiveChallenges });
  const liveTemplatesQ = useQuery({ queryKey: ['live-challenge-templates'], queryFn: fetchLiveTemplates });
  const weeklyTemplatesQ = useQuery({ queryKey: ['challenge-templates'], queryFn: fetchTemplates });
  const roomsQ = useQuery({
    queryKey: ['live-challenge-rooms', selectedId],
    queryFn: () => fetchLiveRooms(selectedId!),
    enabled: selectedId != null,
  });

  const selected = useMemo(
    () => challengesQ.data?.find((c) => c.id === selectedId) ?? null,
    [challengesQ.data, selectedId],
  );
  // Once a room exists, the server freezes the halves and players per side.
  const playLocked = form?.id != null && (selected?.room_count ?? 0) > 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['live-challenges'] });
    void queryClient.invalidateQueries({ queryKey: ['live-challenge-rooms'] });
  };

  const saveMutation = useMutation({
    mutationFn: (f: Form) =>
      saveLiveChallenge({
        id: f.id,
        title: f.title.trim(),
        description: f.description.trim(),
        halves: toHalves(f),
        rest_sec: Number(f.rest_sec),
        team_size: f.team_size,
        format: f.format,
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

  const deleteMutation = useMutation({
    mutationFn: ({ id, includeRooms }: { id: string; includeRooms: boolean }) => deleteLiveChallenge(id, includeRooms),
    onSuccess: () => {
      setForm(null);
      setSelectedId(null);
      refresh();
    },
  });

  const abandonMutation = useMutation({ mutationFn: abandonLiveRoom, onSuccess: refresh });

  const templateMutation = useMutation({
    mutationFn: saveLiveTemplate,
    onSuccess: () => {
      setTemplateSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['live-challenge-templates'] });
    },
  });

  /** Opens a form and clears everything tied to the previous one. */
  function openForm(f: Form | null, from: string | null = null) {
    setForm(f);
    setCopiedFrom(from);
    setFormError(null);
    setLoadChoice('');
    setWeeklyChoice({});
    setTemplateSaved(false);
    saveMutation.reset();
    templateMutation.reset();
  }

  function duplicate() {
    if (!selected) return;
    openForm(copyForm(selected), selected.title);
    setSelectedId(null);
  }

  /** Fills the new form's setup from a live template or challenge; dates and visibility stay. */
  function applyLoad() {
    const [kind, id] = [loadChoice.slice(0, 1), loadChoice.slice(2)];
    const source: Setup | undefined =
      kind === 't'
        ? liveTemplatesQ.data?.find((t) => t.id === id)
        : challengesQ.data?.find((c) => c.id === id);
    if (!source) return;
    patch(setupFields(source));
    setWeeklyChoice({});
  }

  /** Workout only: weekly templates have one exercise list, so it fills a single half. */
  function applyWeeklyTemplate(i: number) {
    const tpl = weeklyTemplatesQ.data?.find((t) => t.id === weeklyChoice[i]);
    if (tpl) patchHalf(i, { movements: tpl.movements ?? [] });
  }

  async function saveAsTemplate(name: string) {
    if (!form) return;
    const problem = validateSetup(form);
    setFormError(problem);
    if (problem) throw new Error(problem);
    setTemplateSaved(false);
    await templateMutation.mutateAsync({
      name: name.slice(0, 80),
      title: form.title.trim(),
      description: form.description.trim(),
      halves: toHalves(form),
      rest_sec: Number(form.rest_sec),
      team_size: form.team_size,
      format: form.format,
    });
  }

  function patch(p: Partial<Form>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  function patchHalf(i: number, p: Partial<HalfForm>) {
    setForm((f) => (f ? { ...f, halves: f.halves.map((h, idx) => (idx === i ? { ...h, ...p } : h)) } : f));
  }

  function save() {
    if (!form) return;
    const problem = validate(form);
    setFormError(problem);
    if (!problem) saveMutation.mutate(form);
  }

  const challengeColumns: Column<AdminLiveChallenge>[] = [
    { key: 'title', header: 'Challenge', render: (c) => <strong>{c.title}</strong> },
    { key: 'halves', header: 'Halves', render: halvesSummary },
    { key: 'format', header: 'Format', render: (c) => (c.format === 'solo' ? 'Solo Battle' : 'Teams') },
    { key: 'size', header: 'Per side', render: (c) => (c.format === 'solo' ? 'up to 12 players' : `up to ${c.team_size}`) },
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
    { key: 'rooms', header: 'Rooms', align: 'right', render: (c) => <span className="num">{c.room_count}</span> },
    { key: 'live', header: 'Live now', align: 'right', render: (c) => <span className="num">{c.live_room_count}</span> },
    { key: 'done', header: 'Finished', align: 'right', render: (c) => <span className="num">{c.finished_room_count}</span> },
    { key: 'players', header: 'Players', align: 'right', render: (c) => <span className="num">{c.player_count}</span> },
  ];

  const roomColumns: Column<AdminLiveRoom>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={ROOM_TONE[r.status]}>
          {r.status === 'playing' ? `playing · half ${r.current_half}` : r.status}
        </Badge>
      ),
    },
    { key: 'host', header: 'Host', render: (r) => r.host_name ?? '—' },
    {
      key: 'players',
      header: selected?.format === 'solo' ? 'Players' : 'Sides',
      render: (r) =>
        selected?.format === 'solo' ? r.players.map((p) => p.display_name ?? 'Deleted user').join(', ') || '—' :
        Array.from({ length: r.side_count }, (_, i) => {
          const names = r.players.filter((p) => p.side === i + 1).map((p) => p.display_name ?? 'Deleted user');
          const team = r.side_names?.[String(i + 1)];
          return `${sideLetter(i + 1)}${team ? ` “${team}”` : ''}: ${names.length ? names.join(', ') : '—'}`;
        }).join('  ·  ') +
        (r.players.some((p) => p.side == null) ? `  ·  no side: ${r.players.filter((p) => p.side == null).length}` : ''),
    },
    { key: 'created', header: 'Created', render: (r) => formatDate(r.created_at) },
    {
      key: 'abandon',
      header: '',
      align: 'right',
      render: (r) =>
        r.status === 'lobby' || r.status === 'playing' ? (
          <ConfirmButton
            label="Abandon"
            danger
            title="Abandon this room?"
            body="The room ends for everyone in it and keeps no result. Use this for a stuck room. This can't be undone."
            confirmLabel="Abandon room"
            onConfirm={async () => {
              await abandonMutation.mutateAsync(r.room_id);
            }}
          />
        ) : null,
    },
  ];

  const thisWeek = currentWeekStart();

  return (
    <div className="page">
      <PageHeader
        title="Live challenges"
        sub="Players open a room, join with a code, pick a side and play 2–3 timed halves together. Dates are UTC."
        actions={
          <>
            <button
              className="btn primary"
              onClick={() => {
                openForm(emptyForm());
                setSelectedId(null);
              }}
            >
              New challenge
            </button>
          </>
        }
      />

      {challengesQ.error && <ErrorNote error={challengesQ.error} />}
      {deleteMutation.error && <ErrorNote error={deleteMutation.error} />}
      {abandonMutation.error && <ErrorNote error={abandonMutation.error} />}

      {form && (
        <section className="panel">
          <div className="panel-head">
            <h2>{form.id ? 'Edit challenge' : copiedFrom ? `New challenge · copy of “${copiedFrom}”` : 'New challenge'}</h2>
            <div className="row">
              {form.id && (
                <button
                  className="btn small"
                  title="Start a new challenge with this one's setup. This challenge and its rooms stay as they are."
                  onClick={duplicate}
                >
                  Duplicate
                </button>
              )}
              <PromptButton
                label="Save as template"
                title="Save as a reusable template (title, description, halves, rest, players per side)"
                fieldLabel="Template name"
                initialValue={form.title.trim()}
                disabled={templateMutation.isPending}
                onConfirm={saveAsTemplate}
              />
              <button className="btn small" onClick={() => openForm(null)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {templateSaved && <Badge tone="ok">saved as template</Badge>}
            {templateMutation.error && <ErrorNote error={templateMutation.error} />}
            {!form.id && (
              <div className="row">
                <select
                  className="field"
                  style={{ flex: 1, minWidth: 200 }}
                  value={loadChoice}
                  onChange={(e) => setLoadChoice(e.target.value)}
                  aria-label="Load a template or existing challenge"
                >
                  <option value="">Load a template or existing challenge…</option>
                  {(liveTemplatesQ.data?.length ?? 0) > 0 && (
                    <optgroup label="Live templates">
                      {liveTemplatesQ.data!.map((t) => (
                        <option key={t.id} value={`t:${t.id}`}>
                          {t.name} · {halvesSummary(t)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(challengesQ.data?.length ?? 0) > 0 && (
                    <optgroup label="Live challenges">
                      {challengesQ.data!.map((c) => (
                        <option key={c.id} value={`c:${c.id}`}>
                          {c.title} · {formatDate(c.starts_at)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button className="btn small" disabled={!loadChoice} onClick={applyLoad}>
                  Load
                </button>
              </div>
            )}
            {liveTemplatesQ.error && <ErrorNote error={liveTemplatesQ.error} />}
            {playLocked && (
              <div className="sub">
                Rooms have played this challenge, so the format, halves and players per side can no longer change.
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
              placeholder="Description shown to players (standards, rules…)"
              rows={3}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              aria-label="Description"
            />

            <div className="row">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Format</span>
                <select
                  className="field"
                  value={form.format}
                  disabled={playLocked}
                  onChange={(e) => {
                    const format = e.target.value as LiveFormat;
                    patch({ format, team_size: format === 'solo' ? 1 : 2 });
                  }}
                >
                  <option value="teams">Teams</option>
                  <option value="solo">Solo Battle</option>
                </select>
              </label>
              {form.format === 'teams' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="label">Players per side (max)</span>
                  <select
                    className="field"
                    value={form.team_size}
                    disabled={playLocked}
                    onChange={(e) => patch({ team_size: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'player' : 'players'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Rest between halves (s)</span>
                <input
                  className="field num"
                  style={{ width: 120 }}
                  type="number"
                  min={0}
                  max={600}
                  step={15}
                  value={form.rest_sec}
                  onChange={(e) => patch({ rest_sec: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="label">Starts (UTC)</span>
                <input
                  className="field"
                  type="date"
                  value={form.start_date}
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
                    patch({ start_date: shiftWeekStart(thisWeek, 1), end_date: shiftWeekStart(thisWeek, 2) })
                  }
                >
                  Next week
                </button>
              </div>
            </div>
            <div className="sub">
              {form.format === 'solo'
                ? 'Each room holds up to 12 players and can start with 2. Everyone plays for themselves; the host can only log for a player who has been offline for 30 seconds.'
                : 'Rooms can have 2–4 sides (the host picks). Every side must have the same number of players to start, up to this max.'}{' '}
              Rest is the cool-down shown between halves; the host can start the next half earlier. One half means a single match with no rest.
            </div>

            <fieldset disabled={playLocked} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {form.halves.map((h, i) => (
                <div
                  key={i}
                  style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div className="row">
                    <strong>Half {i + 1}</strong>
                    <label className="row" style={{ gap: 6 }}>
                      <span className="label">Length (min)</span>
                      <input
                        className="field num"
                        style={{ width: 90 }}
                        type="number"
                        min={1}
                        max={30}
                        step={0.5}
                        value={h.minutes}
                        onChange={(e) => patchHalf(i, { minutes: e.target.value })}
                        aria-label={`Half ${i + 1} length in minutes`}
                      />
                    </label>
                    <div style={{ flex: 1 }} />
                    {form.halves.length > 1 && (
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => {
                          patch({ halves: form.halves.filter((_, idx) => idx !== i) });
                          setWeeklyChoice({});
                        }}
                      >
                        Remove half
                      </button>
                    )}
                  </div>
                  <div className="row">
                    <select
                      className="field"
                      style={{ flex: 1, minWidth: 160 }}
                      value={weeklyChoice[i] ?? ''}
                      onChange={(e) => setWeeklyChoice((c) => ({ ...c, [i]: e.target.value }))}
                      aria-label={`Weekly challenge template for half ${i + 1}`}
                    >
                      <option value="">Load exercises from a weekly template…</option>
                      {weeklyTemplatesQ.data?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn small" type="button" disabled={!weeklyChoice[i]} onClick={() => applyWeeklyTemplate(i)}>
                      Load
                    </button>
                  </div>
                  <MovementsEditor
                    title="Exercises (any order; reps = max a player can log)"
                    repsLabel="Max"
                    movements={h.movements}
                    onChange={(m) => patchHalf(i, { movements: m })}
                  />
                </div>
              ))}
              {form.halves.length < 3 && (
                <button
                  className="btn small"
                  type="button"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => patch({ halves: [...form.halves, emptyHalf()] })}
                >
                  + Add half {form.halves.length + 1}
                </button>
              )}
            </fieldset>

            <div className="row" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
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
                const rooms = selected?.room_count ?? 0;
                const live = selected?.live_room_count ?? 0;
                const players = selected?.player_count ?? 0;
                const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
                return (
                  <ConfirmButton
                    label={rooms > 0 ? `Delete challenge + ${plural(rooms, 'room')}` : 'Delete challenge'}
                    danger
                    title={`Delete “${form.title}”?`}
                    body={
                      rooms > 0
                        ? `This also deletes ${plural(rooms, 'room')} and everything in them: ${plural(players, 'player')}' results, team names and leaderboard rows, and their Live history for this challenge.${live > 0 ? ` ${plural(live, 'room')} ${live === 1 ? 'is' : 'are'} still in progress and will end for the players in ${live === 1 ? 'it' : 'them'}.` : ''} This can't be undone. To keep the results, hide the challenge instead.`
                        : "No room has used it yet. This can't be undone."
                    }
                    confirmLabel={rooms > 0 ? 'Delete everything' : 'Delete'}
                    onConfirm={async () => {
                      await deleteMutation.mutateAsync({ id: form.id!, includeRooms: rooms > 0 });
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
        emptyLabel="No live challenges yet"
        emptyHint="Create one with “New challenge”."
        onRowClick={(c) => {
          setSelectedId(c.id);
          openForm(formFrom(c));
        }}
      />

      {selected && (
        <section className="panel">
          <div className="panel-head">
            <h2>Rooms · {selected.title}</h2>
            <span className="label">{roomsQ.data?.length ?? 0} rooms</span>
          </div>
          <div className="panel-body">
            {roomsQ.error && <ErrorNote error={roomsQ.error} />}
            <DataTable
              columns={roomColumns}
              rows={roomsQ.data}
              rowKey={(r) => r.room_id}
              loading={roomsQ.isLoading}
              emptyLabel="No rooms yet"
            />
          </div>
        </section>
      )}
    </div>
  );
}
