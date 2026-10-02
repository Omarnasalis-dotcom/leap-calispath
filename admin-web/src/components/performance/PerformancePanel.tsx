import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchUserPerformance } from '@/api/users';
import { ErrorNote } from '@/components/bits';
import { formatDate } from '@/shared/constants';
import type { CompletionProgram, UserPerformance } from '@/shared/types';
import { PerfLineChart, type PerfSeries } from './PerfLineChart';
import '@/pages/DashboardPage.css';
import './PerformancePanel.css';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Empty({ children }: { children: string }) {
  return <div className="dim perf-empty">{children}</div>;
}

function WeightedChart({ data }: { data: UserPerformance['weighted'] }) {
  const [picked, setPicked] = useState<string | null>(null);
  if (data.length === 0) {
    return <Empty>No weighted sets logged yet. Weight is only recorded on exercises marked as weighted.</Empty>;
  }
  const movement = data.find((m) => m.exercise === picked) ?? data[0];
  const pts = movement.points;
  return (
    <>
      <select
        className="field perf-select"
        value={movement.exercise}
        onChange={(e) => setPicked(e.target.value)}
        aria-label="Movement"
      >
        {data.map((m) => (
          <option key={m.exercise} value={m.exercise}>
            {m.exercise} ({m.points.length})
          </option>
        ))}
      </select>
      <PerfLineChart
        ariaLabel={`${movement.exercise}: heaviest set per session`}
        unit="kg"
        xLabels={pts.map((p) => (p.week != null ? `W${p.week}` : shortDate(p.date)))}
        tooltipTitles={pts.map(
          (p) =>
            `${p.week != null ? `Week ${p.week} · ` : ''}${formatDate(p.date)}${p.reps != null ? ` · ${p.reps} reps` : ''}`,
        )}
        series={[
          { key: 'w', label: movement.exercise, color: 'var(--dv-accent)', values: pts.map((p) => Number(p.weight)) },
        ]}
      />
    </>
  );
}

function BodyweightChart({ data }: { data: UserPerformance['bodyweight'] }) {
  if (data.length === 0) return <Empty>No bodyweight logged yet.</Empty>;
  return (
    <PerfLineChart
      ariaLabel="Bodyweight over time"
      unit="kg"
      zeroBaseline={false}
      xLabels={data.map((p) => shortDate(p.date))}
      tooltipTitles={data.map((p) => formatDate(p.date))}
      series={[
        { key: 'bw', label: 'Bodyweight', color: 'var(--dv-static)', values: data.map((p) => Number(p.weight_kg)) },
      ]}
    />
  );
}

function CompletionChart({ data }: { data: CompletionProgram[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const withWeeks = data.filter((p) => p.weeks.length > 0);
  if (withWeeks.length === 0) return <Empty>No program assigned yet.</Empty>;
  const program = withWeeks.find((p) => p.program_id === picked) ?? withWeeks[0];
  return (
    <>
      <select
        className="field perf-select"
        value={program.program_id}
        onChange={(e) => setPicked(e.target.value)}
        aria-label="Program"
      >
        {withWeeks.map((p) => (
          <option key={p.program_id} value={p.program_id}>
            {p.name} · {p.status} · {formatDate(p.assigned_at)}
          </option>
        ))}
      </select>
      <div className="dv-vbar-list perf-vbar-list">
        {program.weeks.map((w) => {
          const pct = w.total > 0 ? Math.round((w.completed / w.total) * 100) : 0;
          return (
            <div key={w.week} className="dv-vbar-col">
              <span className="dv-vbar-value num">{pct}%</span>
              <div className="dv-vbar-track">
                <div
                  className={`dv-vbar-fill${pct === 100 ? ' dv-vbar-fill-current' : ''}`}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className="dv-vbar-label">W{w.week}</span>
              <span className="dv-bar-tooltip">
                {w.completed}/{w.total} blocks{w.missed > 0 ? ` · ${w.missed} missed` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const WORLD_SERIES: { key: 'static' | 'onemm' | 'power'; label: string; color: string }[] = [
  { key: 'static', label: 'Static', color: 'var(--dv-static)' },
  { key: 'onemm', label: 'One-Min-Max', color: 'var(--dv-onemm)' },
  { key: 'power', label: 'Power', color: 'var(--dv-power)' },
];

function WorldsChart({ data }: { data: UserPerformance['worlds'] }) {
  // A world with no score at all is hidden, not drawn as a flat zero line
  // (most users never reach Power World's tier-6 unlock).
  const series: PerfSeries[] = WORLD_SERIES.map((s) => ({
    ...s,
    values: data.map((w) => Math.round(Number(w[s.key]))),
  })).filter((s) => s.values.some((v) => v > 0));
  if (series.length === 0) return <Empty>No Static, One-Min-Max or Power activity yet.</Empty>;
  return (
    <PerfLineChart
      ariaLabel="World scores per week"
      unit="pts"
      xLabels={data.map((w) => shortDate(w.week_start))}
      tooltipTitles={data.map((w) => `Week of ${formatDate(w.week_start)}`)}
      series={series}
    />
  );
}

/** Admin-only trial of the per-user performance charts planned for the
 * app's Train screen. */
export function PerformancePanel({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ['user-performance', userId],
    queryFn: () => fetchUserPerformance(userId),
    enabled: !!userId,
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Performance</h2>
      </div>
      <div className="panel-body dashboard-v2 perf-root">
        {q.error && <ErrorNote error={q.error} />}
        {q.isLoading && <div className="skeleton" style={{ height: 260 }} />}
        {q.data && (
          <div className="grid-2 perf-grid">
            <div className="perf-card">
              <h3 className="perf-title">Weighted lifts</h3>
              <p className="perf-sub dim">Heaviest set per session</p>
              <WeightedChart data={q.data.weighted} />
            </div>
            <div className="perf-card">
              <h3 className="perf-title">Bodyweight</h3>
              <p className="perf-sub dim">Weekly log</p>
              <BodyweightChart data={q.data.bodyweight} />
            </div>
            <div className="perf-card">
              <h3 className="perf-title">Blocks completed</h3>
              <p className="perf-sub dim">Per program week</p>
              <CompletionChart data={q.data.completion} />
            </div>
            <div className="perf-card">
              <h3 className="perf-title">World points</h3>
              <p className="perf-sub dim">Score at the end of each week</p>
              <WorldsChart data={q.data.worlds} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
