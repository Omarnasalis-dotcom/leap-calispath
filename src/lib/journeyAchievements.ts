/**
 * Journey achievements (docs/features/JOURNEY_ACHIEVEMENTS_PLAN.md). The
 * server's journey_levels table is the source of truth for thresholds; this
 * mirrors it for the UI (names come from i18n by key).
 */

export type AchievementLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface AchievementDef {
  level: Exclude<AchievementLevel, 0>;
  key: 'rising' | 'consistent' | 'committed' | 'determined' | 'warrior' | 'champion' | 'elite' | 'legend';
  threshold: number;
  /** Card border, glow, ring, progress bar and "TO NEXT" label colour. */
  tone: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { level: 1, key: 'rising', threshold: 100, tone: '#A3AAB2' },
  { level: 2, key: 'consistent', threshold: 300, tone: '#7FC0D8' },
  { level: 3, key: 'committed', threshold: 750, tone: '#E3A774' },
  { level: 4, key: 'determined', threshold: 1500, tone: '#FF8A4C' },
  { level: 5, key: 'warrior', threshold: 3000, tone: '#F0524A' },
  { level: 6, key: 'champion', threshold: 5000, tone: '#FFD36B' },
  { level: 7, key: 'elite', threshold: 8000, tone: '#A98BFF' },
  { level: 8, key: 'legend', threshold: 12000, tone: '#FF7BB0' },
];

/** World colours (Static, Power, Endurance). */
export const WORLD_COLORS = { static: '#8E6BFF', power: '#FF4A3D', endurance: '#FF6B2C' } as const;

export function achievementFor(level: number): AchievementDef | undefined {
  return ACHIEVEMENTS.find(a => a.level === level);
}

/** Highest level a lifetime total has reached (0 = none yet). */
export function levelForPoints(lifetime: number): AchievementLevel {
  let lvl = 0;
  for (const a of ACHIEVEMENTS) if (lifetime >= a.threshold) lvl = a.level;
  return lvl as AchievementLevel;
}
