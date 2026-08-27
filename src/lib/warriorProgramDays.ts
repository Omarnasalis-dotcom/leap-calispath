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

export type DayStatus = 'completed' | 'today' | 'upcoming';

export interface DayStateEntry {
  day: ProgramDay;
  index: number;
  status: DayStatus;
}

/**
 * A day is "completed" once every one of its blocks has been logged
 * (completed or missed — a missed day still reads as done, per the design's
 * own 3-state table, not a 4th "missed" state that would block progression).
 * The first day that isn't fully logged is "today," the only tappable one;
 * everything after is "upcoming" (locked). Mirrors the nextUpBlock logic
 * already built for the Training Center hub's week stats, promoted from
 * block-level to day-level.
 */
export function deriveDayStates(days: ProgramDay[]): DayStateEntry[] {
  let todayFound = false;
  return days.map((day, index) => {
    const isResolved = day.blocks.length > 0 && day.blocks.every((b) => b.completedStatus !== 'none');
    let status: DayStatus;
    if (isResolved) {
      status = 'completed';
    } else if (!todayFound) {
      status = 'today';
      todayFound = true;
    } else {
      status = 'upcoming';
    }
    return { day, index, status };
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
