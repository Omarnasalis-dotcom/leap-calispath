// Workout Templates Library — tier-based recommendation engine.
// See docs/features/warrior-program-week-export-import-format.md for why
// day/block names are read as "DAY | BLOCK" strings rather than columns.

import { supabase } from './supabase';

export interface TierRange {
  min: number;
  max: number;
}

export interface MatchingCriteria {
  goal: string;
  tier_range: TierRange;
}

export interface LibraryTemplateRecommendation {
  id: string;
  template_name: string;
  description: string | null;
  tier_range: TierRange;
  training_days_per_week: number;
  week_count: number;
  equipment_tags: string[];
  block_count: number;
  is_free: boolean;
  cover_image_url: string | null;
}

// Programs have no difficulty/level column — level is entirely derived from
// matching_criteria.tier_range, which already fully determines it.
export type DifficultyBand = 'beginner' | 'intermediate' | 'advanced';
export function tierRangeToDifficultyBand(range: TierRange): DifficultyBand {
  if (range.max <= 2) return 'beginner';
  if (range.max <= 5) return 'intermediate';
  return 'advanced';
}

// Index 0 per tier is the Recommended pick; remaining entries are
// Option 2 / Option 3 in order. Hardcoded (not a DB table) since it's
// small, fixed, and any future change is a deploy, not a data migration.
export const TIER_LOOKUP: Record<number, TierRange[]> = {
  0: [{ min: 0, max: 1 }, { min: 1, max: 2 }],
  1: [{ min: 0, max: 1 }, { min: 1, max: 2 }, { min: 2, max: 3 }],
  2: [{ min: 1, max: 2 }, { min: 2, max: 3 }, { min: 0, max: 1 }],
  3: [{ min: 2, max: 3 }, { min: 3, max: 4 }, { min: 1, max: 2 }],
  4: [{ min: 3, max: 4 }, { min: 4, max: 5 }, { min: 2, max: 3 }],
  5: [{ min: 4, max: 5 }, { min: 5, max: 6 }, { min: 3, max: 4 }],
  6: [{ min: 5, max: 6 }, { min: 6, max: 7 }, { min: 4, max: 5 }],
  7: [{ min: 6, max: 7 }, { min: 7, max: 9 }, { min: 5, max: 6 }],
  8: [{ min: 7, max: 9 }, { min: 6, max: 7 }],
  9: [{ min: 7, max: 9 }, { min: 6, max: 7 }],
};

/**
 * Recovers the distinct training-day count from block "name" strings
 * (stored as "DAY | BLOCK", per ProgramImportParser/MasterTemplateTransfer
 * convention). Blocks that don't follow that format fall back to being
 * counted as their own single day rather than throwing, since older or
 * hand-authored templates may not have the "DAY | BLOCK" prefix.
 */
export function deriveTrainingDaysPerWeek(blockNames: string[]): number {
  const days = new Set<string>();
  for (const name of blockNames) {
    const separatorIndex = name.indexOf('|');
    const day = separatorIndex === -1 ? name : name.slice(0, separatorIndex);
    days.add(day.trim());
  }
  return days.size;
}

/**
 * Returns 2-3 published library templates matching the user's tier and
 * goal, ranked (Recommended first). If a tier bracket hasn't been
 * published yet, that slot is simply skipped rather than backfilled with
 * an unrelated tier range.
 */
export async function getRecommendations(
  userTier: number,
  goal: string = 'strength'
): Promise<LibraryTemplateRecommendation[]> {
  const tierRanges = TIER_LOOKUP[userTier];
  if (!tierRanges) {
    console.error(`getRecommendations: no TIER_LOOKUP entry for tier ${userTier}`);
    return [];
  }

  const queries = tierRanges.map(async (range) => {
    const { data, error } = await supabase
      .from('program_templates')
      .select('id, name, description, equipment_tags, matching_criteria, is_free, cover_image_url, program_blocks(id, name, week_number)')
      .eq('is_library_template', true)
      .eq('status', 'published')
      .contains('matching_criteria', { goal, tier_range: range })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('getRecommendations: query failed for range', range, error);
      return null;
    }
    if (!data) return null;

    const blocks = Array.isArray((data as any).program_blocks) ? (data as any).program_blocks : [];
    // "Days per week" is read from week 1 only — a template can vary its
    // day count across later weeks (deload weeks, added days), so week 1
    // is the representative cadence shown on the recommendation card.
    const week1Blocks = blocks.filter((b: any) => (b.week_number || 1) === 1);
    const weekCount = new Set(blocks.map((b: any) => b.week_number || 1)).size;

    const recommendation: LibraryTemplateRecommendation = {
      id: data.id,
      template_name: data.name,
      description: data.description,
      tier_range: range,
      training_days_per_week: deriveTrainingDaysPerWeek(week1Blocks.map((b: any) => b.name)),
      week_count: weekCount,
      equipment_tags: Array.isArray(data.equipment_tags) ? data.equipment_tags : [],
      block_count: blocks.length,
      is_free: data.is_free === true,
      cover_image_url: data.cover_image_url ?? null,
    };
    return recommendation;
  });

  const results = await Promise.all(queries);
  return results.filter((r): r is LibraryTemplateRecommendation => r !== null);
}

/**
 * All published library templates, unfiltered by tier — the "Browse All"
 * counterpart to getRecommendations' tier-matched top picks. Small catalog
 * today (confirmed 8 templates), so no pagination — one query, one page.
 */
export async function getAllPublishedTemplates(): Promise<LibraryTemplateRecommendation[]> {
  const { data, error } = await supabase
    .from('program_templates')
    .select('id, name, description, equipment_tags, matching_criteria, is_free, cover_image_url, program_blocks(id, name, week_number)')
    .eq('is_library_template', true)
    .eq('status', 'published');

  if (error) {
    console.error('getAllPublishedTemplates: query failed', error);
    return [];
  }

  return (data ?? []).map((row: any) => {
    const blocks = Array.isArray(row.program_blocks) ? row.program_blocks : [];
    const week1Blocks = blocks.filter((b: any) => (b.week_number || 1) === 1);
    const weekCount = new Set(blocks.map((b: any) => b.week_number || 1)).size;
    const tierRange: TierRange = row.matching_criteria?.tier_range ?? { min: 0, max: 9 };

    return {
      id: row.id,
      template_name: row.name,
      description: row.description,
      tier_range: tierRange,
      training_days_per_week: deriveTrainingDaysPerWeek(week1Blocks.map((b: any) => b.name)),
      week_count: weekCount,
      equipment_tags: Array.isArray(row.equipment_tags) ? row.equipment_tags : [],
      block_count: blocks.length,
      is_free: row.is_free === true,
      cover_image_url: row.cover_image_url ?? null,
    };
  });
}

export interface TemplateDetailExercise {
  name: string;
  sets: number | null;
  reps: number | null;
  restSeconds: number | null;
}

export interface TemplateDetailBlock {
  day: string;
  blockName: string;
  exercises: TemplateDetailExercise[];
}

export interface TemplateDetailWeek {
  weekNumber: number;
  blocks: TemplateDetailBlock[];
}

/**
 * Full week-by-week, day-by-day exercise breakdown for a single published
 * library template, fetched lazily (only when a client expands "VIEW
 * DETAILS" on a recommendation card) rather than upfront for every card.
 */
export async function getTemplateDetails(templateId: string): Promise<TemplateDetailWeek[]> {
  const { data, error } = await supabase
    .from('program_blocks')
    .select(`
      name,
      order_index,
      week_number,
      block_exercises (
        sets, reps, rest_seconds, order_index,
        exercise_library ( name )
      )
    `)
    .eq('template_id', templateId)
    .order('week_number', { ascending: true })
    .order('order_index', { ascending: true });

  if (error) {
    console.error('getTemplateDetails: query failed', error);
    return [];
  }

  const weekMap = new Map<number, TemplateDetailBlock[]>();
  for (const block of (data || []) as any[]) {
    const weekNumber = block.week_number || 1;
    const separatorIndex = (block.name as string).indexOf('|');
    const day = separatorIndex === -1 ? block.name : block.name.slice(0, separatorIndex).trim();
    const blockName = separatorIndex === -1 ? '' : block.name.slice(separatorIndex + 1).trim();

    const exercises = (Array.isArray(block.block_exercises) ? block.block_exercises : [])
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((ex: any) => ({
        name: ex.exercise_library?.name || 'UNNAMED EXERCISE',
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.rest_seconds,
      }));

    if (!weekMap.has(weekNumber)) weekMap.set(weekNumber, []);
    weekMap.get(weekNumber)!.push({ day, blockName, exercises });
  }

  return Array.from(weekMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, blocks]) => ({ weekNumber, blocks }));
}

/**
 * Self-service clone of a published library template for the calling
 * user only (the select_library_template RPC always uses auth.uid() as
 * the warrior — it ignores any client-supplied id). Returns the new
 * cloned program_templates id, owned by the "Leap" house account.
 */
export async function selectLibraryTemplate(templateId: string): Promise<string> {
  const { data, error } = await supabase.rpc('select_library_template', { p_template_id: templateId });
  if (error) throw error;
  return data as string;
}
