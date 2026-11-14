import { ConceptMetadata } from './BlockConceptParser';
import { ONEMM_MOVEMENTS } from './oneMMLogic';
import { POWER_MOVEMENTS } from './powerLogic';
import { STATIC_CATEGORIES, STATIC_MOVEMENTS } from './staticLogic';
import { LEAP_SYSTEM_PROFILE_ID, AI_COACH_SYSTEM_PROFILE_ID } from '../constants/system';
import type { ProgramBlock, ProgramDay } from '../types/warriorProgram';

// Coach Test Week (supabase/migrations/20261114190000_coach_test_week.sql).
// A coach marks blocks of an assigned program as test items through the
// block's concept metadata: test_kind + test_movement. The server
// (submit_program_test_item) decides what is valid and where a result
// goes; this file only shapes the UI. Mirrors admin-web/src/shared/testItems.ts.

export type TestKind = 'max_reps' | 'one_rm' | 'max_hold' | 'form_check';
export type TestUnit = 'reps' | 'kg' | 'seconds';
export type SkipReason = 'cant_do' | 'injury' | 'no_equipment' | 'no_time' | 'other';
export type WorldStatus = 'saved' | 'locked' | 'no_world' | 'none';

export const SKIP_REASONS: SkipReason[] = ['cant_do', 'injury', 'no_equipment', 'no_time', 'other'];

export interface TestItem {
  kind: TestKind;
  /** onemm id (max_reps), power lift or 'deadlift' (one_rm), static
   * category (max_hold); undefined for form checks. */
  movement?: string;
}

export interface TestResult {
  id: string;
  block_id: string | null;
  week_number: number;
  test_kind: TestKind;
  movement_id: string | null;
  item_name: string | null;
  status: 'done' | 'skipped';
  value: number | null;
  unit: TestUnit | null;
  skip_reason: SkipReason | null;
  skip_detail: string | null;
  world_status: WorldStatus;
  is_new_pb: boolean;
  coach_grade: 'pass' | 'needs_work' | null;
  coach_note: string | null;
}

export interface TestCoach {
  name: string | null;
  /** Digits only, international format (wa.me wants no "+"). */
  whatsapp: string | null;
}

export function isTestKind(v: unknown): v is TestKind {
  return v === 'max_reps' || v === 'one_rm' || v === 'max_hold' || v === 'form_check';
}

export function getTestItem(metadata: ConceptMetadata | undefined | null): TestItem | null {
  if (!metadata || !isTestKind(metadata.test_kind)) return null;
  return { kind: metadata.test_kind, movement: metadata.test_movement || undefined };
}

export function isTestBlock(block: Pick<ProgramBlock, 'metadata'>): boolean {
  return getTestItem(block.metadata) !== null;
}

/** A day made only of test items (the Journey shows it as a test card). */
export function isTestDay(day: Pick<ProgramDay, 'blocks'>): boolean {
  return day.blocks.length > 0 && day.blocks.every(isTestBlock);
}

/** Test items only count on a program a real coach assigned — the server
 * refuses the "Leap" library and AI Coach system profiles, so their
 * programs show such blocks as normal blocks. */
export function isCoachAssigned(coachId: string | null | undefined): boolean {
  return !!coachId && coachId !== LEAP_SYSTEM_PROFILE_ID && coachId !== AI_COACH_SYSTEM_PROFILE_ID;
}

export function unitFor(kind: TestKind): TestUnit | null {
  if (kind === 'max_reps') return 'reps';
  if (kind === 'one_rm') return 'kg';
  if (kind === 'max_hold') return 'seconds';
  return null;
}

/** Display name of the world movement (English, like the world screens). */
export function testMovementName(item: TestItem): string | null {
  if (item.kind === 'max_reps') return ONEMM_MOVEMENTS.find((m) => m.id === item.movement)?.name ?? null;
  if (item.kind === 'one_rm') {
    if (item.movement === 'deadlift') return 'Deadlift';
    if (item.movement === 'squat') return 'Back Squat';
    return POWER_MOVEMENTS.find((m) => m.id === item.movement)?.name ?? null;
  }
  return null;
}

/** Squat and deadlift are bar weight; the other lifts are weight added to the body. */
export function isBarWeight(item: TestItem): boolean {
  return item.kind === 'one_rm' && (item.movement === 'squat' || item.movement === 'deadlift');
}

/** The progressions an athlete can pick for a max-hold item, easiest first. */
export function holdOptions(item: TestItem): { id: string; name: string }[] {
  if (item.kind !== 'max_hold') return [];
  return STATIC_MOVEMENTS.filter((m) => !item.movement || m.category === item.movement)
    .sort((a, b) => a.level - b.level)
    .map((m) => ({ id: m.id, name: m.name }));
}

export function staticMovementName(id: string | null | undefined): string | null {
  return STATIC_MOVEMENTS.find((m) => m.id === id)?.name ?? null;
}

/** The world a test kind feeds, as an i18n key under testWeek. */
export function worldKeyFor(kind: TestKind): 'worldEndurance' | 'worldPower' | 'worldStatic' | null {
  if (kind === 'max_reps') return 'worldEndurance';
  if (kind === 'one_rm') return 'worldPower';
  if (kind === 'max_hold') return 'worldStatic';
  return null;
}

/** "18", "102.5" — no trailing ".0". */
export function formatTestValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

// Names a builder gives a block on its own ("+ Block"): they say nothing
// about the test, so the movement names the item instead.
const DEFAULT_BLOCK_NAME = /^(workout routine|block\s*\d*)$/i;

/** "Pull-ups", "Back Squat", "Front Lever hold"; '' for a form check. */
export function testItemFallbackName(item: TestItem | null | undefined): string {
  if (!item) return '';
  if (item.kind === 'max_hold') {
    const cat = STATIC_CATEGORIES[item.movement as keyof typeof STATIC_CATEGORIES]?.name;
    return cat ? `${cat} hold` : '';
  }
  return testMovementName(item) ?? '';
}

/** The item's display name: its first exercise, else the block name after
 * "Day | " (unless it's a default name), else the tested movement. '' only
 * for a form check with neither — the caller shows the kind instead. */
export function testItemTitle(block: Pick<ProgramBlock, 'name' | 'exercises'>, item?: TestItem | null): string {
  const ex = block.exercises?.[0]?.name;
  if (ex) return ex;
  const i = block.name.indexOf(' | ');
  const name = (i >= 0 ? block.name.slice(i + 3) : block.name).trim();
  if (name && !DEFAULT_BLOCK_NAME.test(name)) return name;
  return testItemFallbackName(item);
}

/** wa.me link to the coach with a ready message. null without a number. */
export function whatsAppLink(number: string | null | undefined, message: string): string | null {
  const digits = (number || '').replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Parses a typed number ("12", "12,5", " 80 ") or null. */
export function parseTestNumber(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Client-side check before sending; the server re-checks everything. */
export function validateTestValue(kind: TestKind, value: number | null): 'ok' | 'empty' | 'whole' {
  if (kind === 'form_check') return 'ok';
  if (value == null) return 'empty';
  if (kind === 'max_reps' && (!Number.isInteger(value) || value <= 0)) return value <= 0 ? 'empty' : 'whole';
  if (kind === 'max_hold' && value <= 0) return 'empty';
  return 'ok';
}

const TEST_ERROR_CODES = [
  'VALUE_TOO_HIGH', 'BAD_VALUE', 'BAD_MOVEMENT', 'BAD_REASON', 'NOT_COACH_PROGRAM',
  'PROGRAM_NOT_FOUND', 'BLOCK_NOT_FOUND', 'NOT_A_TEST', 'PRO_REQUIRED',
] as const;
export type TestErrorKey = `testWeek.errors.${(typeof TEST_ERROR_CODES)[number] | 'generic'}`;

/** Server error code (bare code in the message) → i18n key under testWeek.errors. */
export function testErrorKey(error: unknown): TestErrorKey {
  const msg = String((error as { message?: string })?.message ?? error ?? '');
  const hit = TEST_ERROR_CODES.find((c) => msg.includes(c));
  return hit ? `testWeek.errors.${hit}` : 'testWeek.errors.generic';
}

// ---------------------------------------------------------------------------
// Demo video when the coach attached no exercise: the matching library
// exercise, found by its movement tags (exercise_library.movement_family /
// movement_variation), else by name. For a hold it follows the progression
// the athlete picked.

export type DemoLookup =
  | { family: string; variations: string[] }
  | { namePattern: string };

const DEMO_BY_MOVEMENT: Record<string, DemoLookup> = {
  // One Min Max + Power World
  pull_ups: { family: 'pull_up', variations: ['Normal grip'] },
  pull_up: { family: 'pull_up', variations: ['Normal grip'] },
  dips: { family: 'dip', variations: ['Parallel bar'] },
  dip: { family: 'dip', variations: ['Parallel bar'] },
  push_ups: { family: 'push_up', variations: ['Standard'] },
  muscle_ups: { family: 'muscle_up', variations: ['Strict'] },
  muscle_up: { family: 'muscle_up', variations: ['Strict'] },
  hspu: { family: 'handstand_push_up', variations: ['Standard'] },
  goblet_squats: { family: 'squat', variations: ['Goblet'] },
  air_squats: { family: 'squat', variations: ['Air'] },
  squat: { family: 'squat', variations: ['Back'] },
  deadlift: { family: 'deadlift', variations: ['Conventional'] },
  incline_push_ups: { family: 'push_up', variations: ['Incline'] },
  fl_press: { family: 'front_lever_press', variations: ['Full'] },
  fl_pull_ups: { namePattern: 'front lever pull%' },
  planche_push_ups: { namePattern: '%planche push%' },
  knee_push_ups: { namePattern: 'knee push%' },
  inverted_row: { namePattern: '%inverted row%' },
  assisted_pull_ups: { namePattern: 'banded pull up%' },
  bench_dips: { namePattern: '%bench dip%' },
  // Static World progressions
  tuck_front_lever: { family: 'front_lever', variations: ['Tuck', 'Advanced tuck'] },
  straddle_front_lever: { family: 'front_lever', variations: ['Straddle', 'Single leg', 'Full'] },
  full_front_lever: { family: 'front_lever', variations: ['Full'] },
  tuck_back_lever: { family: 'back_lever', variations: ['Tuck', 'Advanced tuck'] },
  straddle_back_lever: { family: 'back_lever', variations: ['Straddle', 'Single leg', 'Full'] },
  full_back_lever: { family: 'back_lever', variations: ['Full'] },
  tuck_planche: { family: 'planche', variations: ['Tuck', 'Lean'] },
  straddle_planche: { family: 'planche', variations: ['Straddle', 'Full'] },
  full_planche: { family: 'planche', variations: ['Full'] },
  wall_handstand: { family: 'handstand', variations: ['Wall', 'Belly to wall'] },
  freestanding_handstand: { family: 'handstand', variations: ['Free', 'Wall', 'Belly to wall'] },
  one_arm_handstand: { family: 'handstand', variations: ['One arm', 'Free', 'Wall'] },
};

/** How to find this item's demo video, or null (form checks: the coach's exercise only). */
export function demoLookupFor(item: TestItem, progressionId?: string | null): DemoLookup | null {
  if (item.kind === 'form_check') return null;
  const key = item.kind === 'max_hold' ? progressionId || holdOptions(item)[0]?.id : item.movement;
  return (key && DEMO_BY_MOVEMENT[key]) || null;
}

/** Picks the library row for a family lookup: first variation match in
 * order, else any row of that family. Rows have a video already. */
export function pickDemo<T extends { movement_variation: string | null }>(rows: T[], variations: string[]): T | null {
  const norm = (s: string | null) => (s || '').trim().toLowerCase();
  for (const v of variations) {
    const hit = rows.find((r) => norm(r.movement_variation) === v.toLowerCase());
    if (hit) return hit;
  }
  return rows[0] ?? null;
}
