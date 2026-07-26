import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import './DashboardPage.css';
import { fetchDashboardOverview, fetchDashboardTrends } from '@/api/dashboard';
import { fetchCoachingAnalytics } from '@/api/coaching';
import { CHALLENGE_GROUPS, DISCIPLINE_SERIES, formatDate, formatRelativeTime } from '@/shared/constants';
import { ErrorNote, Badge } from '@/components/bits';
import { StatCard } from '@/components/dashboard/StatCard';
import { WarriorGrowthChart } from '@/components/dashboard/WarriorGrowthChart';
import { WorldParticipationChart } from '@/components/dashboard/WorldParticipationChart';
import { WeeklyActivityChart } from '@/components/dashboard/WeeklyActivityChart';
import { CoachEngagementChart } from '@/components/dashboard/CoachEngagementChart';

function WeekRow({
  title,
  weekStart,
  groups,
}: {
  title: string;
  weekStart: string;
  groups: number[];
}) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '10px 0' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
        <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>
          Week of {formatDate(weekStart)}
        </div>
      </div>
      <div className="row">
        {CHALLENGE_GROUPS.map((g) =>
          groups.includes(g.id) ? (
            <Badge key={g.id} tone="ok">
              {g.name}
            </Badge>
          ) : (
            <Badge key={g.id} tone="warn">
              {g.name} — missing
            </Badge>
          ),
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: fetchDashboardOverview,
  });
  const { data: trends } = useQuery({
    queryKey: ['dashboard-trends', 8],
    queryFn: () => fetchDashboardTrends(8),
  });
  const { data: coaching } = useQuery({
    queryKey: ['coaching-analytics'],
    queryFn: fetchCoachingAnalytics,
  });

  const worlds = data?.world_participation;
  const worldBars = worlds
    ? DISCIPLINE_SERIES.map((d) => ({
        key: d.key,
        label: d.label,
        cssVar: d.cssVar,
        value: worlds[d.key],
      }))
    : undefined;
  const weeklyActivityWeeks = trends?.slice(-6);

  const missingNextWeek =
    data && CHALLENGE_GROUPS.some((g) => !data.next_week_challenge_groups.includes(g.id));

  return (
    <div className="page dashboard-v2">
      {missingNextWeek && (
        <div className="notice dv-banner">
          <span className="label">Challenge gap</span>
          <span>
            No challenge configured for every group for the week starting{' '}
            {formatDate(data.next_week_start)}.
          </span>
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Arena-wide activity at a glance.</div>
        </div>
        <div className="dv-updated-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          Updated {formatRelativeTime(dataUpdatedAt)}
        </div>
      </div>

      {error && <ErrorNote error={error} />}

      <div className="stat-strip" role="group" aria-label="Headline stats">
        <StatCard
          label="Warriors"
          value={data?.total_users}
          hint="total accounts"
          delta={data?.total_users_delta}
        />
        <StatCard label="Assessed" value={data?.assessed_users} hint="completed onboarding" />
        <StatCard
          label="Active this week"
          value={data?.active_this_week}
          hint="logged anything since Saturday"
          delta={data?.active_this_week_delta}
        />
        <StatCard label="Coaches" value={data?.coaches} />
        <StatCard label="Communities" value={data?.community_count} />
        <StatCard
          label="Workouts this week"
          value={data?.workouts_this_week}
          hint="warriors who logged one"
        />
      </div>

      <div className="dv-chart-row">
        <section className="panel dv-chart-panel" style={{ flex: '2 1 480px' }}>
          <div className="panel-head">
            <h2>Warrior growth</h2>
            <span className="label">last 8 weeks</span>
          </div>
          <div className="panel-body">
            {trends ? (
              <WarriorGrowthChart weeks={trends} />
            ) : (
              <div className="skeleton" style={{ height: 180 }} />
            )}
          </div>
        </section>

        <section className="panel dv-chart-panel" style={{ flex: '1 1 280px' }}>
          <div className="panel-head">
            <h2>World participation</h2>
            <span className="label">warriors with activity</span>
          </div>
          <div className="panel-body">
            {worldBars ? (
              <WorldParticipationChart bars={worldBars} />
            ) : (
              <div className="skeleton" style={{ height: 90 }} />
            )}
          </div>
        </section>
      </div>

      <div className="dv-chart-row">
        <section className="panel dv-chart-panel" style={{ flex: '1 1 380px' }}>
          <div className="panel-head">
            <h2>Weekly activity</h2>
            <span className="label">active warriors</span>
          </div>
          <div className="panel-body">
            {weeklyActivityWeeks ? (
              <WeeklyActivityChart weeks={weeklyActivityWeeks} />
            ) : (
              <div className="skeleton" style={{ height: 140 }} />
            )}
          </div>
        </section>

        <section className="panel dv-chart-panel" style={{ flex: '1 1 380px' }}>
          <div className="panel-head">
            <h2>Coach engagement</h2>
            <span className="label">clients active</span>
          </div>
          <div className="panel-body">
            {coaching ? (
              <CoachEngagementChart coaches={coaching.coach_leaderboard} />
            ) : (
              <div className="skeleton" style={{ height: 90 }} />
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Weekly challenges</h2>
          <Link to="/leaderboards" className="label" style={{ textDecoration: 'none' }}>
            Boards →
          </Link>
        </div>
        <div className="panel-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {data ? (
            <>
              <WeekRow
                title="This week"
                weekStart={data.week_start}
                groups={data.this_week_challenge_groups}
              />
              <div style={{ borderTop: '1px solid var(--hairline)' }} />
              <WeekRow
                title="Next week"
                weekStart={data.next_week_start}
                groups={data.next_week_challenge_groups}
              />
            </>
          ) : (
            <div className="skeleton" style={{ height: 80, margin: '12px 0' }} />
          )}
        </div>
      </section>
    </div>
  );
}
