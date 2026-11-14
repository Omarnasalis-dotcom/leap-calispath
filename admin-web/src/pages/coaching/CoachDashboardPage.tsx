import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAssignment,
  fetchCoachDashboard,
  setAssignmentStatus,
  type CoachClientState,
  type CoachClientStatus,
  type CoachDashboardDay,
} from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/layout';
import { Drawer } from '@/components/Drawer';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { useToast } from '@/components/Toast';
import { ProgressDrawer } from './ProgressDrawer';
import { PackagePanel } from './PackagePanel';
import { CONTINUE_LABEL, isLow, MOOD_FACE, ReviewsPanel } from './ReviewsPanel';
import { TestsPanel } from './TestsPanel';
import './CoachDashboard.css';

// The coach's home: every active client in one status, most urgent first,
// and who's most committed. The statuses come from the server
// (coach_client_state), the same rules the hourly coach reminders use, so
// the page and the pushes always agree.

type Tone = 'accent' | 'warn' | 'muted' | 'ok';

const GROUPS: Array<{ status: CoachClientStatus; label: string; aiLabel?: string; tone: Tone }> = [
  { status: 'waiting', label: 'Waiting on you', aiLabel: 'Needs a new week', tone: 'accent' },
  { status: 'behind', label: 'Behind', tone: 'warn' },
  { status: 'not_started', label: 'Not started', tone: 'warn' },
  { status: 'quiet', label: 'Gone quiet', tone: 'muted' },
  { status: 'on_track', label: 'On track', tone: 'ok' },
  { status: 'week_done', label: 'Week done', tone: 'ok' },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (ms < HOUR) return 'just now';
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  const days = Math.floor(ms / DAY);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY));

/** The status in plain words: what happened and what's expected. */
function reasonText(r: CoachClientState, ai: boolean): string {
  const done = `${r.days_logged} of ${r.days_per_week} done`;
  const nextNum = (r.last_week ?? r.current_week) + 1;
  switch (r.reason) {
    case 'week_missing':
      return `On week ${r.current_week}, which isn't built yet`;
    case 'week_finished':
      return ai
        ? `Finished week ${r.current_week} ${ago(r.finished_at)} · the AI Coach hasn't built week ${nextNum}`
        : `Finished week ${r.current_week} ${ago(r.finished_at)} · week ${nextNum} isn't built`;
    case 'quiet':
      return `No workout for ${daysSince(r.last_activity_at)} days`;
    case 'not_moved_on':
      return `Finished week ${r.current_week} ${ago(r.finished_at)} · hasn't started week ${r.next_week}`;
    case 'week_done':
      return `Finished week ${r.current_week} · week ${r.next_week} is ready`;
    case 'not_started':
      return `No workout yet · day ${Math.min(r.day_no, 7)} of the week, ${r.due} due by now`;
    case 'overdue': {
      const past = `${r.day_no - 7} day${r.day_no - 7 === 1 ? '' : 's'} past the week`;
      if (r.days_logged >= r.days_per_week) {
        const left = r.blocks_total - r.blocks_logged;
        return `All ${r.days_per_week} days trained, ${left} block${left === 1 ? '' : 's'} left · ${past}`;
      }
      return `${done} · ${past}`;
    }
    case 'behind':
      return `${done} · day ${r.day_no} of 7, ${r.due} due by now`;
    default:
      if (r.days_per_week > 0 && r.days_logged >= r.days_per_week) {
        const left = r.blocks_total - r.blocks_logged;
        return `All ${r.days_per_week} days trained · ${left} block${left === 1 ? '' : 's'} not logged yet`;
      }
      return `${done} · day ${Math.min(r.day_no, 7)} of 7`;
  }
}

function dayState(d: CoachDashboardDay): 'done' | 'part' | 'missed' | 'todo' {
  if (d.completed > 0) return d.logged < d.blocks ? 'part' : 'done';
  return d.logged > 0 ? 'missed' : 'todo';
}

const DAY_STATE_LABEL = { done: 'done', part: 'partly done', missed: 'missed', todo: 'not yet' } as const;

function DayDots({ days }: { days: CoachDashboardDay[] }) {
  if (days.length === 0) return <span className="cd-dots-empty">No workouts</span>;
  const trained = days.filter((d) => d.completed > 0).length;
  return (
    <span className="cd-dots" role="img" aria-label={`${trained} of ${days.length} days trained`}>
      {days.map((d, i) => {
        const state = dayState(d);
        return (
          <span
            key={`${d.day}-${i}`}
            className={`cd-dot ${state}`}
            title={`${d.day || `Day ${i + 1}`}: ${DAY_STATE_LABEL[state]} (${d.logged}/${d.blocks} blocks logged)`}
          />
        );
      })}
    </span>
  );
}

/** "Package · 12 days left" (2 weeks or less), "expires today", "expired 3d ago". */
function packageChip(row: CoachClientState) {
  const left = row.package_days_left;
  if (left == null || left > 14) return null;
  const title = row.package_ends_on ? `Coaching package ends ${row.package_ends_on}` : undefined;
  if (left < 0)
    return (
      <span title={title}>
        <Badge tone="accent">Package expired {-left}d ago</Badge>
      </span>
    );
  if (left === 0)
    return (
      <span title={title}>
        <Badge tone="accent">Package expires today</Badge>
      </span>
    );
  return (
    <span title={title}>
      <Badge tone="warn">Package · {left} day{left === 1 ? '' : 's'} left</Badge>
    </span>
  );
}

/** The latest answer: "Check-in 🙂", "Wants to continue", "Review 2★". */
function reviewChip(row: CoachClientState) {
  if (!row.review_kind || !row.review_answered_at) return null;
  const low = isLow({ mood: row.review_mood, progress: row.review_progress, rating: row.review_rating, recommend: row.review_recommend });
  const title = `Answered ${new Date(row.review_answered_at).toLocaleDateString()}`;
  if (row.review_kind === 'checkin') {
    return (
      <span title={title}>
        <Badge tone={low ? 'warn' : undefined}>Check-in {MOOD_FACE[row.review_mood ?? 0]}</Badge>
      </span>
    );
  }
  const label = row.review_continue ? CONTINUE_LABEL[row.review_continue] : `Review ${row.review_rating}★`;
  return (
    <span title={`${title} · ${row.review_rating}★ · recommend ${row.review_recommend}/10`}>
      <Badge tone={row.review_continue === 'yes' && !low ? 'ok' : low || row.review_continue === 'no' ? 'warn' : undefined}>
        {label}
      </Badge>
    </span>
  );
}

const needsRenewal = (r: CoachClientState) => r.package_days_left != null && r.package_days_left <= 14;

function ClientRow({
  row,
  ai,
  showCoach,
  canEdit,
  onOpen,
  onBuild,
  onClose,
}: {
  row: CoachClientState;
  ai: boolean;
  showCoach: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onBuild: () => void;
  onClose: () => Promise<void>;
}) {
  const name = row.warrior_name || 'this athlete';
  const weekLabel =
    row.week_index != null ? `Week ${row.week_index} of ${row.week_count}` : `Week ${row.current_week} (not built)`;
  const buildNum = (row.last_week ?? row.current_week) + 1;
  return (
    <li className="cd-row">
      <button type="button" className="cd-open" onClick={onOpen}>
        <span className="cd-who">
          <span className="cd-name">{row.warrior_name || 'Unnamed athlete'}</span>
          <span className="cd-program">
            {row.template_name ?? 'Program'} · {weekLabel}
            {showCoach && row.coach_name ? ` · ${row.coach_name}` : ''}
          </span>
        </span>
        <span className="cd-week">
          <DayDots days={row.days} />
          <span className="cd-last">{row.last_log_at ? `Last workout ${ago(row.last_log_at)}` : 'No workouts yet'}</span>
        </span>
        <span className="cd-reason">
          <span>{reasonText(row, ai)}</span>
          {(row.rpe_high > 0 || row.notes_count > 0 || row.missed_days > 0 || packageChip(row) || reviewChip(row)) && (
            <span className="cd-tags">
              {reviewChip(row)}
              {packageChip(row)}
              {row.rpe_high > 0 && (
                <span title={`${row.rpe_high} block${row.rpe_high === 1 ? '' : 's'} rated RPE 9 or more this week`}>
                  <Badge tone="warn">RPE 9+</Badge>
                </span>
              )}
              {row.notes_count > 0 && (
                <span title="Wrote a note on a workout this week">
                  <Badge>Note</Badge>
                </span>
              )}
              {row.missed_days > 0 && <Badge>Missed {row.missed_days}</Badge>}
            </span>
          )}
        </span>
      </button>
      <div className="cd-action">
        {row.status === 'waiting' && !ai ? (
          <button type="button" className="btn small primary" disabled={!canEdit} onClick={onBuild}>
            Build week {buildNum}
          </button>
        ) : (
          <button type="button" className="btn small" onClick={onOpen}>
            Week logs
          </button>
        )}
        {row.status === 'quiet' && !ai && (
          <ConfirmButton
            label="Close program"
            disabled={!canEdit}
            title={`Close ${name}'s program?`}
            body={`It moves to Completed: it leaves this dashboard and ${name}'s app, and every workout they logged is kept. You can switch it back on from Clients.`}
            confirmLabel="Close program"
            onConfirm={onClose}
          />
        )}
      </div>
    </li>
  );
}

/** Ranked by commitment, then weeks finished in a row, then training days
 * done. Under a week on the program: listed as new, not ranked. */
function CommitmentBoard({ rows, onOpen }: { rows: CoachClientState[]; onOpen: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const ranked = rows
    .filter((r) => r.commitment != null)
    .sort(
      (a, b) =>
        b.commitment! - a.commitment! || b.weeks_streak - a.weeks_streak || b.done_28d - a.done_28d,
    );
  const fresh = rows.filter((r) => r.commitment == null);
  const shown = showAll ? ranked : ranked.slice(0, 10);

  return (
    <section className="panel cd-board" aria-labelledby="cd-board-title">
      <div className="panel-head">
        <h2 id="cd-board-title">Most committed</h2>
        <span className="label">last 28 days</span>
      </div>
      {ranked.length === 0 ? (
        <div className="panel-body cd-board-empty">Clients are ranked after their first week.</div>
      ) : (
        <ol className="cd-rank">
          {shown.map((r, i) => (
            <li key={r.assignment_id}>
              <span className="cd-rank-n num">{i + 1}</span>
              <button type="button" className="cd-rank-name" onClick={() => onOpen(r.assignment_id)}>
                {r.warrior_name || 'Unnamed athlete'}
              </button>
              <span className="cd-rank-pct num">{r.commitment}%</span>
              <span className="cd-meter" aria-hidden="true">
                <span style={{ width: `${r.commitment}%` }} />
              </span>
              <span className="cd-rank-meta">
                {r.done_28d} day{r.done_28d === 1 ? '' : 's'} trained
                {r.weeks_streak > 0 ? ` · ${r.weeks_streak} week${r.weeks_streak === 1 ? '' : 's'} in a row` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      {ranked.length > 10 && (
        <div className="cd-board-more">
          <button type="button" className="btn small ghost" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show top 10' : `Show all ${ranked.length}`}
          </button>
        </div>
      )}
      {fresh.length > 0 && (
        <p className="cd-board-note">
          New, not ranked yet: {fresh.map((r) => r.warrior_name || 'Unnamed').join(', ')}
        </p>
      )}
      <p className="cd-board-note">
        Training days done against what their program asks for. Ties go to weeks finished in a row.
      </p>
    </section>
  );
}

function ClientDrawer({ row, onClose, week, onWeekChange, ai, canEdit }: {
  row: CoachClientState;
  onClose: () => void;
  week: number | null;
  onWeekChange: (week: number) => void;
  ai: boolean;
  canEdit: boolean;
}) {
  const assignmentQ = useQuery({
    queryKey: ['assignment', row.assignment_id],
    queryFn: () => fetchAssignment(row.assignment_id),
  });
  return (
    <Drawer open wide title={`Week logs · ${row.warrior_name || 'athlete'}`} onClose={onClose}>
      {!ai && (
        <PackagePanel coachId={row.coach_id} warriorId={row.warrior_id} warriorName={row.warrior_name} canEdit={canEdit} />
      )}
      {!ai && <ReviewsPanel coachId={row.coach_id} warriorId={row.warrior_id} />}
      {!ai && assignmentQ.data && <TestsPanel assignment={assignmentQ.data} />}
      {assignmentQ.error && <ErrorNote error={assignmentQ.error} />}
      {assignmentQ.isLoading && <div className="skeleton" style={{ height: 160 }} />}
      {assignmentQ.data && (
        <ProgressDrawer
          assignment={assignmentQ.data}
          initialWeek={week ?? (row.week_index != null ? row.current_week : row.last_week)}
          onWeekChange={onWeekChange}
        />
      )}
    </Drawer>
  );
}

export function CoachDashboardPage() {
  const { isAdmin, isCoachPaused, pausedAssistingCoachIds } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  // Filter, source and the open client live in the address, so "Save &
  // return" from the editor lands back on the same view.
  const [params, setParams] = useSearchParams();
  const source: 'coach' | 'ai' = isAdmin && params.get('source') === 'ai' ? 'ai' : 'coach';
  const statusParam = params.get('status');
  const filter = GROUPS.some((g) => g.status === statusParam) ? (statusParam as CoachClientStatus) : null;

  const openId = params.get('client');
  const openWeek = Number(params.get('week')) || null;
  const ai = source === 'ai';
  // Packages ending within 2 weeks or already expired (its own view).
  const renewalsView = !ai && statusParam === 'renewals';

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v == null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // The week shown in the open client's logs. Stable, and a no-op when the
  // week is already in the address or no client is open: the logs panel
  // reports its week after every render, and an unconditional update here
  // kept re-adding ?client= right after the panel was closed.
  const setWeek = useCallback(
    (week: number) =>
      setParams(
        (prev) => {
          if (!prev.get('client') || prev.get('week') === String(week)) return prev;
          const next = new URLSearchParams(prev);
          next.set('week', String(week));
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['coach-dashboard', source],
    queryFn: () => fetchCoachDashboard(source),
    refetchInterval: 5 * 60_000,
  });

  const rows = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(GROUPS.map((g) => [g.status, 0])) as Record<CoachClientStatus, number>;
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  const showCoach = new Set(rows.map((r) => r.coach_id)).size > 1;
  const openRow = openId ? rows.find((r) => r.assignment_id === openId) : undefined;

  // Inside a group: the longest wait / longest silence first.
  const sortedIn = (status: CoachClientStatus) =>
    rows
      .filter((r) => r.status === status)
      .sort((a, b) => {
        if (status === 'waiting') return (a.finished_at ?? a.week_started_at).localeCompare(b.finished_at ?? b.week_started_at);
        if (status === 'behind' || status === 'not_started') return b.due - b.days_logged - (a.due - a.days_logged) || a.last_activity_at.localeCompare(b.last_activity_at);
        if (status === 'quiet') return a.last_activity_at.localeCompare(b.last_activity_at);
        return (a.warrior_name ?? '').localeCompare(b.warrior_name ?? '');
      });

  const label = (g: (typeof GROUPS)[number]) => (ai && g.aiLabel ? g.aiLabel : g.label);
  const summary = GROUPS.filter((g) => ['waiting', 'behind', 'not_started'].includes(g.status) && counts[g.status] > 0)
    .map((g) => `${counts[g.status]} ${label(g).toLowerCase()}`)
    .join(', ');

  const build = (r: CoachClientState) => {
    const from = `/coaching${location.search}`;
    navigate(
      `/coaching/clients/${r.assignment_id}?week=${r.last_week ?? r.current_week}&add=1&from=${encodeURIComponent(from)}`,
    );
  };

  const groups = renewalsView ? [] : GROUPS.filter((g) => (filter ? g.status === filter : counts[g.status] > 0));
  const renewals = rows
    .filter(needsRenewal)
    .sort((a, b) => (a.package_days_left ?? 0) - (b.package_days_left ?? 0));

  return (
    <div className="page cd-page">
      <PageHeader
        title="Coaching"
        sub={
          isLoading
            ? 'Loading your clients…'
            : rows.length === 0
              ? 'No active clients.'
              : summary
                ? `Today: ${summary}.`
                : 'Everyone is on track.'
        }
        actions={
          isAdmin ? (
            <div className="seg" role="group" aria-label="Programs">
              <button type="button" className="seg-item" aria-pressed={!ai} onClick={() => update({ source: null, client: null, week: null, status: null })}>
                Coach clients
              </button>
              <button type="button" className="seg-item" aria-pressed={ai} onClick={() => update({ source: 'ai', client: null, week: null, status: null })}>
                AI Coach
              </button>
            </div>
          ) : undefined
        }
      />

      {error && <ErrorNote error={error} />}

      <div className="cd-chips" role="group" aria-label="Show">
        <button type="button" className="cd-chip" aria-pressed={!filter && !renewalsView} onClick={() => update({ status: null })}>
          All <span className="num">{rows.length}</span>
        </button>
        {GROUPS.map((g) => (
          <button
            key={g.status}
            type="button"
            className={`cd-chip tone-${g.tone}`}
            aria-pressed={filter === g.status}
            onClick={() => update({ status: filter === g.status ? null : g.status })}
          >
            <span className="cd-chip-dot" aria-hidden="true" />
            {label(g)} <span className="num">{counts[g.status]}</span>
          </button>
        ))}
        {!ai && (
          <button
            type="button"
            className="cd-chip tone-accent"
            aria-pressed={renewalsView}
            title="Coaching packages ending within 2 weeks, or expired"
            onClick={() => update({ status: renewalsView ? null : 'renewals' })}
          >
            <span className="cd-chip-dot" aria-hidden="true" />
            Renewals <span className="num">{renewals.length}</span>
          </button>
        )}
      </div>

      <div className="cd-layout">
        <div className="cd-main">
          {isLoading && (
            <section className="panel">
              <div className="panel-body">
                <div className="skeleton" style={{ height: 52, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 52, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 52 }} />
              </div>
            </section>
          )}
          {!isLoading && rows.length === 0 && (
            <section className="panel">
              <div className="empty">
                <span className="label">No active clients</span>
                {ai ? 'Nobody is training on an AI Coach program right now.' : 'Assign a program from Clients to start.'}
              </div>
            </section>
          )}
          {renewalsView && (
            <section className="panel cd-group tone-accent" aria-labelledby="cd-renewals">
              <div className="panel-head">
                <h2 id="cd-renewals">
                  <span className="cd-chip-dot" aria-hidden="true" />
                  Renewals
                </h2>
                <span className="label num">{renewals.length}</span>
              </div>
              {renewals.length === 0 ? (
                <div className="panel-body cd-board-empty">
                  No package ends in the next 2 weeks. Set packages from a client's week logs.
                </div>
              ) : (
                <ul className="cd-list">
                  {renewals.map((r) => (
                    <ClientRow
                      key={r.assignment_id}
                      row={r}
                      ai={ai}
                      showCoach={showCoach}
                      canEdit={!isCoachPaused && !pausedAssistingCoachIds.includes(r.coach_id)}
                      onOpen={() => update({ client: r.assignment_id, week: null })}
                      onBuild={() => build(r)}
                      onClose={async () => {
                        await setAssignmentStatus(r.assignment_id, 'completed');
                        await queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] });
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
          {!isLoading && rows.length > 0 && !renewalsView && groups.length === 0 && (
            <section className="panel">
              <div className="empty">
                <span className="label">Nobody here</span>
                No clients in this group right now.
              </div>
            </section>
          )}
          {groups.map((g) => {
            const list = sortedIn(g.status);
            return (
              <section key={g.status} className={`panel cd-group tone-${g.tone}`} aria-labelledby={`cd-${g.status}`}>
                <div className="panel-head">
                  <h2 id={`cd-${g.status}`}>
                    <span className="cd-chip-dot" aria-hidden="true" />
                    {label(g)}
                  </h2>
                  <span className="label num">{list.length}</span>
                </div>
                {list.length === 0 ? (
                  <div className="panel-body cd-board-empty">No clients in this group right now.</div>
                ) : (
                  <ul className="cd-list">
                    {list.map((r) => (
                      <ClientRow
                        key={r.assignment_id}
                        row={r}
                        ai={ai}
                        showCoach={showCoach}
                        canEdit={!isCoachPaused && !pausedAssistingCoachIds.includes(r.coach_id)}
                        onOpen={() => update({ client: r.assignment_id, week: null })}
                        onBuild={() => build(r)}
                        onClose={async () => {
                          await setAssignmentStatus(r.assignment_id, 'completed');
                          toast(`${r.warrior_name || 'Program'} closed. It's under Completed in Clients.`);
                          await Promise.all([
                            queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] }),
                            queryClient.invalidateQueries({ queryKey: ['assignments'] }),
                          ]);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
        {rows.length > 0 && (
          <aside className="cd-side">
            <CommitmentBoard rows={rows} onOpen={(id) => update({ client: id, week: null })} />
          </aside>
        )}
      </div>

      {openRow && (
        <ClientDrawer
          key={openRow.assignment_id}
          row={openRow}
          week={openWeek}
          onWeekChange={setWeek}
          onClose={() => update({ client: null, week: null })}
          ai={ai}
          canEdit={!isCoachPaused && !pausedAssistingCoachIds.includes(openRow.coach_id)}
        />
      )}
    </div>
  );
}
