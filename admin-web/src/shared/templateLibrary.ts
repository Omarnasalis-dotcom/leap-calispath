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
