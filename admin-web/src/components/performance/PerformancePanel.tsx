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

// Fixed categorical order for workout-slot lines (most-logged slot first).
// Three distinct hues from the dashboard palette; a 4th (--dv-onemm) is too
// close to --dv-accent to tell apart, so less-logged slots are listed instead.
const SLOT_COLORS = ['var(--dv-accent)', 'var(--dv-static)', 'var(--dv-power)'];
const MAX_SLOTS = SLOT_COLORS.length;

/** "LEGS DAY3 | Strength -B" → "LEGS DAY3 · Strength -B" */
function slotLabel(block: string): string {
  return block.replace(/\s*\|\s*/g, ' · ');
}

function WeightedChart({ data }: { data: UserPerformance['weighted'] }) {
  const [pickedExercise, setPickedExercise] = useState<string | null>(null);
  const [pickedProgram, setPickedProgram] = useState<string | null>(null);
  if (data.length === 0) {
    return <Empty>No weighted sets logged yet. Weight is only recorded on exercises marked as weighted.</Empty>;
  }
  const movement = data.find((m) => m.exercise === pickedExercise) ?? data[0];

  // Week numbers restart per program, so one program at a time; default
  // to the one with the most recent log of this movement.
  const programs = new Map<string, { name: string; latest: string }>();
  for (const p of movement.points) {
    if (!p.program_id || p.week == null || !p.block) continue;
    const cur = programs.get(p.program_id);
    if (!cur || p.date > cur.latest) programs.set(p.program_id, { name: p.program ?? 'Program', latest: p.date });
  }
  const programList = [...programs.entries()].sort((a, b) => b[1].latest.localeCompare(a[1].latest));
  const programId = programList.find(([id]) => id === pickedProgram)?.[0] ?? programList[0]?.[0];
  const pts = movement.points.filter((p) => p.program_id === programId && p.week != null && p.block);

  // One line per workout slot (block name): the same lift on a heavy day
  // and a light day are compared week to week, never mixed. Within a slot
  // and week, the heaviest set wins.
  const slotCounts = new Map<string, number>();
  pts.forEach((p) => slotCounts.set(p.block!, (slotCounts.get(p.block!) ?? 0) + 1));
  const slots = [...slotCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SLOTS).map(([b]) => b);
  const hiddenSlots = slotCounts.size - slots.length;
  // Every week from first to last log, so an unlogged week shows as a gap in
  // the line instead of being skipped on the axis.
  const loggedWeeks = pts.filter((p) => slots.includes(p.block!)).map((p) => p.week!);
  const firstWeek = Math.min(...loggedWeeks);
  const weeks = loggedWeeks.length
    ? Array.from({ length: Math.max(...loggedWeeks) - firstWeek + 1 }, (_, i) => firstWeek + i)
    : [];

  const series: PerfSeries[] = slots.map((slot, i) => {
    const best = weeks.map((wk) => {
      const inWeek = pts.filter((p) => p.block === slot && p.week === wk);
      if (inWeek.length === 0) return null;
      return inWeek.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
    });
    return {
      key: slot,
      label: slotLabel(slot),
      color: SLOT_COLORS[i],
      values: best.map((p) => (p ? Number(p.weight) : null)),
      details: best.map((p) =>
        p ? `${Number(p.weight)} kg${p.reps != null ? ` × ${p.reps}` : ''} · ${shortDate(p.date)}` : null,
      ),
    };
  });

  return (
    <>
      <div className="perf-controls">
        <select
          className="field perf-select"
          value={movement.exercise}
          onChange={(e) => {
            setPickedExercise(e.target.value);
            setPickedProgram(null);
          }}
          aria-label="Movement"
        >
          {data.map((m) => (
            <option key={m.exercise} value={m.exercise}>
              {m.exercise} ({m.points.length})
            </option>
          ))}
        </select>
        {programList.length > 1 && (
          <select
            className="field perf-select"
            value={programId}
            onChange={(e) => setPickedProgram(e.target.value)}
            aria-label="Program"
          >
            {programList.map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {series.length === 0 ? (
        <Empty>No sets with a program week for this movement.</Empty>
      ) : (
        <>
          {series.length === 1 && <p className="perf-sub dim perf-slot-single">{series[0].label}</p>}
          <PerfLineChart
            ariaLabel={`${movement.exercise}: heaviest set per workout slot, by program week`}
            unit="kg"
            xLabels={weeks.map((w) => `W${w}`)}
            tooltipTitles={weeks.map((w) => `Week ${w}`)}
            series={series}
          />
          {hiddenSlots > 0 && (
            <p className="perf-sub dim">
              +{hiddenSlots} less-logged workout slot{hiddenSlots > 1 ? 's' : ''} not shown
            </p>
          )}
        </>
      )}
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
              <p className="perf-sub dim">Heaviest set per workout slot, week to week</p>
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
