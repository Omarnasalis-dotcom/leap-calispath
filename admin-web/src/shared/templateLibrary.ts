// Workout Templates Library — shared types + day-count helper.
// Trimmed mirror of src/lib/templateLibrary.ts: the warrior-facing
// recommendation engine (TIER_LOOKUP/getRecommendations/getTemplateDetails/
// selectLibraryTemplate) isn't needed for the coach admin panel — only the
// shape publish/import validation depends on. Keep TierRange/MatchingCriteria
// and deriveTrainingDaysPerWeek in sync with the mobile file if it changes.

export interface TierRange {
  min: number;
  max: number;
}

export interface MatchingCriteria {
  goal: string;
  tier_range: TierRange;
}

/** The goals the app asks for (ProgramTemplatesScreen always passes
 * 'strength'). A template with any other goal is never recommended. */
export const LIBRARY_GOALS = [{ value: 'strength', label: 'Strength' }] as const;

/** Every tier range in the app's TIER_LOOKUP (src/lib/templateLibrary.ts).
 * Recommendations match a range exactly, so a range not on this list
 * (e.g. 3–6) is never shown. Keep in sync with the app. */
export const LIBRARY_TIER_RANGES: TierRange[] = [
  { min: 0, max: 1 },
  { min: 1, max: 2 },
  { min: 2, max: 3 },
  { min: 3, max: 4 },
  { min: 4, max: 5 },
  { min: 5, max: 6 },
  { min: 6, max: 7 },
  { min: 7, max: 9 },
];

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
