import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDeletedAccounts, fetchGrowthAnalytics, fetchOfferAnalytics, type GrowthAnalytics, type OfferAnalytics } from '@/api/growth';
import { formatDate } from '@/shared/constants';
import { ErrorNote } from '@/components/bits';

// Growth report from admin_get_growth_analytics (v3, audit 2026-10-29).
// The funnel and feature use are derived from the data itself, so they cover
// every signup in the range — including accounts deleted since. Only
// "Opened a workout" and the Paywall panel depend on app events. Admin
// accounts are excluded everywhere.
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
  coach_setup_step: 'AI Coach setup step',
  welcome_intro_completed: 'Welcome intro completed',
  welcome_intro_skipped: 'Welcome intro skipped',
  training_center_opened: 'Training Center opened',
  program_started: 'Program picked',
  quick_workout_started: 'Quick Workout started',
  workout_started: 'Workout started',
  trial_started: 'Trial started',
  trial_finished: 'Trial finished',
  trial_too_fast: 'Trial rejected (too fast)',
  trial_abandoned: 'Trial abandoned',
  step_finished: 'Trial step finished',
  team_tab_opened: 'Team tab opened',
  team_created: 'Team created',
  team_joined: 'Team joined',
  team_attempt_started: 'Team attempt started',
  team_attempt_submitted: 'Team attempt submitted',
  live_tab_opened: 'LIVE tab opened',
  live_room_created: 'LIVE room created',
  live_room_joined: 'LIVE room joined',
  live_half_started: 'LIVE half started',
  live_reps_logged: 'LIVE reps logged',
  live_match_finished: 'LIVE match finished',
  leaderboard_share_opened: 'Share card opened',
  leaderboard_shared: 'Share card shared',
  redeem_code_submitted: 'Code submitted',
  redeem_code_unlocked: 'Code unlocked a plan',
  offer_screen_viewed: 'Offer screen viewed',
  offer_claim_tapped: 'Offer claimed',
  offer_code_tapped: 'Offer code tapped',
  offer_dismissed: 'Offer dismissed',
  offer_banner_tapped: 'Offer banner tapped',
  add_week_locked_tapped: 'Locked ADD NEW WEEK tapped',
  update_chip_tapped: 'Update chip tapped',
  ai_week_review_tapped: 'AI week review tapped',
  ai_week_repeated: 'AI week repeated',
  ai_week_repeat_undone: 'AI week repeat undone',
  store_purchase: 'Store purchase (webhook)',
  store_renewal: 'Store renewal (webhook)',
};

const FEATURE_LABEL: Record<string, string> = {
  workouts: 'Logged a workout',
  trials: 'Strength trials & steps',
  weekly: 'Weekly Challenge',
  team: 'Team Challenge',
  live: 'Live Tournament',
  static: 'Static holds',
  one_min_max: '1 Min Max',
  power: 'Power assessment',
  arena: 'Champions Arena',
  ai_coach: 'AI Coach messages',
  share: 'Shared a leaderboard card',
};

const FUNNEL_NOTE: Partial<Record<GrowthAnalytics['funnel'][number]['key'], string>> = {
  onboarded: 'includes picking a program',
  opened_workout: 'started a workout or trial · from 10 Oct 2026, earlier only if they finished one',
  trained: 'any finished training: workout, trial, hold, 1MM, challenge',
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
  const offers = useQuery({
    queryKey: ['offer-analytics', days],
    queryFn: () => fetchOfferAnalytics(days),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Growth</h1>
          <div className="sub">Where new signups get to, who keeps training, and what they use.</div>
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

      {data && !data.headline && (
        <div className="empty">
          <span className="label">Database update pending</span>
          Apply migration 20261029170000_growth_analytics_v3 to see this report.
        </div>
      )}

      {data?.headline && (
        <>
          {data.key_events && <KeyEvents data={data} />}
          {data.subscribers && <SubscribersPanel data={data} />}
          <Headline data={data} />
          <FunnelPanel data={data} />
          <DailyPanel data={data} />
          <FeaturesPanel data={data} />
        </>
      )}

      {offers.error && <ErrorNote error={offers.error} />}
      {offers.data && <OffersPanel data={offers.data} />}

      <DeletedAccountsPanel days={days} data={deleted.data} error={deleted.error} loading={deleted.isLoading} />

      {data && <RawEventsPanel data={data} />}
    </div>
  );
}

// The money moments at a glance, in people. Subscribed joins the app's
// purchase event with the store webhook, so each purchase counts once.
function KeyEvents({ data }: { data: GrowthAnalytics }) {
  const k = data.key_events!;
  const h = data.headline!;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Key events</h2>
        <span className="label">people, last {data.days} days · store test purchases left out</span>
      </div>
      <div className="stat-strip" role="group" aria-label="Key events">
        <div className="stat-cell">
          <span className="label">Saw the paywall</span>
          <span className="value">{k.paywall_viewed}</span>
          <span className="hint">{k.paywall_dismissed} closed it without buying</span>
        </div>
        <div className="stat-cell">
          <span className="label">Subscribed</span>
          <span className="value">{k.subscribed}</span>
          <span className="hint">{pct(k.subscribed, k.paywall_viewed)} of paywall viewers</span>
        </div>
        <div className="stat-cell">
          <span className="label">Renewed</span>
          <span className="value">{k.renewed}</span>
          <span className="hint">store renewals, from 29 Oct 2026</span>
        </div>
        <div className="stat-cell">
          <span className="label">Unlocked with a code</span>
          <span className="value">{k.code_unlocked}</span>
          <span className="hint">{k.offer_shown} saw the welcome offer</span>
        </div>
        <div className="stat-cell">
          <span className="label">Paying now</span>
          <span className="value">{h.paying_store + h.paying_other}</span>
          <span className="hint">
            {h.paying_store} store · {h.paying_other} codes or grants
          </span>
        </div>
      </div>
    </section>
  );
}

// Store subscribers by name. The range switch applies to this list only:
// "This range" = bought (or bought again) inside the page's range, matching
// Key events' Subscribed; "All time" = everyone who ever subscribed.
function SubscribersPanel({ data }: { data: GrowthAnalytics }) {
  const [allTime, setAllTime] = useState(false);
  const since = Date.now() - data.days * 86_400_000;
  const all = data.subscribers ?? [];
  const rows = allTime ? all : all.filter((s) => new Date(s.last_at).getTime() >= since);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Subscribers</h2>
        <div className="row">
          <button className={`btn small${!allTime ? ' primary' : ''}`} onClick={() => setAllTime(false)} aria-pressed={!allTime}>
            Last {data.days} days ({all.filter((s) => new Date(s.last_at).getTime() >= since).length})
          </button>
          <button className={`btn small${allTime ? ' primary' : ''}`} onClick={() => setAllTime(true)} aria-pressed={allTime}>
            All time ({all.length})
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Username</th>
              <th>Plan</th>
              <th>First bought</th>
              <th>Ends</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.username}-${s.first_at}`}>
                <td style={{ fontWeight: 700 }}>{s.username ?? '—'}</td>
                <td>{PLAN_LABEL[s.plan ?? ''] ?? s.plan ?? '—'}</td>
                <td className="dim">{formatDate(s.first_at)}</td>
                <td className="dim">{s.ends_at ? formatDate(s.ends_at) : '—'}</td>
                <td>
                  {s.paying ? (
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Paying</span>
                  ) : (
                    <span className="dim">Ended</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty">
            <span className="label">No subscribers {allTime ? 'yet' : 'in this range'}</span>
            Store purchases show here; codes and manual grants don't.
          </div>
        )}
      </div>
      <div className="dim" style={{ marginTop: 8 }}>
        Store purchases only; tests, refunds within 2 days and deleted accounts aren't listed.
      </div>
    </section>
  );
}

function Headline({ data }: { data: GrowthAnalytics }) {
  const h = data.headline!;
  const step = (key: string) => data.funnel.find((s) => s.key === key);
  const trained = step('trained');
  const week2 = step('week2');
  const change = h.prev_signups ? Math.round(((h.signups - h.prev_signups) / h.prev_signups) * 100) : null;
  return (
    <div className="stat-strip" role="group" aria-label="Headline growth stats">
      <div className="stat-cell">
        <span className="label">New signups</span>
        <span className="value">{h.signups}</span>
        <span className="hint">
          {change == null ? `last ${data.days} days` : `${change >= 0 ? '+' : ''}${change}% vs previous ${data.days} days (${h.prev_signups})`}
        </span>
      </div>
      <div className="stat-cell">
        <span className="label">Finished a first workout</span>
        <span className="value">{pct(trained?.users ?? 0, h.signups)}</span>
        <span className="hint">{trained?.users ?? 0} of {h.signups} signups</span>
      </div>
      <div className="stat-cell">
        <span className="label">Active in week 2</span>
        <span className="value">{week2?.eligible ? pct(week2.users, week2.eligible) : '—'}</span>
        <span className="hint">
          {week2?.eligible ? `${week2.users} of ${week2.eligible} signups 14+ days old` : 'no signups 14+ days old yet'}
        </span>
      </div>
      <div className="stat-cell">
        <span className="label">Weekly active</span>
        <span className="value">{h.wau}</span>
        <span className="hint">{h.mau} in the last 30 days</span>
      </div>
    </div>
  );
}

function FunnelPanel({ data }: { data: GrowthAnalytics }) {
  const funnel = data.funnel;
  const signups = funnel[0]?.users ?? 0;
  // Steps that share the signup base, in order; week 2 has its own base.
  const chain = funnel.filter((s) => s.eligible == null);
  let worst: string | null = null;
  let worstLost = 0;
  for (let i = 1; i < chain.length; i++) {
    const lost = chain[i - 1].users - chain[i].users;
    if (lost > worstLost) {
      worstLost = lost;
      worst = chain[i].key;
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>New signups: how far they got</h2>
        <span className="label">signed up in the last {data.days} days · deleted accounts included</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Step</th>
              <th style={{ textAlign: 'right' }}>People</th>
              <th style={{ textAlign: 'right' }}>Of signups</th>
              <th style={{ textAlign: 'right' }}>Lost at this step</th>
              <th style={{ width: '30%' }} aria-label="Bar" />
            </tr>
          </thead>
          <tbody>
            {funnel.map((s) => {
              const idx = chain.indexOf(s);
              const prev = idx > 0 ? chain[idx - 1] : null;
              const base = s.eligible ?? signups;
              const isWorst = s.key === worst;
              return (
                <tr key={s.key}>
                  <td>
                    <span style={{ fontWeight: 700 }}>{s.step}</span>
                    {isWorst && <span style={{ color: 'var(--accent)', fontWeight: 700 }}> · biggest drop</span>}
                    {s.eligible != null && <div className="dim">of the {s.eligible} who signed up 14+ days ago</div>}
                    {FUNNEL_NOTE[s.key] && <div className="dim">{FUNNEL_NOTE[s.key]}</div>}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{s.users}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{pct(s.users, base)}</td>
                  <td className="num" style={{ textAlign: 'right', color: isWorst ? 'var(--accent)' : undefined }}>
                    {prev ? `${prev.users - s.users} (${pct(prev.users - s.users, prev.users)})` : '—'}
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
      {funnel[0]?.deleted > 0 && (
        <div className="dim" style={{ marginTop: 8 }}>
          {funnel[0].deleted} of these signups have since deleted their account.
        </div>
      )}
    </section>
  );
}

function DailyPanel({ data }: { data: GrowthAnalytics }) {
  const daily = data.daily;
  const max = Math.max(1, ...daily.map((d) => d.active_users));
  // Today is still in progress, so it's left out of the average.
  const full = daily.filter((d) => !d.partial);
  const avg = full.length ? full.reduce((sum, d) => sum + d.active_users, 0) / full.length : 0;
  const peak = full.reduce<(typeof daily)[number] | null>((best, d) => (!best || d.active_users > best.active_users ? d : best), null);
  const labelEvery = Math.ceil(daily.length / 6);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Daily active people</h2>
        <span className="label">
          avg {avg.toFixed(1)}/day{peak ? ` · peak ${peak.active_users} on ${formatDate(peak.day)}` : ''}
        </span>
      </div>
      <div
        role="img"
        aria-label={`Daily active people, last ${data.days} days, average ${avg.toFixed(1)}`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: daily.length > 45 ? 1 : 3, height: 140, marginTop: 8 }}
      >
        {daily.map((d) => (
          <div
            key={d.day}
            title={`${formatDate(d.day)}${d.partial ? ' (today so far)' : ''}: ${d.active_users}`}
            style={{
              flex: 1,
              minWidth: 2,
              height: `${Math.max((d.active_users / max) * 100, d.active_users > 0 ? 2 : 0)}%`,
              background: 'var(--violet)',
              opacity: d.partial ? 0.4 : 1,
              borderRadius: '3px 3px 0 0',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: daily.length > 45 ? 1 : 3, marginTop: 4 }}>
        {daily.map((d, i) => (
          <span key={d.day} className="dim" style={{ flex: 1, minWidth: 2, fontSize: 11, whiteSpace: 'nowrap', overflow: 'visible' }}>
            {i % labelEvery === 0 ? formatDate(d.day) : ''}
          </span>
        ))}
      </div>
      <div className="dim" style={{ marginTop: 8 }}>
        Active = trained, logged anything, messaged the AI Coach or opened the app. Days in {data.tz}; the faded bar is today so far.
      </div>
    </section>
  );
}

function FeaturesPanel({ data }: { data: GrowthAnalytics }) {
  const features = data.features ?? [];
  const max = Math.max(0, ...features.map((f) => f.users));
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>What people use</h2>
        <span className="label">people, last {data.days} days · all app versions</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Feature</th>
              <th style={{ textAlign: 'right' }}>People</th>
              <th style={{ textAlign: 'right' }}>Days used</th>
              <th style={{ width: '40%' }} aria-label="Bar" />
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.feature}>
                <td>{FEATURE_LABEL[f.feature] ?? f.feature}</td>
                <td className="num" style={{ textAlign: 'right' }}>{f.users}</td>
                <td className="num" style={{ textAlign: 'right' }}>{f.days}</td>
                <td>
                  <Bar value={f.users} max={max} color="var(--violet)" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {features.length === 0 && (
          <div className="empty">
            <span className="label">Nothing used yet</span>
            No training or AI Coach use in this range.
          </div>
        )}
      </div>
      <div className="dim" style={{ marginTop: 8 }}>Days used = one per person per day, however many sets or blocks they logged.</div>
    </section>
  );
}

// Every app event, for digging in — collapsed, since the panels above already
// read the ones that matter.
function RawEventsPanel({ data }: { data: GrowthAnalytics }) {
  return (
    <section className="panel">
      <details>
        <summary style={{ cursor: 'pointer' }}>
          <h2 style={{ display: 'inline' }}>All app events</h2>
          <span className="label"> · {data.events.length} kinds, last {data.days} days</span>
        </summary>
        <div className="table-wrap" style={{ marginTop: 12 }}>
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
                  <td>
                    {EVENT_LABEL[e.event] ?? e.event}
                    <span className="dim"> · {e.event}</span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{e.events}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{e.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
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

const MOMENT_LABEL: Record<OfferAnalytics['moments'][number]['moment'], string> = {
  assessment: 'After the assessment',
  program_complete: 'After finishing the program',
  banner: 'Profile gift',
  upgrade_popup: 'Upgrade pop-up',
};

const PERIOD_LABEL: Record<string, string> = {
  INTRO: 'Intro offer',
  CODE: 'Offer code',
  NORMAL: 'Full price',
  TRIAL: 'Free trial',
  UNKNOWN: 'Unknown',
};

// The welcome offer, the locked ADD NEW WEEK button, store purchases by
// discount type and Redeem a Code (admin_get_offer_analytics).
function OffersPanel({ data }: { data: OfferAnalytics }) {
  const th = { textAlign: 'right' } as const;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Offers</h2>
        <span className="label">people, last {data.days} days · offer moments and sources from app 1.2.16</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Welcome offer</th>
              <th style={th}>Shown</th>
              <th style={th}>Claim</th>
              <th style={th}>Code</th>
              <th style={th}>Later</th>
              <th style={th}>Paywall</th>
              <th style={th}>Bought</th>
              <th style={th}>Bought / shown</th>
            </tr>
          </thead>
          <tbody>
            {data.moments.map((m) => (
              <tr key={m.moment}>
                <td style={{ fontWeight: 700 }}>{MOMENT_LABEL[m.moment]}</td>
                <td className="num" style={th}>{m.shown}</td>
                <td className="num" style={th}>{m.claimed}</td>
                <td className="num" style={th}>{m.code_tapped}</td>
                <td className="num" style={th}>{m.dismissed}</td>
                <td className="num" style={th}>{m.paywall}</td>
                <td className="num" style={th}>{m.bought}</td>
                <td className="num" style={th}>{pct(m.bought, m.shown)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 700 }}>Locked ADD NEW WEEK</td>
              <td className="num" style={th}>{data.add_week.tapped}</td>
              <td className="num dim" style={th}>—</td>
              <td className="num dim" style={th}>—</td>
              <td className="num dim" style={th}>—</td>
              <td className="num" style={th}>{data.add_week.paywall}</td>
              <td className="num" style={th}>{data.add_week.bought}</td>
              <td className="num" style={th}>{pct(data.add_week.bought, data.add_week.tapped)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Store</th>
              <th>Paid as</th>
              <th>Plan</th>
              <th>Phone</th>
              <th style={th}>People</th>
            </tr>
          </thead>
          <tbody>
            {data.store.length === 0 && (
              <tr>
                <td colSpan={5} className="dim">No purchases logged yet (logging started 29 Oct 2026).</td>
              </tr>
            )}
            {data.store.map((s) => (
              <tr key={`${s.event}-${s.period_type}-${s.tier}-${s.platform}`}>
                <td>{s.event === 'store_purchase' ? 'New purchase' : 'Renewal'}</td>
                <td>{PERIOD_LABEL[s.period_type] ?? s.period_type}</td>
                <td>{PLAN_LABEL[s.tier] ?? s.tier}</td>
                <td>{s.platform === 'ios' ? 'iPhone' : s.platform === 'android' ? 'Android' : '—'}</td>
                <td className="num" style={th}>{s.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Redeem a Code</th>
              <th style={th}>Opened</th>
              <th style={th}>Unlocked</th>
            </tr>
          </thead>
          <tbody>
            {data.codes.length === 0 && (
              <tr>
                <td colSpan={3} className="dim">No codes used yet.</td>
              </tr>
            )}
            {data.codes.map((c) => (
              <tr key={c.platform}>
                <td>{c.platform === 'ios' ? 'iPhone' : c.platform === 'android' ? 'Android' : c.platform}</td>
                <td className="num" style={th}>{c.submitted}</td>
                <td className="num" style={th}>{c.unlocked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
