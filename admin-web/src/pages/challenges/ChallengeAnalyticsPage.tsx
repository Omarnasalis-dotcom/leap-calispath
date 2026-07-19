import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchChallengeAnalytics } from '@/api/challenges';
import {
  CHALLENGE_GROUPS,
  currentWeekStart,
  formatDate,
  shiftWeekStart,
} from '@/shared/constants';
import { ErrorNote } from '@/components/bits';

function groupName(id: number): string {
  return CHALLENGE_GROUPS.find((g) => g.id === id)?.name ?? `Group ${id}`;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function ChallengeAnalyticsPage() {
  const [week, setWeek] = useState(currentWeekStart());
  const { data, isLoading, error } = useQuery({
    queryKey: ['challenge-analytics', week],
    queryFn: () => fetchChallengeAnalytics(week),
  });

  // trend rows arrive flat (week × group); pivot into one row per week
  const trendWeeks = data
    ? [...new Set(data.trend.map((t) => t.week_start))].sort().reverse()
    : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Challenge analytics</h1>
          <div className="sub">Participation and score spread per group.</div>
        </div>
        <div className="row">
          <button className="btn small" onClick={() => setWeek(shiftWeekStart(week, -1))}>
            ‹
          </button>
          <span className="num" style={{ fontWeight: 700, minWidth: 120, textAlign: 'center' }}>
            {formatDate(week)}
          </span>
          <button className="btn small" onClick={() => setWeek(shiftWeekStart(week, 1))}>
            ›
          </button>
          <button className="btn small" onClick={() => setWeek(currentWeekStart())}>
            This week
          </button>
        </div>
      </div>

      {error && <ErrorNote error={error} />}
      {isLoading && <div className="skeleton" style={{ height: 160 }} />}

      {data && (
        <section className="panel">
          <div className="panel-head">
            <h2>Week of {formatDate(data.week_start)}</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Challenge</th>
                  <th style={{ textAlign: 'right' }}>Entries</th>
                  <th style={{ textAlign: 'right' }}>Warriors</th>
                  <th style={{ textAlign: 'right' }}>Min</th>
                  <th style={{ textAlign: 'right' }}>Median</th>
                  <th style={{ textAlign: 'right' }}>Avg</th>
                  <th style={{ textAlign: 'right' }}>Max</th>
                </tr>
              </thead>
              <tbody>
                {data.challenges.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>{groupName(c.group_id)}</td>
                    <td>{c.title}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{c.entry_count}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{c.participant_count}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmt(c.min_score)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmt(c.median_score)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmt(c.avg_score)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmt(c.max_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.challenges.length === 0 && (
              <div className="empty">
                <span className="label">No challenges this week</span>
                Create them in the week editor.
              </div>
            )}
          </div>
        </section>
      )}

      {data && trendWeeks.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Entries per week</h2>
            <span className="label">trailing 8 weeks</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Week</th>
                  {CHALLENGE_GROUPS.map((g) => (
                    <th key={g.id} style={{ textAlign: 'right' }}>
                      {g.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trendWeeks.map((w) => (
                  <tr key={w}>
                    <td className="dim">{formatDate(w)}</td>
                    {CHALLENGE_GROUPS.map((g) => {
                      const cell = data.trend.find(
                        (t) => t.week_start === w && t.group_id === g.id,
                      );
                      return (
                        <td key={g.id} className="num" style={{ textAlign: 'right' }}>
                          {cell ? cell.entry_count : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
