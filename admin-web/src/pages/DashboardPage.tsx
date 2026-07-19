import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchDashboardOverview } from '@/api/dashboard';
import { CHALLENGE_GROUPS, formatDate } from '@/shared/constants';
import { ErrorNote, Badge } from '@/components/bits';

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
}) {
  return (
    <div className="stat-cell">
      <span className="label">{label}</span>
      {value === undefined ? (
        <div className="skeleton" style={{ height: 30, width: 64 }} />
      ) : (
        <span className="value">{value.toLocaleString()}</span>
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

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
  const { data, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: fetchDashboardOverview,
  });

  const worlds = data?.world_participation;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Arena-wide activity at a glance.</div>
        </div>
      </div>

      {error && <ErrorNote error={error} />}

      <div className="stat-strip" role="group" aria-label="Headline stats">
        <StatCell label="Warriors" value={data?.total_users} hint="total accounts" />
        <StatCell
          label="Assessed"
          value={data?.assessed_users}
          hint="completed onboarding"
        />
        <StatCell
          label="Active this week"
          value={data?.active_this_week}
          hint="logged anything since Saturday"
        />
        <StatCell label="Coaches" value={data?.coaches} />
        <StatCell label="Communities" value={data?.community_count} />
        <StatCell
          label="Waitlist"
          value={data?.pending_invite_requests}
          hint="pending requests"
        />
      </div>

      <div className="grid-2">
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

        <section className="panel">
          <div className="panel-head">
            <h2>World participation</h2>
            <span className="label">warriors with activity</span>
          </div>
          <div className="panel-body">
            {worlds ? (
              <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
                <dt>Strength</dt>
                <dd className="num">{worlds.strength.toLocaleString()}</dd>
                <dt>Power</dt>
                <dd className="num">{worlds.power.toLocaleString()}</dd>
                <dt>Static</dt>
                <dd className="num">{worlds.static.toLocaleString()}</dd>
                <dt>1-Min-Max</dt>
                <dd className="num">{worlds.one_mm.toLocaleString()}</dd>
              </dl>
            ) : (
              <div className="skeleton" style={{ height: 90 }} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
