import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchGrowthAnalytics, type GrowthFunnelStep } from '@/api/growth';
import { formatDate } from '@/shared/constants';
import { ErrorNote } from '@/components/bits';

// Growth funnel from admin_get_growth_analytics (audit 2026-09-25, M5/M18).
// Funnel steps 1-6 and 8 are derived from existing data, so they cover every
// signup in the range; "Saw the paywall" and the event table only count from
// when app_events tracking shipped.
const RANGES = [7, 30, 90] as const;

const EVENT_LABEL: Record<string, string> = {
  app_opened: 'App opened',
  complete_profile_viewed: 'Username screen viewed',
  complete_profile_error: 'Username screen error',
  paywall_viewed: 'Paywall viewed',
  purchase_completed: 'Purchase completed',
  purchase_restored: 'Purchase restored',
  purchase_cancelled: 'Paywall dismissed',
  paywall_failed: 'Paywall failed to load',
  ai_coach_opened: 'AI Coach opened',
};

function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

function Bar({ value, max, color = 'var(--accent)' }: { value: number; max: number; color?: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div style={{ background: 'var(--hairline)', borderRadius: 4, height: 8, minWidth: 80 }}>
      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 4 }} />
    </div>
  );
}

export function GrowthPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ['growth-analytics', days],
    queryFn: () => fetchGrowthAnalytics(days),
  });

  const funnel = data?.funnel ?? [];
  const signups = funnel.find((s) => s.step_order === 1)?.users ?? 0;
  const firstWorkout = funnel.find((s) => s.step_order === 5)?.users ?? 0;
  const day7 = funnel.find((s) => s.step_order === 6);
  const subscribed = funnel.find((s) => s.step_order === 8)?.users ?? 0;
  const maxDaily = Math.max(0, ...(data?.daily ?? []).map((d) => d.active_users));
  const avgDaily = data?.daily.length
    ? data.daily.reduce((sum, d) => sum + d.active_users, 0) / data.daily.length
    : 0;

  // The biggest step-to-step drop is where to look first.
  let biggestDrop: { from: GrowthFunnelStep; to: GrowthFunnelStep } | null = null;
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1];
    const cur = funnel[i];
    if (cur.eligible != null || prev.eligible != null || cur.step_order === 7) continue;
    const lost = prev.users - cur.users;
    if (!biggestDrop || lost > biggestDrop.from.users - biggestDrop.to.users) biggestDrop = { from: prev, to: cur };
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Growth</h1>
          <div className="sub">Where new signups get to, and how many people are active.</div>
        </div>
        <div className="row">
          {RANGES.map((r) => (
            <button
              key={r}
              className={`btn small${r === days ? ' primary' : ''}`}
              onClick={() => setDays(r)}
              aria-pressed={r === days}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorNote error={error} />}
      {isLoading && <div className="skeleton" style={{ height: 160 }} />}

      {data && (
        <>
          <div className="stat-strip" role="group" aria-label="Headline growth stats">
            <div className="stat-cell">
              <span className="label">Signups</span>
              <span className="value">{signups}</span>
              <span className="hint">last {data.days} days</span>
            </div>
            <div className="stat-cell">
              <span className="label">Did a first workout</span>
              <span className="value">{pct(firstWorkout, signups)}</span>
              <span className="hint">{firstWorkout} of {signups}</span>
            </div>
            <div className="stat-cell">
              <span className="label">Back after day 7</span>
              <span className="value">{day7 ? pct(day7.users, day7.eligible ?? 0) : '—'}</span>
              <span className="hint">{day7 ? `${day7.users} of ${day7.eligible ?? 0} eligible` : ''}</span>
            </div>
            <div className="stat-cell">
              <span className="label">Subscribed</span>
              <span className="value">{subscribed}</span>
              <span className="hint">{pct(subscribed, signups)} of signups</span>
            </div>
            <div className="stat-cell">
              <span className="label">Daily active (avg)</span>
              <span className="value">{avgDaily.toFixed(1)}</span>
              <span className="hint">peak {maxDaily}</span>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>Signup funnel</h2>
              {biggestDrop && (
                <span className="label">
                  Biggest drop: {biggestDrop.from.step} → {biggestDrop.to.step} (
                  {biggestDrop.from.users - biggestDrop.to.users} people)
                </span>
              )}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th style={{ textAlign: 'right' }}>People</th>
                    <th style={{ textAlign: 'right' }}>Of signups</th>
                    <th style={{ textAlign: 'right' }}>From previous step</th>
                    <th style={{ width: '30%' }} aria-label="Bar" />
                  </tr>
                </thead>
                <tbody>
                  {funnel.map((s, i) => {
                    const prev = i > 0 ? funnel[i - 1] : null;
                    const base = s.eligible ?? signups;
                    return (
                      <tr key={s.step_order}>
                        <td style={{ fontWeight: 700 }}>
                          {s.step}
                          {s.eligible != null && <span className="dim"> · of {s.eligible} old enough</span>}
                          {s.step_order === 7 && <span className="dim"> · tracked from this release on</span>}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>{s.users}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{pct(s.users, base)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {prev && s.eligible == null && prev.eligible == null && s.step_order !== 7 ? pct(s.users, prev.users) : '—'}
                        </td>
                        <td>
                          <Bar value={s.users} max={base} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Daily active users</h2>
              <span className="label">trained, logged anything, used the AI Coach or opened the app</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {[...data.daily].reverse().map((d) => (
                    <tr key={d.day}>
                      <td className="dim" style={{ width: 140 }}>{formatDate(d.day)}</td>
                      <td className="num" style={{ textAlign: 'right', width: 60 }}>{d.active_users}</td>
                      <td>
                        <Bar value={d.active_users} max={maxDaily} color="var(--violet)" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>App events</h2>
              <span className="label">last {data.days} days</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th style={{ textAlign: 'right' }}>Times</th>
                    <th style={{ textAlign: 'right' }}>People</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.event}>
                      <td>{EVENT_LABEL[e.event] ?? e.event}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{e.events}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{e.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.events.length === 0 && (
                <div className="empty">
                  <span className="label">No events yet</span>
                  Events start arriving once the app release with analytics is live.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
