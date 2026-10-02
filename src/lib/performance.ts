import { supabase } from './supabase';

// The athlete's own Performance data ("My progress", Train tab). Same shape
// and same server-side computation as the admin panel's charts:
// get_my_performance() and admin_get_user_performance() both read
// _performance_for() (20261002070000_get_my_performance.sql).

export type Feel = 'hard' | 'ok' | 'good' | 'strong' | 'beast';

export interface WeightedPoint {
  date: string;
  week: number | null;
  weight: number;
  reps: number | null;
  block: string | null;
  program_id: string | null;
  program: string | null;
}

export interface WeightedMovement {
  exercise: string;
  points: WeightedPoint[];
}

export interface CompletionWeek {
  week: number;
  total: number;
  completed: number;
  missed: number;
  avg_rpe: number | null;
  feel: Partial<Record<Feel, number>>;
}

export interface CompletionProgram {
  program_id: string;
  name: string;
  status: string;
  assigned_at: string;
  current_week: number;
  weeks: CompletionWeek[];
}

export interface MovementWeek {
  week_start: string; // Monday
  reps: number;
  best: number; // best single set
  variations: Record<string, number>; // reps per variation ('' = untagged)
}

/** Main bodyweight movements, in display order (reps only; holds come later). */
export const REP_MOVEMENTS = [
  'pull_up',
  'inverted_row',
  'dip',
  'push_up',
  'pike_push_up',
  'squat',
  'pistol_squat',
  'deadlift',
  'muscle_up',
  'handstand_push_up',
  'front_lever_press',
] as const;
export type RepMovement = (typeof REP_MOVEMENTS)[number];

export interface Performance {
  movements?: { family: string; weeks: MovementWeek[] }[];
  weighted: WeightedMovement[];
  bodyweight: { date: string; weight_kg: number }[];
  completion: CompletionProgram[];
  worlds: { week_start: string; static: number; onemm: number; power: number }[];
}

export async function getMyPerformance(): Promise<Performance> {
  const { data, error } = await supabase.rpc('get_my_performance');
  if (error) throw error;
  return data as Performance;
}

/** The active program, else the newest — the default wherever a program
 * is picked. */
export function defaultProgram<T extends { status: string }>(programs: T[]): T | undefined {
  return programs.find((p) => p.status === 'active') ?? programs[0];
}

export const MAX_SLOTS = 3;

export interface SlotSeries {
  /** Block name, e.g. "LEGS DAY3 | Strength -B". */
  key: string;
  /** Display name: "LEGS DAY3 · Strength -B". */
  label: string;
  /** null = that week wasn't logged; the line breaks there. */
  values: (number | null)[];
  reps: (number | null)[];
  first?: { value: number; week: number };
  last?: { value: number; week: number };
}

export interface WeightedView {
  programs: { id: string; name: string }[];
  programId: string | undefined;
  /** Every week from first to last log, so unlogged weeks stay in place. */
  weeks: number[];
  slots: SlotSeries[];
  /** Workout slots beyond MAX_SLOTS, not drawn. */
  extraSlots: number;
}

/** One line per workout slot (block name) for one movement in one program,
 * heaviest set per slot per week — a heavy day and a light day of the same
 * lift are compared week to week, never mixed. Mirrors the admin panel. */
export function weightedView(
  movement: WeightedMovement,
  activeProgramId: string | undefined,
  pickedProgramId: string | null,
): WeightedView {
  const programs = new Map<string, { name: string; latest: string }>();
  for (const p of movement.points) {
    if (!p.program_id || p.week == null || !p.block) continue;
    const cur = programs.get(p.program_id);
    if (!cur || p.date > cur.latest) programs.set(p.program_id, { name: p.program ?? '', latest: p.date });
  }
  const list = [...programs.entries()].sort((a, b) => b[1].latest.localeCompare(a[1].latest));
  const programId =
    list.find(([id]) => id === pickedProgramId)?.[0] ??
    list.find(([id]) => id === activeProgramId)?.[0] ??
    list[0]?.[0];
  const pts = movement.points.filter((p) => p.program_id === programId && p.week != null && p.block);

  const counts = new Map<string, number>();
  pts.forEach((p) => counts.set(p.block!, (counts.get(p.block!) ?? 0) + 1));
  const slotKeys = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SLOTS).map(([b]) => b);

  const logged = pts.filter((p) => slotKeys.includes(p.block!)).map((p) => p.week!);
  const weeks = logged.length
    ? Array.from({ length: Math.max(...logged) - Math.min(...logged) + 1 }, (_, i) => Math.min(...logged) + i)
    : [];

  const slots = slotKeys.map((key) => {
    const best = weeks.map((wk) => {
      const inWeek = pts.filter((p) => p.block === key && p.week === wk);
      return inWeek.length ? inWeek.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a)) : null;
    });
    const values = best.map((p) => (p ? Number(p.weight) : null));
    const present = values
      .map((v, i) => (v === null ? null : { value: v, week: weeks[i] }))
      .filter((x): x is { value: number; week: number } => x !== null);
    return {
      key,
      label: key.replace(/\s*\|\s*/g, ' · '),
      values,
      reps: best.map((p) => (p ? p.reps : null)),
      first: present[0],
      last: present[present.length - 1],
    };
  });

  return {
    programs: list.map(([id, p]) => ({ id, name: p.name })),
    programId,
    weeks,
    slots,
    extraSlots: counts.size - slotKeys.length,
  };
}

/** A world's weekly scores from its first result on (earlier weeks are
 * left out rather than drawn as zero). Empty = no result at all. */
export function worldSeries(
  worlds: Performance['worlds'],
  key: 'static' | 'onemm' | 'power',
): { weekStart: string; value: number }[] {
  const raw = worlds.map((w) => ({ weekStart: w.week_start, value: Math.round(Number(w[key])) }));
  const start = raw.findIndex((r) => r.value > 0);
  return start === -1 ? [] : raw.slice(start);
}

/** "+15", "−3.6", "±0" — a true minus sign. */
export function signed(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${fmtNum(Math.abs(r))}`;
}

export function fmtNum(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** Calendar weeks (Monday, YYYY-MM-DD) from the first logged week to this
 * week, last `max` of them — unlogged weeks stay as empty columns. */
export function movementWeeks(weeks: MovementWeek[], max = 8, now = new Date()): string[] {
  if (weeks.length === 0) return [];
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const out: string[] = [];
  for (let d = monday(new Date(weeks[0].week_start)); d <= monday(now); d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out.slice(-max);
}
