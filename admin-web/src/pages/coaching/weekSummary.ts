import type { BuilderBlock, BuilderWeeks } from './builder/types';
import type { WarriorProgressBodyweight, WarriorProgressLog, WarriorProgressSet } from '@/api/coaching';
import { describeBlockKind } from '@/shared/ProgramImportParser';
import { buildExportTestResult, type ExportTestResultRow } from '@/shared/ProgramExportBuilder';
import { isTestKind } from '@/shared/testItems';
import { plannedText, splitNote } from './WeekLogs';

// Week summary export: a short, read-only view of one or more weeks for the
// coach's AI assistant. One line per exercise, sets folded into a string,
// empty fields left out. It is not an import file (IMPORT WEEK still needs
// the full EXPORT WEEK format). docs/features/test-day-format.md.

export interface SummaryExercise {
  name: string;
  /** What the program asked for: "4 × 6", "3 rounds × 10 +kg". */
  planned?: string;
  /** What was logged, one entry per set: "8, 8, 7" or "20kg×6, 20kg×5" or "30s, 25s". */
  done?: string;
  rpe?: number;
}

export interface SummaryTest {
  kind: string;
  /** World movement; for a hold, the progression picked (else the category). */
  movement?: string;
  value?: number;
  unit?: string;
  /** The athlete's previous result of the same test, any program. */
  previous?: number;
  previous_week?: number;
  pb?: 'new' | 'matched';
  world?: string;
  skip_reason?: string;
  skip_detail?: string;
  note?: string;
  grade?: string;
  coach_note?: string;
}

export interface SummaryBlock {
  block: string;
  /** "Straight sets", "Circuit · 3 rounds", "AMRAP 12 min", "Test item". */
  kind: string;
  status: 'done' | 'missed' | 'not_logged';
  rpe?: number;
  feel?: string;
  minutes?: number;
  /** The app's result line: "Completed 3 rounds", "Finished in 0:14", "Top weight 40 kg". */
  result?: string;
  /** The athlete's own note on the block. */
  notes?: string;
  missed_reason?: string;
  missed_detail?: string;
  exercises?: SummaryExercise[];
  test?: SummaryTest;
}

export interface SummaryWeek {
  week: number;
  coach_week_note?: string;
  totals: { done: number; missed: number; not_logged: number };
  days: { day: string; blocks: SummaryBlock[] }[];
  /** Logged blocks no longer in the program (removed or replaced since). */
  other_logs?: { block: string; status: 'done' | 'missed'; notes?: string }[];
}

export interface WeekSummary {
  type: 'leap_week_summary';
  version: 1;
  exported_at: string;
  warrior: { name: string; strength_tier: number };
  program: string;
  weeks: SummaryWeek[];
  /** Latest weigh-ins (up to 12), newest first. */
  bodyweight: { date: string; kg: number }[];
}

export interface BuildWeekSummaryInput {
  warriorProgramId: string;
  warriorName: string;
  strengthTier: number;
  programName: string;
  /** Weeks to include, in order. */
  weeks: number[];
  plan: BuilderWeeks;
  logs: WarriorProgressLog[];
  /** Every test result of the athlete (any program). */
  testResults: ExportTestResultRow[];
  weekNotes: Map<number, string>;
  bodyweight: WarriorProgressBodyweight[];
  now?: Date;
}

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/** "8", "20kg×8", "30s", "10kg×30s". */
export function setText(s: WarriorProgressSet): string {
  const kg = s.weight_used != null && s.weight_used > 0 ? `${trimNum(Number(s.weight_used))}kg` : '';
  const what =
    s.reps_completed != null ? String(s.reps_completed) : s.hold_seconds != null ? `${trimNum(Number(s.hold_seconds))}s` : '';
  if (kg && what) return `${kg}×${what}`;
  return kg || what || '✓';
}

/** Drops null, undefined, '' and [] so the file stays short. */
function clean<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as T;
}

function testSummary(input: BuildWeekSummaryInput, block: BuilderBlock): SummaryTest {
  const t = buildExportTestResult(input.warriorProgramId, block.db_id ?? '', block.metadata, input.testResults);
  return clean({
    kind: String(block.metadata.test_kind),
    movement: t.movement_id ?? block.metadata.test_movement ?? undefined,
    value: t.value ?? undefined,
    unit: t.unit ?? undefined,
    previous: t.previous?.value,
    previous_week: t.previous?.week_number,
    pb: t.is_new_pb ? 'new' : t.is_matched_pb ? 'matched' : undefined,
    world: t.status === 'done' && t.world_status && t.world_status !== 'none' ? t.world_status : undefined,
    skip_reason: t.skip_reason ?? undefined,
    skip_detail: t.skip_detail ?? undefined,
    note: t.note ?? undefined,
    grade: t.coach_grade ?? undefined,
    coach_note: t.coach_note ?? undefined,
  });
}

function blockSummary(input: BuildWeekSummaryInput, block: BuilderBlock, log: WarriorProgressLog | null): SummaryBlock {
  const status: SummaryBlock['status'] = !log ? 'not_logged' : log.status === 'missed' ? 'missed' : 'done';
  const { results, own } = splitNote(log?.notes ?? null);
  const isTest = isTestKind(block.metadata.test_kind);

  let exercises: SummaryExercise[] | undefined;
  if (!isTest) {
    const bySet = new Map<string, WarriorProgressSet[]>();
    for (const s of status === 'done' ? log!.sets : []) {
      bySet.set(key(s.exercise_name), [...(bySet.get(key(s.exercise_name)) ?? []), s]);
    }
    const rpe = new Map(Object.entries(log?.exercise_rpe ?? {}).map(([n, r]) => [key(n), r]));
    const planned = block.exercises.map((ex) => {
      const sets = (bySet.get(key(ex.exercise_name)) ?? []).sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0));
      bySet.delete(key(ex.exercise_name));
      return clean({
        name: ex.exercise_name ?? 'Exercise',
        planned: plannedText(ex, block),
        done: sets.map(setText).join(', '),
        rpe: rpe.get(key(ex.exercise_name)),
      });
    });
    // Sets logged for an exercise the plan doesn't have (swapped by the athlete).
    const extras = [...bySet.entries()].map(([, sets]) =>
      clean({ name: sets[0].exercise_name ?? 'Exercise', done: sets.map(setText).join(', ') }),
    );
    exercises = [...planned, ...extras];
  }

  return clean({
    block: block.name,
    kind: describeBlockKind({ metadata: block.metadata }),
    status,
    rpe: log?.rpe ?? undefined,
    feel: log?.feel ?? undefined,
    minutes: log?.session_seconds ? Math.max(1, Math.round(log.session_seconds / 60)) : undefined,
    result: results.join('; '),
    // A test item's note is in test.note.
    notes: isTest ? undefined : own,
    missed_reason: status === 'missed' ? log?.missed_reason ?? undefined : undefined,
    missed_detail: status === 'missed' ? log?.missed_detail ?? undefined : undefined,
    exercises,
    test: isTest ? testSummary(input, block) : undefined,
  });
}

/** Pure: everything comes in from data the progress view already loads. */
export function buildWeekSummary(input: BuildWeekSummaryInput): WeekSummary {
  // Newest log per block (an older one is a re-log).
  const sorted = [...input.logs].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  const latest = new Map<string, WarriorProgressLog>();
  for (const l of sorted) if (l.block_id && !latest.has(l.block_id)) latest.set(l.block_id, l);

  const weeks: SummaryWeek[] = input.weeks.map((week) => {
    const plan = input.plan[week] ?? [];
    const plannedIds = new Set<string>();
    const totals = { done: 0, missed: 0, not_logged: 0 };
    const days = plan.map((day) => ({
      day: day.name,
      blocks: day.blocks.map((b) => {
        if (b.db_id) plannedIds.add(b.db_id);
        const s = blockSummary(input, b, (b.db_id && latest.get(b.db_id)) || null);
        totals[s.status]++;
        return s;
      }),
    }));
    const other = sorted.filter(
      (l) => (l.week_number ?? 1) === week && (!l.block_id || !plannedIds.has(l.block_id)) && (!l.block_id || latest.get(l.block_id) === l),
    );
    return clean({
      week,
      coach_week_note: input.weekNotes.get(week)?.trim(),
      totals,
      days,
      other_logs: other.map((l) => {
        const name = l.block_name ?? 'Workout';
        const sep = name.indexOf(' | ');
        return clean({
          block: sep === -1 ? name : name.slice(sep + 3).trim(),
          status: l.status === 'missed' ? ('missed' as const) : ('done' as const),
          notes: splitNote(l.notes).own,
        });
      }),
    });
  });

  return {
    type: 'leap_week_summary',
    version: 1,
    exported_at: (input.now ?? new Date()).toISOString(),
    warrior: { name: input.warriorName, strength_tier: input.strengthTier },
    program: input.programName,
    weeks,
    bodyweight: input.bodyweight.map((b) => ({ date: b.logged_at.slice(0, 10), kg: Number(b.weight_kg) })),
  };
}

/** The weeks of a summary: the last `count` program weeks up to and
 * including `upTo` ('all' = every week up to it). */
export function summaryWeeks(allWeeks: number[], upTo: number, count: number | 'all'): number[] {
  const upto = allWeeks.filter((w) => w <= upTo);
  return count === 'all' ? upto : upto.slice(-count);
}

/** JSON with anything that fits on one line kept on one line (an exercise,
 * a test result). An object that doesn't fit keeps its short fields packed
 * together on as few lines as fit, then one line per nested field. Still
 * plain JSON. */
export function compactJson(value: unknown, width = 140, indent = ''): string {
  const flat = JSON.stringify(value);
  if (flat === undefined) return 'null';
  if (value === null || typeof value !== 'object' || indent.length + flat.length <= width) return flat;
  const next = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => next + compactJson(v, width, next)).join(',\n')}\n${indent}]`;
  }
  const lines: string[] = [];
  let packed = '';
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const item = `${JSON.stringify(k)}: ${compactJson(v, width, next)}`;
    const short = v === null || typeof v !== 'object' || !item.includes('\n');
    if (short && next.length + packed.length + item.length + 2 <= width) {
      packed = packed ? `${packed}, ${item}` : item;
      continue;
    }
    if (packed) lines.push(packed);
    packed = '';
    if (short && next.length + item.length <= width) packed = item;
    else lines.push(item);
  }
  if (packed) lines.push(packed);
  return `{\n${lines.map((l) => next + l).join(',\n')}\n${indent}}`;
}

/** Browser download of a text file. */
export function downloadTextFile(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
