import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchCoachingBusiness, fetchCoaches, type CoachingBusiness } from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/layout';
import { ErrorNote } from '@/components/bits';
import './CoachingBusiness.css';

// Online coaching as a business: revenue from the packages coaches enter
// (amount + currency, by the month the package starts) and a scorecard from
// the athletes' reviews, for a chosen date range (kept in the address). A
// coach sees their own numbers; an admin sees everyone's or one coach's.

const money = (n: number, currency: string) =>
  `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;

const monthLabel = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: long ? 'long' : 'short',
    year: long ? 'numeric' : undefined,
    timeZone: 'UTC',
  });

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// ---- date range ----

type RangeKey = 'this_month' | 'last_month' | 'last_3' | 'this_year' | 'last_12' | 'all' | 'custom';
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3', label: 'Last 3 months' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_12', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** The preset's from/to (local dates); null from = all time. */
function presetDates(key: Exclude<RangeKey, 'custom'>): { from: string | null; to: string } {
  const now = new Date();
  const today = isoLocal(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case 'this_month':
      return { from: isoLocal(new Date(y, m, 1)), to: today };
    case 'last_month':
      return { from: isoLocal(new Date(y, m - 1, 1)), to: isoLocal(new Date(y, m, 0)) };
    case 'last_3':
      return { from: isoLocal(new Date(y, m - 2, 1)), to: today };
    case 'this_year':
      return { from: isoLocal(new Date(y, 0, 1)), to: today };
    case 'all':
      return { from: null, to: today };
    default:
      return { from: isoLocal(new Date(y, m - 11, 1)), to: today };
  }
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** One currency's revenue by month: bars, hover/focus for the exact figure, or a table. */
function RevenueChart({ currency, rows }: { currency: string; rows: CoachingBusiness['revenue'] }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...rows.map((r) => r.revenue), 0);
  // Long ranges: label every Nth month so the labels never collide.
  const labelEvery = Math.ceil(rows.length / 12);

  return (
    <section className="panel cb-chart" aria-labelledby={`cb-rev-${currency}`}>
      <div className="panel-head">
        <h2 id={`cb-rev-${currency}`}>Revenue by month · {currency}</h2>
        <span className="cb-head-meta">by the month each package starts</span>
        <button type="button" className="btn small ghost" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Chart' : 'Table'}
        </button>
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Packages</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.month}>
                  <td>{monthLabel(r.month, true)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {r.packages}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {money(r.revenue, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel-body">
          <div
            className="cb-bars"
            role="list"
            aria-label={`Revenue in ${currency} by month`}
            style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
          >
            {rows.map((r, i) => {
              const h = max > 0 ? Math.max(r.revenue > 0 ? 3 : 0, Math.round((r.revenue / max) * 100)) : 0;
              const label = `${monthLabel(r.month, true)}: ${money(r.revenue, currency)}, ${r.packages} package${r.packages === 1 ? '' : 's'}`;
              return (
                <div key={r.month} className="cb-bar-col" role="listitem" tabIndex={0} aria-label={label}>
                  <div className="cb-bar-track">
                    <div className={`cb-bar${i === rows.length - 1 ? ' current' : ''}`} style={{ height: `${h}%` }} />
                  </div>
                  <span className="cb-bar-label">
                    {i % labelEvery === 0 || i === rows.length - 1 ? monthLabel(r.month) : '\u00a0'}
                  </span>
                  <span className="cb-tip" role="tooltip">
                    <strong>{monthLabel(r.month, true)}</strong>
                    <span className="num">{money(r.revenue, currency)}</span>
                    <span className="dim">
                      {r.packages} package{r.packages === 1 ? '' : 's'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Promoters (9-10) / passives (7-8) / detractors (0-6) as one labelled bar. */
function RecommendBar({ promoters, passives, detractors }: { promoters: number; passives: number; detractors: number }) {
  const total = promoters + passives + detractors;
  if (total === 0) return null;
  const parts = [
    { key: 'pro', label: 'Would recommend (9–10)', n: promoters },
    { key: 'pas', label: 'Neutral (7–8)', n: passives },
    { key: 'det', label: 'Would not (0–6)', n: detractors },
  ].filter((p) => p.n > 0);
  return (
    <div className="cb-nps">
      <div className="cb-nps-bar" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.key} className={`cb-nps-seg ${p.key}`} style={{ flexGrow: p.n }} />
        ))}
      </div>
      <ul className="cb-nps-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`cb-dot ${p.key}`} aria-hidden="true" />
            {p.label} <span className="num">{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Scorecard({ r }: { r: CoachingBusiness['reviews'] }) {
  const finals = r.final_answered;
  const nps = finals > 0 ? Math.round(((r.promoters - r.detractors) / finals) * 100) : null;
  const response = pct(r.answered, r.sent);
  const moodFace = r.avg_mood == null ? '' : ['😫', '😕', '😐', '🙂', '🤩'][Math.min(4, Math.max(0, Math.round(r.avg_mood) - 1))];
  return (
    <section className="panel" aria-labelledby="cb-score">
      <div className="panel-head">
        <h2 id="cb-score">Client scorecard</h2>
        <span className="cb-head-meta">from the athletes' reviews in this range</span>
      </div>
      <div className="panel-body">
        {r.sent === 0 ? (
          <p className="cb-empty">
            No reviews yet. Athletes are asked 6 weeks into a package and in its last week, once reviews are switched on.
          </p>
        ) : (
          <>
            <dl className="cb-kv">
              <div>
                <dt>Recommend score</dt>
                <dd>
                  {nps == null ? (
                    <span className="dim">no end-of-package reviews yet</span>
                  ) : (
                    <>
                      <span className="num cb-strong">
                        {nps > 0 ? '+' : ''}
                        {nps}
                      </span>{' '}
                      <span className="dim">
                        from {finals} review{finals === 1 ? '' : 's'} (% who'd recommend minus % who wouldn't)
                      </span>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Journey rating</dt>
                <dd>{r.avg_rating == null ? <span className="dim">—</span> : <span className="num">{r.avg_rating} ★ average</span>}</dd>
              </div>
              <div>
                <dt>Want to continue</dt>
                <dd>
                  {finals === 0 ? (
                    <span className="dim">—</span>
                  ) : (
                    <>
                      <span className="num">{r.continue_yes}</span> yes · <span className="num">{r.continue_break}</span> a break ·{' '}
                      <span className="num">{r.continue_no}</span> no
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>6-week check-ins</dt>
                <dd>
                  {r.checkin_answered === 0 ? (
                    <span className="dim">—</span>
                  ) : (
                    <>
                      {moodFace} <span className="num">{r.avg_mood}</span>/5 mood · progress{' '}
                      <span className="num">{r.progress_clear}</span> clearly, <span className="num">{r.progress_little}</span> a little,{' '}
                      <span className="num">{r.progress_not_yet}</span> not yet
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Response rate</dt>
                <dd>
                  <span className="num">{r.answered}</span> of <span className="num">{r.sent}</span> answered
                  {response != null && <span className="dim"> ({response}%)</span>}
                </dd>
              </div>
            </dl>
            <RecommendBar promoters={r.promoters} passives={r.passives} detractors={r.detractors} />
          </>
        )}
      </div>
    </section>
  );
}

export function CoachingBusinessPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const coachId = params.get('coach') ?? '';
  const rangeParam = params.get('range') as RangeKey | null;
  const range: RangeKey = RANGES.some((r) => r.key === rangeParam) ? rangeParam! : 'last_12';
  const preset = range === 'custom' ? null : presetDates(range);
  const today = isoLocal(new Date());
  const customFrom = params.get('from') ?? isoLocal(new Date(Date.now() - 29 * 86_400_000));
  const customTo = params.get('to') ?? today;
  const from = preset ? preset.from : customFrom;
  const to = preset ? preset.to : customTo;
  const customInvalid = range === 'custom' && (!customFrom || !customTo || customTo < customFrom);

  const setParam = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v == null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  const setCoachId = (id: string) => setParam({ coach: id || null });

  const coachesQ = useQuery({ queryKey: ['coaches'], queryFn: fetchCoaches, enabled: isAdmin });
  const q = useQuery({
    queryKey: ['coaching-business', coachId || null, from, to],
    queryFn: () => fetchCoachingBusiness(coachId || null, from, to),
    enabled: !customInvalid,
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  const renewalRate = d ? pct(d.renewals.renewed, d.renewals.ended) : null;
  const rangeText = d ? `${dayLabel(d.from)} – ${dayLabel(d.to)}` : '';
  const rangeName = RANGES.find((r) => r.key === range)!.label;

  return (
    <div className="page">
      <PageHeader
        title="Coaching business"
        sub="Online coaching revenue and what clients say."
        actions={
          isAdmin ? (
            <select className="field" value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label="Coach">
              <option value="">All coaches</option>
              {coachesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className="cb-range" role="group" aria-label="Date range">
        <div className="seg">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className="seg-item"
              aria-pressed={range === r.key}
              onClick={() =>
                setParam(
                  r.key === 'custom'
                    ? { range: 'custom', from: customFrom, to: customTo }
                    : { range: r.key === 'last_12' ? null : r.key, from: null, to: null },
                )
              }
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <span className="cb-custom">
            <label>
              <span className="label">From</span>
              <input type="date" className="field" value={customFrom} max={customTo || today} onChange={(e) => setParam({ from: e.target.value })} />
            </label>
            <label>
              <span className="label">To</span>
              <input type="date" className="field" value={customTo} min={customFrom} max={today} onChange={(e) => setParam({ to: e.target.value })} />
            </label>
          </span>
        )}
        {d && !customInvalid && <span className="cb-range-text">{rangeText}</span>}
      </div>
      {customInvalid && <p className="cb-note" style={{ color: 'var(--danger)' }}>The end date must be on or after the start date.</p>}

      {q.error && <ErrorNote error={q.error} />}
      {q.isLoading && <div className="skeleton" style={{ height: 240 }} />}

      {d && (
        <>
          <section className="panel cb-total" aria-labelledby="cb-total-title">
            <div className="panel-body">
              <h2 id="cb-total-title" className="cb-total-title">
                Total revenue · {rangeName.toLowerCase()}
              </h2>
              {d.totals.length === 0 ? (
                <p className="cb-total-empty">No package with an amount starts in {rangeText}.</p>
              ) : (
                <div className="cb-total-row">
                  {d.totals.map((t) => (
                    <div key={t.currency} className="cb-total-item">
                      <span className="cb-total-value num">{money(t.revenue, t.currency)}</span>
                      <span className="cb-total-sub">
                        from {t.packages} package{t.packages === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel" aria-label="Packages">
            <div className="panel-body">
              <dl className="cb-summary">
                <div>
                  <dt>Active packages</dt>
                  <dd className="num">{d.packages.active}</dd>
                </div>
                <div>
                  <dt>Packages sold</dt>
                  <dd className="num">{d.packages.sold}</dd>
                </div>
                <div>
                  <dt>Average package</dt>
                  <dd className="num">
                    {d.packages.average.length === 0 ? '—' : d.packages.average.map((a) => money(a.average, a.currency)).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt>Renewed</dt>
                  <dd>
                    {d.renewals.ended === 0 ? (
                      <span className="dim">none ended in this range</span>
                    ) : (
                      <>
                        <span className="num">
                          {d.renewals.renewed} of {d.renewals.ended}
                        </span>{' '}
                        <span className="dim">ended packages ({renewalRate}%)</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
              {d.packages.without_amount > 0 && (
                <p className="cb-note">
                  {d.packages.without_amount} package{d.packages.without_amount === 1 ? ' has' : 's have'} no amount, so{' '}
                  {d.packages.without_amount === 1 ? "it isn't" : "they aren't"} counted in revenue. Add the amount from the
                  client's package (Edit).
                </p>
              )}
            </div>
          </section>

          {d.currencies.length === 0 ? (
            <section className="panel">
              <div className="empty">
                <span className="label">No revenue in this range</span>
                Packages with an amount show here by the month they start.
              </div>
            </section>
          ) : (
            d.currencies.map((cur) => (
              <RevenueChart key={cur} currency={cur} rows={d.revenue.filter((r) => r.currency === cur)} />
            ))
          )}

          <Scorecard r={d.reviews} />

          {isAdmin && !coachId && d.by_coach.length > 0 && (
            <section className="panel" aria-labelledby="cb-coaches">
              <div className="panel-head">
                <h2 id="cb-coaches">By coach</h2>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Coach</th>
                      <th style={{ textAlign: 'right' }}>Active</th>
                      <th style={{ textAlign: 'right' }}>Sold</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                      <th style={{ textAlign: 'right' }}>Recommend</th>
                      <th style={{ textAlign: 'right' }}>Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.by_coach.map((c) => (
                      <tr
                        key={c.coach_id ?? 'deleted'}
                        className={c.coach_id ? 'clickable' : undefined}
                        onClick={c.coach_id ? () => setCoachId(c.coach_id!) : undefined}
                      >
                        <td style={{ fontWeight: 600 }}>{c.coach_name}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{c.active}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{c.sold}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {c.revenue_total.length === 0 ? '—' : c.revenue_total.map((x) => money(x.revenue, x.currency)).join(' · ')}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {c.final_answered === 0
                            ? '—'
                            : `${Math.round(((c.promoters - c.detractors) / c.final_answered) * 100)}`}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {c.avg_rating == null ? '—' : `${c.avg_rating} ★`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
