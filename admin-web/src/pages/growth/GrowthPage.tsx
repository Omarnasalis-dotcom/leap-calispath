import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDeletedAccounts, fetchGrowthAnalytics, type GrowthFunnelStep } from '@/api/growth';
import { formatDate } from '@/shared/constants';
import { ErrorNote } from '@/components/bits';

// Growth funnel from admin_get_growth_analytics (audit 2026-09-25, M5/M18;
// accuracy fixes 2026-10-05). Funnel steps 1-6 and 8 are derived from
// existing data, so they cover every signup in the range — including
// accounts deleted since; "Saw the paywall" and the event table only count
// from when app_events tracking shipped. Admin accounts are excluded.
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
  welcome_intro_completed: 'Welcome intro completed',
  welcome_intro_skipped: 'Welcome intro skipped',
  training_center_opened: 'Training Center opened',
  program_started: 'Program started',
  quick_workout_started: 'Quick Workout started',
  workout_started: 'Workout started',
};

const REASON_LABEL: Record<string, string> = {
  not_using: 'Not using it',
  too_expensive: 'Too expensive',
  missing_features: 'Missing features',
  privacy: 'Privacy',
  other: 'Other',
  none: 'No reason given',
};

const PLAN_LABEL: Record<string, string> = { free: 'Free', first: 'First', pro: 'Pro', max: 'Max' };

/** Whole days between two timestamps. */
function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

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
  const deleted = useQuery({
    queryKey: ['deleted-accounts', days],
    queryFn: () => fetchDeletedAccounts(days),
  });

  const funnel = data?.funnel ?? [];
  const signups = funnel.find((s) => s.step_order === 1)?.users ?? 0;
  const firstWorkout = funnel.find((s) => s.step_order === 5)?.users ?? 0;
  const day7 = funnel.find((s) => s.step_order === 6);
  const subscribed = funnel.find((s) => s.step_order === 8)?.users ?? 0;
  const maxDaily = Math.max(0, ...(data?.daily ?? []).map((d) => d.active_users));
  // Today is still in progress, so it's left out of the average.
  const fullDays = (data?.daily ?? []).filter((d) => !d.partial);
  const avgDaily = fullDays.length
    ? fullDays.reduce((sum, d) => sum + d.active_users, 0) / fullDays.length
    : 0;
  const deletedSignups = funnel.find((s) => s.step_order === 1)?.deleted ?? 0;
  const eventCount = (name: string) => data?.events.find((e) => e.event === name);
  const paywallSteps = [
    { label: 'Saw the paywall', row: eventCount('paywall_viewed') },
    { label: 'Dismissed it', row: eventCount('purchase_cancelled') },
    { label: 'Failed to load', row: eventCount('paywall_failed') },
    { label: 'Bought', row: eventCount('purchase_completed') },
    { label: 'Restored', row: eventCount('purchase_restored') },
  ];
  const paywallViewers = paywallSteps[0].row?.users ?? 0;

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
              <span className="hint">
                last {data.days} days{deletedSignups > 0 ? ` · ${deletedSignups} since deleted` : ''}
              </span>
            </div>
            <div className="stat-cell">
              <span className="label">Did a first training</span>
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
              <span className="hint">peak {maxDaily} · today not counted</span>
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
                          {s.step_order === 7 && <span className="dim"> · tracked from 28 Sep 2026</span>}
                          {s.step_order === 8 && <span className="dim"> · store purchase with paid access now</span>}
                          {s.deleted > 0 && <span className="dim"> · {s.deleted} deleted since</span>}
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
              <span className="label">trained, logged anything, used the AI Coach or opened the app · days in {data.tz}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {[...data.daily].reverse().map((d) => (
                    <tr key={d.day}>
                      <td className="dim" style={{ width: 140 }}>
                        {formatDate(d.day)}
                        {d.partial && ' · today so far'}
                      </td>
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
              <h2>Paywall</h2>
              <span className="label">people, last {data.days} days</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {paywallSteps.map(({ label, row }) => (
                    <tr key={label}>
                      <td style={{ width: 180 }}>{label}</td>
                      <td className="num" style={{ textAlign: 'right', width: 60 }}>{row?.users ?? 0}</td>
                      <td className="num dim" style={{ textAlign: 'right', width: 60 }}>
                        {label === 'Saw the paywall' ? '' : pct(row?.users ?? 0, paywallViewers)}
                      </td>
                      <td>
                        <Bar value={row?.users ?? 0} max={paywallViewers} />
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

      <DeletedAccountsPanel days={days} data={deleted.data} error={deleted.error} loading={deleted.isLoading} />
    </div>
  );
}

// Anonymous record of each deleted account (deleted_accounts, from
// 2026-10-03 on — earlier deletions left no trace).
function DeletedAccountsPanel({
  days,
  data,
  error,
  loading,
}: {
  days: number;
  data: Awaited<ReturnType<typeof fetchDeletedAccounts>> | undefined;
  error: unknown;
  loading: boolean;
}) {
  const maxReason = Math.max(0, ...(data?.reasons ?? []).map((r) => r.deletions));
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Deleted accounts</h2>
        <span className="label">
          {data ? `${data.total} in the last ${days} days` : `last ${days} days`} · anonymous, tracked from 3 Oct 2026
        </span>
      </div>
      {error ? <ErrorNote error={error} /> : null}
      {loading && <div className="skeleton" style={{ height: 80 }} />}
      {data && data.total === 0 && (
        <div className="empty">
          <span className="label">No deleted accounts</span>
          Each deletion from now on shows here, without any personal details.
        </div>
      )}
      {data && data.total > 0 && (
        <>
          {data.weekly.length > 1 && (
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Week of</th>
                    <th style={{ textAlign: 'right' }}>Deletions</th>
                    <th style={{ width: '40%' }} aria-label="Bar" />
                  </tr>
                </thead>
                <tbody>
                  {[...data.weekly].reverse().map((w) => (
                    <tr key={w.week_start}>
                      <td className="dim">{formatDate(w.week_start)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{w.deletions}</td>
                      <td>
                        <Bar value={w.deletions} max={Math.max(...data.weekly.map((x) => x.deletions))} color="var(--danger, #e24b4a)" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Deletions</th>
                  <th style={{ width: '40%' }} aria-label="Bar" />
                </tr>
              </thead>
              <tbody>
                {data.reasons.map((r) => (
                  <tr key={r.reason}>
                    <td>{REASON_LABEL[r.reason] ?? r.reason}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{r.deletions}</td>
                    <td>
                      <Bar value={r.deletions} max={maxReason} color="var(--danger, #e24b4a)" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Deleted</th>
                  <th>Plan</th>
                  <th style={{ textAlign: 'right' }}>Account age</th>
                  <th style={{ textAlign: 'right' }}>Workouts</th>
                  <th style={{ textAlign: 'right' }}>Tier</th>
                  <th>Last active</th>
                  <th>Platform</th>
                  <th>Country</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const age = daysBetween(r.signed_up_at, r.deleted_at);
                  return (
                    <tr key={`${r.deleted_at}-${i}`}>
                      <td className="dim">{formatDate(r.deleted_at)}</td>
                      <td>{PLAN_LABEL[r.plan ?? ''] ?? r.plan ?? '—'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{age == null ? '—' : `${age} d`}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{r.workouts_logged ?? '—'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {r.strength_tier ?? '—'}
                        {r.onboarded === false && <span className="dim"> · not onboarded</span>}
                      </td>
                      <td className="dim">{r.last_active_at ? formatDate(r.last_active_at) : '—'}</td>
                      <td>{r.platform ?? '—'}</td>
                      <td>{r.country ?? '—'}</td>
                      <td>
                        {r.reason ? REASON_LABEL[r.reason] ?? r.reason : <span className="dim">—</span>}
                        {r.reason_note && <div className="dim" style={{ whiteSpace: 'pre-wrap' }}>{r.reason_note}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
