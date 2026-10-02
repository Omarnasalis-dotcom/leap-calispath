import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchUserPerformance } from '@/api/users';
import { ErrorNote } from '@/components/bits';
import { formatDate } from '@/shared/constants';
import type { CompletionProgram, Feel, UserPerformance } from '@/shared/types';
import { PerfLineChart, PerfPrintContext, type PerfSeries } from './PerfLineChart';
import './PerformancePanel.css';

// Layout, tokens and behaviour follow the design handoff in
// assets/design_handoff_admin_performance (README.md is the spec).

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const fmt = (v: number) => String(Math.round(v * 10) / 10);

/** "+15", "−3.6", "±0" — a true minus sign. */
function signed(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${fmt(Math.abs(r))}`;
}

// Workout-slot line colours in fixed order, most-logged slot first.
const SLOT_COLORS = ['var(--pf-coral)', 'var(--pf-purple)', 'var(--pf-orange)'];
const MAX_SLOTS = SLOT_COLORS.length;
// Above this many exercises the segmented control becomes a dropdown.
const SEGMENTED_MAX = 5;

/** "LEGS DAY3 | Strength -B" → "LEGS DAY3 · Strength -B" */
function slotLabel(block: string): string {
  return block.replace(/\s*\|\s*/g, ' · ');
}

/** What the admin has picked on screen; the PDF prints the same view. */
interface Selection {
  exercise: string | null;
  weightedProgram: string | null;
  completionProgram: string | null;
  hiddenSlots: string[];
}

function Cell({
  title,
  sub,
  side,
  wide,
  children,
}: {
  title: string;
  sub: string;
  side?: ReactNode;
  /** Spans the full width of the grid. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`pf-cell${wide ? ' pf-cell-wide' : ''}`}>
      <header className="pf-cell-head">
        <div className="pf-cell-titles">
          <h3 className="pf-cell-title">{title}</h3>
          <span className="pf-cell-sub">{sub}</span>
        </div>
        {side}
      </header>
      {children}
    </section>
  );
}

function EmptyBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="pf-empty">
      <span className="pf-empty-dot" aria-hidden />
      <p className="pf-empty-title">{title}</p>
      <p className="pf-empty-body">{body}</p>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  print,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  print?: boolean;
}) {
  if (print || options.length === 0) {
    return <span className="pf-static-control">{options.find((o) => o.value === value)?.label}</span>;
  }
  return (
    <select className="pf-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** The athlete's active program, else the newest — the default everywhere
 * a program is picked (a manual pick still wins). */
function defaultProgram<T extends { status: string }>(programs: T[]): T | undefined {
  return programs.find((p) => p.status === 'active') ?? programs[0];
}

function activeProgramId(data: UserPerformance): string | undefined {
  return data.completion.find((p) => p.status === 'active')?.program_id;
}

// ---------- 1. Weighted lifts ----------

function WeightedCell({
  data,
  activeProgram,
  sel,
  setSel,
  print,
}: {
  data: UserPerformance['weighted'];
  activeProgram?: string;
  sel: Selection;
  setSel: (s: Partial<Selection>) => void;
  print?: boolean;
}) {
  if (data.length === 0) {
    return (
      <Cell title="Weighted lifts" sub="Heaviest set per workout slot">
        <EmptyBox title="No weighted sets yet" body="Lifts show up once sets are logged with a kg value." />
      </Cell>
    );
  }
  const movement = data.find((m) => m.exercise === sel.exercise) ?? data[0];

  // Week numbers restart per program, so one program at a time; default
  // to the one with the most recent log of this movement.
  const programs = new Map<string, { name: string; latest: string }>();
  for (const p of movement.points) {
    if (!p.program_id || p.week == null || !p.block) continue;
    const cur = programs.get(p.program_id);
    if (!cur || p.date > cur.latest) programs.set(p.program_id, { name: p.program ?? 'Program', latest: p.date });
  }
  const programList = [...programs.entries()].sort((a, b) => b[1].latest.localeCompare(a[1].latest));
  const programId =
    programList.find(([id]) => id === sel.weightedProgram)?.[0] ??
    programList.find(([id]) => id === activeProgram)?.[0] ??
    programList[0]?.[0];
  const pts = movement.points.filter((p) => p.program_id === programId && p.week != null && p.block);

  // One line per workout slot (block name): a heavy day and a light day of
  // the same lift are compared week to week, never mixed. Within a slot and
  // week, the heaviest set wins.
  const slotCounts = new Map<string, number>();
  pts.forEach((p) => slotCounts.set(p.block!, (slotCounts.get(p.block!) ?? 0) + 1));
  const slots = [...slotCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SLOTS).map(([b]) => b);
  const extraSlots = slotCounts.size - slots.length;

  // Every week from first to last log, so an unlogged week breaks the line.
  const logged = pts.filter((p) => slots.includes(p.block!)).map((p) => p.week!);
  const firstWeek = Math.min(...logged);
  const weeks = logged.length
    ? Array.from({ length: Math.max(...logged) - firstWeek + 1 }, (_, i) => firstWeek + i)
    : [];

  const series = slots.map((slot, i) => {
    const best = weeks.map((wk) => {
      const inWeek = pts.filter((p) => p.block === slot && p.week === wk);
      return inWeek.length ? inWeek.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a)) : null;
    });
    const values = best.map((p) => (p ? Number(p.weight) : null));
    const present = values.map((v, k) => ({ v, wk: weeks[k] })).filter((x) => x.v !== null);
    return {
      key: slot,
      label: slotLabel(slot),
      color: SLOT_COLORS[i],
      values,
      details: best.map((p) => (p ? `${fmt(Number(p.weight))} kg${p.reps != null ? ` × ${p.reps}` : ''}` : null)),
      first: present[0],
      last: present[present.length - 1],
    };
  });
  const visible: PerfSeries[] = series.filter((s) => !sel.hiddenSlots.includes(s.key));

  const pickExercise = (name: string) => setSel({ exercise: name, weightedProgram: null, hiddenSlots: [] });
  const switcher =
    print || data.length > SEGMENTED_MAX ? (
      <Select
        label="Exercise"
        value={movement.exercise}
        options={data.map((m) => ({ value: m.exercise, label: m.exercise }))}
        onChange={pickExercise}
        print={print}
      />
    ) : (
      <div className="pf-seg" role="group" aria-label="Exercise">
        {data.map((m) => (
          <button
            key={m.exercise}
            type="button"
            className="pf-seg-item"
            aria-pressed={m.exercise === movement.exercise}
            onClick={() => pickExercise(m.exercise)}
          >
            {m.exercise}
            <span className="pf-seg-count">{m.points.length}</span>
          </button>
        ))}
      </div>
    );

  return (
    <Cell
      title="Weighted lifts"
      sub="Heaviest set per workout slot"
      side={switcher}
    >
      {programList.length > 1 && (
        <Select
          label="Program"
          value={programId ?? ''}
          options={programList.map(([id, p]) => ({ value: id, label: p.name }))}
          onChange={(v) => setSel({ weightedProgram: v, hiddenSlots: [] })}
          print={print}
        />
      )}
      {series.length === 0 ? (
        <EmptyBox title="No program weeks yet" body="This movement has no sets inside a program week." />
      ) : (
        <>
          <div className="pf-tiles">
            {series.map((s) => {
              const on = !sel.hiddenSlots.includes(s.key);
              const delta = s.first && s.last && s.first !== s.last ? s.last.v! - s.first.v! : null;
              return (
                <button
                  key={s.key}
                  type="button"
                  className="pf-tile"
                  aria-pressed={on}
                  title={on ? 'Hide this slot in the chart' : 'Show this slot in the chart'}
                  onClick={() =>
                    !print &&
                    setSel({
                      hiddenSlots: on ? [...sel.hiddenSlots, s.key] : sel.hiddenSlots.filter((k) => k !== s.key),
                    })
                  }
                >
                  <span className="pf-tile-name">
                    <span className="pf-dot8" style={{ background: s.color }} />
                    <span>{s.label}</span>
                  </span>
                  <span className="pf-tile-row">
                    <span className="pf-num pf-tile-value">
                      {fmt(s.last!.v!)}
                      <span className="pf-unit">kg</span>
                    </span>
                    {delta !== null && (
                      <span className={`pf-delta${delta > 0 ? ' pf-delta-up' : ''}`}>
                        {signed(delta)} kg since W{s.first!.wk}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <PerfLineChart
            ariaLabel={`${movement.exercise}: heaviest set per workout slot, by program week`}
            labels={weeks.map((w) => `W${w}`)}
            series={visible}
            unit="kg"
            step={5}
            floor={0}
          />
          {extraSlots > 0 && (
            <p className="pf-note">
              {extraSlots} more workout slot{extraSlots > 1 ? 's' : ''} with fewer logs not shown
            </p>
          )}
        </>
      )}
    </Cell>
  );
}

// ---------- 2. World points ----------

const WORLDS: { key: 'static' | 'onemm' | 'power'; name: string; line: string; ink: string; tint: string }[] = [
  { key: 'static', name: 'Static', line: 'var(--pf-purple)', ink: 'var(--pf-purple-ink)', tint: 'var(--pf-purple-tint)' },
  { key: 'onemm', name: 'One-Min-Max', line: 'var(--pf-orange)', ink: 'var(--pf-orange-ink)', tint: 'var(--pf-orange-tint)' },
  { key: 'power', name: 'Power', line: 'var(--pf-amber)', ink: 'var(--pf-amber-ink)', tint: 'var(--pf-amber-tint)' },
];

function WorldsCell({ data }: { data: UserPerformance['worlds'] }) {
  // A world's weeks before its first result are left out of its sparkline;
  // a world with no result at all gets no tile (most users never reach Power).
  const worlds = WORLDS.map((w) => {
    const raw = data.map((d) => Math.round(Number(d[w.key])));
    const start = raw.findIndex((v) => v > 0);
    return { ...w, values: start === -1 ? [] : raw.slice(start), labels: data.slice(Math.max(start, 0)).map((d) => d.week_start) };
  }).filter((w) => w.values.length > 0);

  return (
    <Cell title="World points" sub="Score at the end of each week">
      {worlds.length === 0 ? (
        <EmptyBox title="No world results yet" body="Static, One-Min-Max and Power scores appear here week by week." />
      ) : (
        <div className="pf-worlds">
          {worlds.map((w) => {
            const v = w.values;
            const last = v[v.length - 1];
            const delta = v.length > 1 ? last - v[v.length - 2] : null;
            return (
              <div key={w.key} className="pf-world" style={{ background: w.tint }}>
                <div className="pf-world-top">
                  <span className="pf-world-name" style={{ color: w.ink }}>
                    {w.name}
                  </span>
                  {delta !== null && (
                    <span className="pf-world-delta" style={{ color: w.ink }}>
                      {signed(delta)} this week
                    </span>
                  )}
                </div>
                <div className="pf-num pf-world-value">
                  {fmt(last)}
                  <span className="pf-unit">pts</span>
                </div>
                <div className="pf-world-spark">
                  <PerfLineChart
                    axis={false}
                    width={240}
                    height={70}
                    step={1}
                    floor={0}
                    ariaLabel={`${w.name} score by week`}
                    labels={w.labels.map(shortDate)}
                    series={[{ key: w.key, label: w.name, color: w.line, values: v }]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Cell>
  );
}

// ---------- 3. Bodyweight ----------

function BodyweightCell({ data }: { data: UserPerformance['bodyweight'] }) {
  const n = data.length;
  const last = n ? Number(data[n - 1].weight_kg) : null;
  const first = n ? Number(data[0].weight_kg) : null;
  // Neutral colour on purpose: a bodyweight change is neither good nor bad.
  const side =
    last !== null ? (
      <div className="pf-figure-side">
        <span className="pf-num">
          {fmt(last)}
          <span className="pf-unit">kg</span>
        </span>
        <span className="pf-figure-note">
          {n > 1 ? `${signed(last - first!)} kg since ${shortDate(data[0].date)}` : `Logged ${shortDate(data[0].date)}`}
        </span>
      </div>
    ) : undefined;

  return (
    <Cell title="Bodyweight" sub="Weekly log" side={side}>
      {n > 1 ? (
        <PerfLineChart
          ariaLabel="Bodyweight over time"
          labels={data.map((p) => shortDate(p.date))}
          series={[{ key: 'bw', label: 'Bodyweight', color: 'var(--pf-ink)', values: data.map((p) => Number(p.weight_kg)) }]}
          unit="kg"
          step={1}
        />
      ) : n === 1 ? (
        <EmptyBox title="One log so far" body="The trend line appears after a second weekly weigh-in." />
      ) : (
        <EmptyBox title="No weigh-ins yet" body="Bodyweight is logged once a week from the program screen." />
      )}
    </Cell>
  );
}

// ---------- 4. Blocks completed ----------

function BlocksCell({
  data,
  sel,
  setSel,
  print,
}: {
  data: CompletionProgram[];
  sel: Selection;
  setSel: (s: Partial<Selection>) => void;
  print?: boolean;
}) {
  const withWeeks = data.filter((p) => p.weeks.length > 0);
  if (withWeeks.length === 0) {
    return (
      <Cell title="Blocks completed" sub="Per program week">
        <EmptyBox title="No program yet" body="Completion appears once a program is assigned and logged." />
      </Cell>
    );
  }
  const program = withWeeks.find((p) => p.program_id === sel.completionProgram) ?? defaultProgram(withWeeks)!;
  const total = program.weeks.reduce((s, w) => s + w.total, 0);
  const done = program.weeks.reduce((s, w) => s + w.completed, 0);

  return (
    <Cell
      title="Blocks completed"
      sub="Per program week"
      side={
        <Select
          label="Program"
          value={program.program_id}
          options={withWeeks.map((p) => ({
            value: p.program_id,
            label: `${p.name} · ${p.status} · ${formatDate(p.assigned_at)}`,
          }))}
          onChange={(v) => setSel({ completionProgram: v })}
          print={print}
        />
      }
    >
      <div className="pf-summary">
        <span className="pf-num">{total ? Math.round((done / total) * 100) : 0}%</span>
        <span className="pf-summary-note">
          {done} of {total} blocks · {program.weeks.length} week{program.weeks.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="pf-weeks" role="list" aria-label="Blocks completed per program week">
        {program.weeks.map((w) => {
          const pct = w.total ? Math.round((w.completed / w.total) * 100) : 0;
          const current = w.week === program.current_week;
          return (
            <div
              key={w.week}
              role="listitem"
              className={`pf-week${current ? ' pf-week-current' : ''}`}
              title={`Week ${w.week}: ${w.completed} of ${w.total} done${w.missed ? ` · ${w.missed} missed` : ''}`}
            >
              <span className="pf-week-pct">{pct}%</span>
              <div className={`pf-week-stack${w.total > 16 ? ' pf-week-stack-dense' : ''}`}>
                {Array.from({ length: w.total }, (_, k) => (
                  <div key={k} className={`pf-cell-block${k < w.completed ? ' pf-cell-done' : ''}`} />
                ))}
              </div>
              <span className="pf-week-label">W{w.week}</span>
            </div>
          );
        })}
      </div>
    </Cell>
  );
}

// ---------- 5. Effort & feel ----------

// Feel ratings in the order the app offers them, lightest effort-to-best
// on a single-hue ramp (sequential, not good/bad status colours).
const FEELS: { key: Feel; label: string; opacity: number }[] = [
  { key: 'hard', label: 'Hard', opacity: 0.3 },
  { key: 'ok', label: 'OK', opacity: 0.45 },
  { key: 'good', label: 'Good', opacity: 0.6 },
  { key: 'strong', label: 'Strong', opacity: 0.78 },
  { key: 'beast', label: 'Beast', opacity: 1 },
];

function EffortCell({
  data,
  sel,
  setSel,
  print,
}: {
  data: CompletionProgram[];
  sel: Selection;
  setSel: (s: Partial<Selection>) => void;
  print?: boolean;
}) {
  const withWeeks = data.filter((p) => p.weeks.length > 0);
  const program = withWeeks.find((p) => p.program_id === sel.completionProgram) ?? defaultProgram(withWeeks);
  const weeks = program?.weeks ?? [];
  const rpe = weeks.map((w) => (w.avg_rpe != null ? Number(w.avg_rpe) : null));
  const rated = rpe.map((v, i) => ({ v, wk: weeks[i]?.week })).filter((x) => x.v !== null);
  const anyFeel = weeks.some((w) => Object.keys(w.feel ?? {}).length > 0);

  const side = program && withWeeks.length > 1 && !print ? (
    <Select
      label="Program"
      value={program.program_id}
      options={withWeeks.map((p) => ({ value: p.program_id, label: `${p.name} · ${p.status}` }))}
      onChange={(v) => setSel({ completionProgram: v })}
    />
  ) : undefined;

  if (!program || (rated.length === 0 && !anyFeel)) {
    return (
      <Cell title="Effort & feel" sub="Average RPE and how sessions felt, per program week" wide side={side}>
        <EmptyBox
          title="No effort ratings yet"
          body="RPE and feel are recorded when a block is logged with “Add details”."
        />
      </Cell>
    );
  }

  const last = rated[rated.length - 1];
  const first = rated[0];
  const n = weeks.length;
  return (
    <Cell title="Effort & feel" sub="Average RPE and how sessions felt, per program week" wide side={side}>
      {last && (
        <div className="pf-summary">
          <span className="pf-num">{fmt(last.v!)}</span>
          <span className="pf-summary-note">
            avg RPE in W{last.wk}
            {first && first !== last ? ` · ${signed(last.v! - first.v!)} since W${first.wk}` : ''}
          </span>
        </div>
      )}
      <PerfLineChart
        ariaLabel="Average RPE per program week"
        labels={weeks.map((w) => `W${w.week}`)}
        series={[{ key: 'rpe', label: 'Avg RPE', color: 'var(--pf-coral)', values: rpe, details: rpe.map((v) => (v === null ? null : `RPE ${fmt(v)}`)) }]}
        domain={[0, 10]}
        width={1100}
        height={190}
      />
      {anyFeel && (
        <>
          <div className="pf-feel-strip" aria-label="How sessions felt, per week" role="list">
            {weeks.map((w, i) => {
              const counts = FEELS.map((f) => ({ ...f, n: w.feel?.[f.key] ?? 0 }));
              const total = counts.reduce((sum, c) => sum + c.n, 0);
              return (
                <div
                  key={w.week}
                  role="listitem"
                  className="pf-feel-col"
                  style={{ left: `${n === 1 ? 50 : 0.6 + (i * 98.8) / (n - 1)}%` }}
                  title={
                    total
                      ? `W${w.week}: ${counts.filter((c) => c.n).map((c) => `${c.n} ${c.label.toLowerCase()}`).join(', ')}`
                      : `W${w.week}: no feel ratings`
                  }
                >
                  {total === 0 ? (
                    <span className="pf-feel-none" />
                  ) : (
                    counts
                      .filter((c) => c.n)
                      .map((c) => (
                        <span
                          key={c.key}
                          className="pf-feel-seg"
                          style={{ flexGrow: c.n, background: 'var(--pf-purple)', opacity: c.opacity }}
                        />
                      ))
                  )}
                </div>
              );
            })}
          </div>
          <ul className="pf-feel-legend">
            <li className="pf-feel-legend-title">Feel</li>
            {FEELS.map((f) => (
              <li key={f.key}>
                <span className="pf-dot8" style={{ background: 'var(--pf-purple)', opacity: f.opacity }} />
                {f.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </Cell>
  );
}

// ---------- panel ----------

function Cells({
  data,
  sel,
  setSel,
  print,
}: {
  data: UserPerformance;
  sel: Selection;
  setSel: (s: Partial<Selection>) => void;
  print?: boolean;
}) {
  return (
    <div className="pf-grid">
      <BodyweightCell data={data.bodyweight} />
      <BlocksCell data={data.completion} sel={sel} setSel={setSel} print={print} />
      <WeightedCell data={data.weighted} activeProgram={activeProgramId(data)} sel={sel} setSel={setSel} print={print} />
      <WorldsCell data={data.worlds} />
      <EffortCell data={data.completion} sel={sel} setSel={setSel} print={print} />
    </div>
  );
}

/** "W1 – W12 · Program name" for the selected program, else a date range. */
function rangeLabel(data: UserPerformance, sel: Selection): string {
  const withWeeks = data.completion.filter((p) => p.weeks.length > 0);
  const program = withWeeks.find((p) => p.program_id === sel.completionProgram) ?? defaultProgram(withWeeks);
  if (program) {
    const wks = program.weeks.map((w) => w.week);
    return `W${Math.min(...wks)} – W${Math.max(...wks)} · ${program.name}`;
  }
  const dates = [...data.bodyweight.map((b) => b.date), ...data.worlds.map((w) => w.week_start)].sort();
  return dates.length ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}` : '';
}

/** What goes into the PDF, chosen in the export box. */
interface ExportOptions {
  exercises: string[];
  weekFrom: number;
  weekTo: number;
}

const DAY_MS = 864e5;

function selectedProgram(data: UserPerformance, sel: Selection): CompletionProgram | undefined {
  const withWeeks = data.completion.filter((p) => p.weeks.length > 0);
  return withWeeks.find((p) => p.program_id === sel.completionProgram) ?? defaultProgram(withWeeks);
}

/** Every program week that has any data, first to last. */
function weekBounds(data: UserPerformance, sel: Selection): [number, number] | null {
  const weeks = [
    ...(selectedProgram(data, sel)?.weeks.map((w) => w.week) ?? []),
    ...data.weighted.flatMap((m) => m.points.map((p) => p.week).filter((w): w is number => w != null)),
  ];
  return weeks.length ? [Math.min(...weeks), Math.max(...weeks)] : null;
}

/** Keeps only weeks from..to. Weighted sets and blocks are numbered by
 * program week; bodyweight and world scores are dated, so they keep the
 * matching dates (program start + 7 days per week). */
function filterWeeks(data: UserPerformance, sel: Selection, from: number, to: number): UserPerformance {
  const inRange = (w: number | null) => w != null && w >= from && w <= to;
  const program = selectedProgram(data, sel);
  const start = program ? new Date(program.assigned_at).getTime() + (from - 1) * 7 * DAY_MS : null;
  const end = program ? new Date(program.assigned_at).getTime() + to * 7 * DAY_MS : null;
  const inDates = (iso: string) => start === null || (new Date(iso).getTime() >= start && new Date(iso).getTime() < end!);
  return {
    weighted: data.weighted
      .map((m) => ({ ...m, points: m.points.filter((p) => inRange(p.week)) }))
      .filter((m) => m.points.length > 0),
    completion: data.completion.map((c) => ({ ...c, weeks: c.weeks.filter((w) => inRange(w.week)) })),
    bodyweight: data.bodyweight.filter((b) => inDates(b.date)),
    worlds: data.worlds.filter((w) => inDates(w.week_start)),
  };
}

function Head({ title, range, children }: { title: string; range: string; children?: ReactNode }) {
  return (
    <div className="pf-head">
      <div className="pf-head-titles">
        <span className="pf-eyebrow">Training</span>
        <h2 className="pf-heading">{title}</h2>
      </div>
      <div className="pf-head-side">
        {range && <span className="pf-range">{range}</span>}
        {children}
      </div>
    </div>
  );
}

/** Print-only copy, rendered at the top of <body> so the admin shell never
 * reaches the PDF. Always uses the handoff's light palette. */
function PrintReport({
  data: allData,
  sel,
  athleteName,
  note,
  opts,
}: {
  data: UserPerformance;
  sel: Selection;
  athleteName: string;
  note: string;
  opts: ExportOptions;
}) {
  const data = filterWeeks(allData, sel, opts.weekFrom, opts.weekTo);
  const noop = () => {};
  // One Weighted lifts cell per chosen movement; the on-screen movement
  // keeps its program and hidden slots, the others use their defaults.
  // The movement on screen leads; the rest keep their chip order.
  const lifts = [...opts.exercises]
    .filter((ex) => data.weighted.some((m) => m.exercise === ex))
    .sort((a, b) => (a === sel.exercise ? -1 : b === sel.exercise ? 1 : 0));
  const liftCell = (ex: string) => (
    <WeightedCell
      key={ex}
      data={data.weighted}
      activeProgram={activeProgramId(allData)}
      sel={ex === sel.exercise ? sel : { ...sel, exercise: ex, weightedProgram: null, hiddenSlots: [] }}
      setSel={noop}
      print
    />
  );
  return createPortal(
    <div className="pf-report pf-root">
      <div className="pf-panel">
        <Head title={athleteName} range={rangeLabel(data, sel)} />
        {note.trim() && (
          <section className="pf-report-note" style={{ margin: '16px 20px 0' }}>
            <h2>Coach's note</h2>
            <p>{note.trim()}</p>
          </section>
        )}
        <div style={{ marginTop: note.trim() ? 16 : 0, borderTop: note.trim() ? '1px solid var(--pf-divider)' : 0 }}>
          <PerfPrintContext.Provider value={true}>
            <div className="pf-grid">
              {/* Same order as the screen: the basics first, then the first
                  lift beside World points, then any extra lifts at the end. */}
              <BodyweightCell data={data.bodyweight} />
              <BlocksCell data={data.completion} sel={sel} setSel={noop} print />
              {lifts.slice(0, 1).map(liftCell)}
              <WorldsCell data={data.worlds} />
              <EffortCell data={data.completion} sel={sel} setSel={noop} print />
            </div>
            {/* Extra lifts in their own grid, so they pair up two per row
                regardless of the full-width Effort row above. */}
            {lifts.length > 1 && (
              <div className="pf-grid pf-grid-extra">{lifts.slice(1).map(liftCell)}</div>
            )}
          </PerfPrintContext.Provider>
        </div>
      </div>
      <p className="pf-report-foot">
        <span>LEAP · Performance report</span>
        <span>Generated {formatDate(new Date().toISOString())}</span>
      </p>
    </div>,
    document.body,
  );
}

/** Admin-only trial of the per-user performance charts planned for the
 * app's Train screen, with a client-ready PDF export. */
export function PerformancePanel({ userId, athleteName }: { userId: string; athleteName: string }) {
  const q = useQuery({
    queryKey: ['user-performance', userId],
    queryFn: () => fetchUserPerformance(userId),
    enabled: !!userId,
  });
  const [sel, setSelState] = useState<Selection>({
    exercise: null,
    weightedProgram: null,
    completionProgram: null,
    hiddenSlots: [],
  });
  const setSel = (s: Partial<Selection>) => setSelState((prev) => ({ ...prev, ...s }));
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');
  const [printing, setPrinting] = useState(false);
  const [opts, setOpts] = useState<ExportOptions>({ exercises: [], weekFrom: 1, weekTo: 1 });

  const openComposer = () => {
    if (!q.data) return;
    const bounds = weekBounds(q.data, sel) ?? [1, 1];
    const current = sel.exercise ?? q.data.weighted[0]?.exercise;
    setOpts({ exercises: current ? [current] : [], weekFrom: bounds[0], weekTo: bounds[1] });
    setComposing(true);
  };
  const bounds = q.data ? weekBounds(q.data, sel) : null;
  const weekOptions = bounds
    ? Array.from({ length: bounds[1] - bounds[0] + 1 }, (_, i) => bounds[0] + i)
    : [];

  // Print once the report has rendered; the document title becomes the
  // suggested PDF file name, and everything is restored after printing.
  useEffect(() => {
    if (!printing) return;
    const prevTitle = document.title;
    document.title = `Leap · ${athleteName} · Performance`;
    document.documentElement.classList.add('pf-printing');
    const done = () => {
      document.title = prevTitle;
      document.documentElement.classList.remove('pf-printing');
      setPrinting(false);
    };
    window.addEventListener('afterprint', done, { once: true });
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printing, athleteName]);

  return (
    <section className="pf-root pf-panel">
      <Head title="Performance" range={q.data ? rangeLabel(q.data, sel) : ''}>
        {q.data && !composing && (
          <button type="button" className="pf-btn" onClick={openComposer}>
            Export PDF
          </button>
        )}
      </Head>
      {composing && q.data && (
        <form
          className="pf-composer"
          onSubmit={(e) => {
            e.preventDefault();
            setPrinting(true);
          }}
        >
          <label className="pf-composer-label" htmlFor="pf-note">
            Note to {athleteName}
            <span>optional · printed above the charts</span>
          </label>
          <textarea
            id="pf-note"
            className="pf-composer-input"
            rows={3}
            maxLength={600}
            placeholder="e.g. Deadlift is up 25 kg since week 1. Next block we push squat volume."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          {q.data.weighted.length > 0 && (
            <fieldset className="pf-composer-field">
              <legend className="pf-composer-label">
                Movements
                <span>one Weighted lifts chart each</span>
              </legend>
              <div className="pf-seg pf-seg-wrap">
                {q.data.weighted.map((m) => {
                  const on = opts.exercises.includes(m.exercise);
                  return (
                    <button
                      key={m.exercise}
                      type="button"
                      className="pf-seg-item"
                      aria-pressed={on}
                      onClick={() =>
                        setOpts((o) => ({
                          ...o,
                          exercises: on ? o.exercises.filter((e) => e !== m.exercise) : [...o.exercises, m.exercise],
                        }))
                      }
                    >
                      {m.exercise}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {weekOptions.length > 1 && (
            <fieldset className="pf-composer-field">
              <legend className="pf-composer-label">
                Weeks
                <span>bodyweight and world points follow the same dates</span>
              </legend>
              <div className="pf-week-range">
                <label>
                  From
                  <select
                    className="pf-select"
                    value={opts.weekFrom}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setOpts((o) => ({ ...o, weekFrom: v, weekTo: Math.max(v, o.weekTo) }));
                    }}
                  >
                    {weekOptions.map((w) => (
                      <option key={w} value={w}>
                        W{w}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select
                    className="pf-select"
                    value={opts.weekTo}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setOpts((o) => ({ ...o, weekTo: v, weekFrom: Math.min(v, o.weekFrom) }));
                    }}
                  >
                    {weekOptions.map((w) => (
                      <option key={w} value={w}>
                        W{w}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
          )}
          <div className="pf-composer-actions">
            <span className="pf-composer-hint">Programs and hidden slots follow what's selected below.</span>
            <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setComposing(false)}>
              Cancel
            </button>
            <button type="submit" className="pf-btn pf-btn-primary" disabled={printing}>
              {printing ? 'Preparing…' : 'Save as PDF'}
            </button>
          </div>
        </form>
      )}
      {q.error && (
        <div className="pf-cell">
          <ErrorNote error={q.error} />
        </div>
      )}
      {q.isLoading && (
        <div className="pf-grid" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pf-cell">
              <div className="skeleton" style={{ height: 16, width: 140 }} />
              <div className="skeleton" style={{ height: 190 }} />
            </div>
          ))}
        </div>
      )}
      {q.data && <Cells data={q.data} sel={sel} setSel={setSel} />}
      {q.data && printing && <PrintReport data={q.data} sel={sel} athleteName={athleteName} note={note} opts={opts} />}
    </section>
  );
}
