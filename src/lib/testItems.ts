import { ConceptMetadata } from './BlockConceptParser';
import { ONEMM_MOVEMENTS } from './oneMMLogic';
import { POWER_MOVEMENTS } from './powerLogic';
import { STATIC_MOVEMENTS } from './staticLogic';
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

/** The item's display name: its first exercise, else the block name after "Day | ". */
export function testItemTitle(block: Pick<ProgramBlock, 'name' | 'exercises'>): string {
  const ex = block.exercises?.[0]?.name;
  if (ex) return ex;
  const i = block.name.indexOf(' | ');
  return (i >= 0 ? block.name.slice(i + 3) : block.name).trim();
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
