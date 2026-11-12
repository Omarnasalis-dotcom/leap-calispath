import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchLastWorkout, fetchUserPrograms, type UserProgramRow } from '@/api/users';
import { fetchWarriorProgress } from '@/api/coaching';
import { fetchCoachChatThread } from '@/api/aiCoachChats';
import { fetchProgramReviews, type ProgramReviewRow } from '@/api/programReviews';
import { fetchAthleteFairPlay } from '@/api/fairPlay';
import { Badge, ErrorNote } from '@/components/bits';
import { DataTable, type Column } from '@/components/DataTable';
import { PerformancePanel } from '@/components/performance/PerformancePanel';
import { Thread } from '@/pages/aiCoachChats/AiCoachChatsPage';
import {
  formatDate,
  formatDateTime,
  programSource,
  PROGRAM_SOURCE_LABEL,
  SUBSCRIPTION_TIER_COLORS,
  subscriptionTierLabel,
} from '@/shared/constants';
import type { AdminUserProfile } from '@/shared/types';

export const USER_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'access', label: 'Access' },
  { key: 'program', label: 'Program' },
  { key: 'ai-coach', label: 'AI Coach' },
  { key: 'fair-play', label: 'Fair Play' },
  { key: 'trials', label: 'Trials & tiers' },
] as const;
export type UserTab = (typeof USER_TABS)[number]['key'];

export function isUserTab(v: string | undefined): v is UserTab {
  return USER_TABS.some((t) => t.key === v);
}

export const userTabPath = (id: string, tab: UserTab) => (tab === 'overview' ? `/users/${id}` : `/users/${id}/${tab}`);

/** Tabs as links: each tab has its own address, Back works. */
export function UserTabs({ id, active }: { id: string; active: UserTab }) {
  return (
    <nav className="tabs" aria-label="User sections">
      {USER_TABS.map((t) => (
        <Link
          key={t.key}
          to={userTabPath(id, t.key)}
          className={`tab${t.key === active ? ' active' : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const DAY = 86_400_000;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** The athlete's active program, else the newest one. */
export function useUserPrograms(id: string) {
  const q = useQuery({ queryKey: ['user-programs', id], queryFn: () => fetchUserPrograms(id) });
  const current = q.data?.find((p) => p.status === 'active') ?? null;
  return { ...q, current };
}

function SummaryBlock({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  return (
    <section className="panel summary-block">
      <div className="panel-head">
        <h2>{title}</h2>
        <Link to={to} className="summary-link">
          Open →
        </Link>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Overview: plan, current program, AI Coach and Fair Play at a glance. */
export function UserOverview({ id, u }: { id: string; u: AdminUserProfile }) {
  const programs = useUserPrograms(id);
  const current = programs.current;
  const progressQ = useQuery({
    queryKey: ['warrior-progress', current?.id],
    queryFn: () => fetchWarriorProgress(current!.id),
    enabled: !!current,
  });
  const lastWorkoutQ = useQuery({ queryKey: ['user-last-workout', id], queryFn: () => fetchLastWorkout(id) });
  // Owner-only server-side (chat reviewers); anyone else sees a note instead.
  const chatQ = useQuery({ queryKey: ['coach-chat-thread', id, null], queryFn: () => fetchCoachChatThread(id, null), retry: false });
  const openReviewsQ = useQuery({ queryKey: ['program-reviews', 'open'], queryFn: () => fetchProgramReviews('open') });
  const fairQ = useQuery({ queryKey: ['fair-play', 'athlete', id], queryFn: () => fetchAthleteFairPlay(id) });

  const plan = subscriptionTierLabel(u.subscription_tier, u.access_expires_at);
  const hasAccess = !!u.access_expires_at && new Date(u.access_expires_at).getTime() > Date.now();

  const week = progressQ.data?.weekly_completion?.at(-1);
  const since = Date.now() - 7 * DAY;
  const turns = chatQ.data?.turns ?? [];
  const recent = turns.filter((t) => new Date(t.created_at).getTime() >= since);
  const lastTurn = turns.at(-1);
  const recentIssues = recent.filter(
    (t) => t.outcome !== 'ok' || t.tool_errors > 0 || t.safety_flags.length > 0 || t.unacted_correction,
  ).length;
  const openReview = openReviewsQ.data?.find((r) => r.user_id === id);

  const holds = fairQ.data?.holds ?? [];
  const strikes = holds.filter((h) => h.counts_as_strike && h.lifted_reason !== 'appeal_accepted').length;
  const activeHolds = holds.filter((h) => h.status !== 'lifted').length;
  const openFlags = (fairQ.data?.flags ?? []).filter((f) => f.status === 'open').length;
  const pendingAppeal = (fairQ.data?.appeals ?? []).some((a) => a.status === 'pending');

  return (
    <div className="tab-stack">
      <div className="summary-grid">
        <SummaryBlock title="Plan & access" to={userTabPath(id, 'access')}>
          <Facts
            rows={[
              ['Plan', <Badge color={SUBSCRIPTION_TIER_COLORS[plan]}>{plan}</Badge>],
              ['Status', <Badge tone={hasAccess ? 'ok' : 'warn'}>{hasAccess ? 'active' : 'no paid access'}</Badge>],
              ['Ends', formatDate(u.access_expires_at)],
              ['Source', u.entitlement_source ?? '—'],
              ...(u.duplicate_subscription_flagged_at
                ? ([['Warning', <Badge tone="warn">possible duplicate subscription</Badge>]] as Array<[string, ReactNode]>)
                : []),
            ]}
          />
        </SummaryBlock>

        <SummaryBlock title="Current program" to={userTabPath(id, 'program')}>
          {programs.error && <ErrorNote error={programs.error} />}
          {programs.isLoading ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : current ? (
            <>
              <Facts
                rows={[
                  ['Program', current.template_name ?? '—'],
                  ['Source', PROGRAM_SOURCE_LABEL[programSource(current.coach_id)]],
                  ['Week', current.current_week ?? '—'],
                  ['Last workout', lastWorkoutQ.data ? formatDateTime(lastWorkoutQ.data) : 'none yet'],
                  ['This week', week ? `${week.completed} of ${week.total} done (${pct(week.completed, week.total)}%)` : '—'],
                ]}
              />
              <div className="row" style={{ marginTop: 12 }}>
                <Link className="btn small" to={`/coaching/clients/${current.id}`}>
                  Edit program
                </Link>
                <Link className="btn small" to={`/coaching/clients/${current.id}/progress`}>
                  Progress
                </Link>
              </div>
            </>
          ) : (
            <div className="dim">No active program{lastWorkoutQ.data ? ` · last workout ${formatDate(lastWorkoutQ.data)}` : ''}.</div>
          )}
        </SummaryBlock>

        <SummaryBlock title="AI Coach" to={userTabPath(id, 'ai-coach')}>
          {chatQ.isError ? (
            <div className="dim">Only the chat reviewer can see AI Coach chats.</div>
          ) : chatQ.isLoading ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : (
            <Facts
              rows={[
                ['Messages, 7 days', recent.length],
                ['Last message', lastTurn ? formatDateTime(lastTurn.created_at) : 'never'],
                ['Went wrong, 7 days', recentIssues > 0 ? <Badge tone="warn">{recentIssues}</Badge> : '0'],
                [
                  'Open review',
                  openReview ? <Link to={`/program-reviews/${openReview.id}`}>Week {openReview.week_number} · waiting</Link> : 'none',
                ],
              ]}
            />
          )}
        </SummaryBlock>

        <SummaryBlock title="Fair Play" to={userTabPath(id, 'fair-play')}>
          {fairQ.error && <ErrorNote error={fairQ.error} />}
          {fairQ.isLoading ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : (
            <Facts
              rows={[
                ['Strikes', strikes > 0 ? <Badge tone="warn">{strikes}</Badge> : '0'],
                ['Hidden from boards', activeHolds > 0 ? <Badge tone="warn">{`${activeHolds} hold${activeHolds === 1 ? '' : 's'}`}</Badge> : 'no'],
                ['Open flags', openFlags > 0 ? <Badge tone="accent">{openFlags}</Badge> : '0'],
                ['Appeal', pendingAppeal ? <Badge tone="warn">waiting for you</Badge> : 'none'],
              ]}
            />
          )}
        </SummaryBlock>
      </div>
    </div>
  );
}

const PROGRAM_COLUMNS: Column<UserProgramRow>[] = [
  { key: 'name', header: 'Program', render: (p) => <span style={{ fontWeight: 700 }}>{p.template_name ?? '—'}</span> },
  {
    key: 'source',
    header: 'Source',
    render: (p) => {
      const s = programSource(p.coach_id);
      return s === 'coach' ? <span className="dim">{p.coach_name ?? 'Coach'}</span> : <Badge tone={s === 'ai' ? 'accent' : undefined}>{PROGRAM_SOURCE_LABEL[s]}</Badge>;
    },
  },
  { key: 'status', header: 'Status', render: (p) => <Badge tone={p.status === 'active' ? 'ok' : undefined}>{p.status ?? '—'}</Badge> },
  { key: 'week', header: 'Week', align: 'right', render: (p) => <span className="num">{p.current_week ?? '—'}</span> },
  { key: 'assigned', header: 'Started', render: (p) => <span className="dim">{formatDate(p.assigned_at)}</span> },
];

/** Program: current program with its actions, every program, Performance. */
export function UserProgramTab({ id, name }: { id: string; name: string }) {
  const programs = useUserPrograms(id);
  return (
    <div className="tab-stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Programs</h2>
          {programs.current && (
            <div className="row">
              <Link className="btn small" to={`/coaching/clients/${programs.current.id}`}>
                Edit current program
              </Link>
              <Link className="btn small" to={`/coaching/clients/${programs.current.id}/progress`}>
                Progress
              </Link>
            </div>
          )}
        </div>
        {programs.error && (
          <div className="panel-body">
            <ErrorNote error={programs.error} />
          </div>
        )}
        <DataTable
          columns={PROGRAM_COLUMNS}
          rows={programs.data}
          rowKey={(p) => p.id}
          loading={programs.isLoading}
          emptyLabel="No programs"
          emptyHint="This athlete hasn't picked, been assigned or built a program yet."
          onRowClick={undefined}
        />
      </section>
      <PerformancePanel userId={id} athleteName={name} />
    </div>
  );
}

const REVIEW_STATUSES = ['open', 'closed', 'cancelled'] as const;

/** AI Coach: the chat (same view as AI Coach chats) and program reviews. */
export function UserAiTab({ id }: { id: string }) {
  const reviewsQ = useQuery({
    queryKey: ['program-reviews', 'user', id],
    queryFn: async () => {
      const lists = await Promise.all(REVIEW_STATUSES.map((s) => fetchProgramReviews(s)));
      return lists.flat().filter((r) => r.user_id === id).sort((a, b) => b.requested_at.localeCompare(a.requested_at));
    },
  });
  const reviews: ProgramReviewRow[] = reviewsQ.data ?? [];
  return (
    <div className="tab-stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Program reviews</h2>
          <span className="label num">{reviews.length}</span>
        </div>
        <div className="panel-body">
          {reviewsQ.error && <ErrorNote error={reviewsQ.error} />}
          {reviewsQ.isLoading ? (
            <div className="skeleton" style={{ height: 40 }} />
          ) : reviews.length === 0 ? (
            <div className="dim">No program reviews requested.</div>
          ) : (
            <ul className="plain-list">
              {reviews.map((r) => (
                <li key={r.id}>
                  <Link to={`/program-reviews/${r.id}`}>
                    {r.program_name} · week {r.week_number}
                  </Link>{' '}
                  <Badge tone={r.status === 'open' ? 'warn' : r.outcome === 'changed' ? 'accent' : 'ok'}>
                    {r.status === 'open' ? 'waiting' : r.outcome ?? r.status}
                  </Badge>{' '}
                  <span className="dim">{formatDateTime(r.requested_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <Thread userId={id} />
    </div>
  );
}
