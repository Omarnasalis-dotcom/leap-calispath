import { ProgramBlock, ProgramDay } from '../types/warriorProgram';

// program_blocks.name is authored as "{Day Name} | {Block Name}" (e.g.
// "Day 1 | Warm-Up", "Day 1 | Strength") — one real session/day is composed
// of multiple program_blocks rows sharing the same day-name prefix. This is
// the same split WarriorProgramScreen.tsx's loadWarriorProgram has always
// done inline; pulled out here so both that screen and the Training Center
// hub (src/lib/trainingCenter.ts) group blocks into days identically instead
// of two implementations silently drifting apart.
export function parseBlockName(rawName: string): { dayName: string; blockName: string } {
  const raw = rawName || '';
  if (raw.includes(' | ')) {
    const parts = raw.split(' | ');
    return { dayName: parts[0].trim(), blockName: parts.slice(1).join(' | ').trim() };
  }
  return { dayName: raw, blockName: 'Workout Routine' };
}

export interface RawProgramBlockRow {
  id: string;
  name: string;
  week_number: number | null;
}

export interface GroupedProgramDay {
  dayName: string;
  weekNumber: number;
  blockIds: string[];
}

/**
 * Groups raw program_blocks rows (as fetched directly, before any
 * per-exercise/status enrichment) into days by name-prefix + week, in
 * first-seen order. Used by the Training Center hub, which only needs
 * block ids/names/week — WarriorProgramScreen's own loadWarriorProgram
 * does the equivalent grouping itself since it enriches each block with
 * exercises/status in the same pass.
 */
export function groupRawBlocksIntoDays(blocks: RawProgramBlockRow[]): GroupedProgramDay[] {
  const map = new Map<string, GroupedProgramDay>();
  const order: string[] = [];
  for (const block of blocks) {
    const week = block.week_number ?? 1;
    const { dayName } = parseBlockName(block.name);
    const key = `${week}::${dayName.toUpperCase()}`;
    if (!map.has(key)) {
      map.set(key, { dayName, weekNumber: week, blockIds: [] });
      order.push(key);
    }
    map.get(key)!.blockIds.push(block.id);
  }
  return order.map((k) => map.get(k)!);
}

export type DayStatus = 'clean' | 'in_progress' | 'done';

export interface DayStateEntry {
  day: ProgramDay;
  index: number;
  status: DayStatus;
  /** 0-100, blocks logged / total blocks in the day. */
  progressPct: number;
}

/**
 * Days are never locked — a warrior can start any day in any order (the
 * program itself, not a rigid unlock sequence, is what sets the plan).
 * Status is purely a reflection of logging progress: 'clean' (nothing
 * logged yet), 'in_progress' (some but not all blocks logged — the day
 * card shows the real percentage), or 'done' (every block logged,
 * completed or missed alike — a missed block still counts as "addressed,"
 * not blocking).
 */
export function deriveDayStates(days: ProgramDay[]): DayStateEntry[] {
  return days.map((day, index) => {
    const total = day.blocks.length;
    const logged = day.blocks.filter((b) => b.completedStatus !== 'none').length;
    const progressPct = total === 0 ? 0 : Math.round((logged / total) * 100);
    let status: DayStatus;
    if (total > 0 && logged === total) status = 'done';
    else if (logged > 0) status = 'in_progress';
    else status = 'clean';
    return { day, index, status, progressPct };
  });
}

const ASSUMED_SECONDS_PER_SET = 40;

/**
 * Rough estimate only — no real duration field exists on
 * program_blocks/block_exercises (unlike the separate Quick Workout
 * feature's standalone_workouts.duration_minutes). Sum of sets x (an
 * assumed per-set time + that exercise's own rest) across every exercise in
 * the day. Callers should render this with a leading "~" so it reads as an
 * estimate, never a promise.
 */
export function estimateSessionMinutes(day: ProgramDay): number {
  let totalSeconds = 0;
  for (const block of day.blocks) {
    for (const ex of block.exercises) {
      const sets = parseInt(String(ex.sets || '1'), 10) || 1;
      const rest = parseInt(String(ex.rest_seconds || '0'), 10) || 0;
      totalSeconds += sets * (ASSUMED_SECONDS_PER_SET + rest);
    }
  }
  return Math.max(Math.round(totalSeconds / 60), 1);
}

export function countMovements(day: ProgramDay): number {
  return day.blocks.reduce((sum, b) => sum + b.exercises.length, 0);
}

// Matches the validation convention already used elsewhere (e.g.
// supabase/functions/ai-coach/tools/blockHelpers.ts's phase check) —
// case-insensitive, trimmed, rather than a brittle exact "Warm-Up" ===.
export function isWarmUpBlock(block: ProgramBlock): boolean {
  return block.name.trim().toLowerCase() === 'warm-up';
}
