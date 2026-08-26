// Design handoff FAB open panel — `coachLine` + `prompts`. Deliberately
// NOT LLM-generated: this is seen on every Profile visit and needs to feel
// instant, so it's a small pure function over data already on the profile
// (statics_tier/power_points/one_mm_points — same real columns
// attach_stat_bars reads server-side, see supabase/functions/ai-coach/
// tools/attachStatBars.ts), not a Claude call.
export interface CoachTeaser {
  line: string;
  prompts: string[];
}

type Discipline = 'static' | 'power' | 'one_min_max';
const LABELS: Record<Discipline, string> = { static: 'Static', power: 'Power', one_min_max: '1MM' };
const PROMPTS: Record<Discipline, string[]> = {
  static: ['START STATIC', 'WHY THIS GAP?', 'SCALE FOR ME'],
  power: ['START POWER', 'WHY THIS GAP?', 'SCALE FOR ME'],
  one_min_max: ['START 1MM', 'WHY THIS GAP?', 'SCALE FOR ME'],
};

export function computeCoachTeaser(profile: {
  statics_tier?: number | null;
  power_points?: number | null;
  one_mm_points?: number | null;
} | null | undefined): CoachTeaser | null {
  if (!profile) return null;
  const values: Record<Discipline, number> = {
    static: Number(profile.statics_tier ?? 0),
    power: Number(profile.power_points ?? 0),
    one_min_max: Number(profile.one_mm_points ?? 0),
  };
  const entries = Object.entries(values) as Array<[Discipline, number]>;
  if (entries.every(([, v]) => v === 0)) return null; // nothing to compare yet

  const [weakestKey, weakestValue] = entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min));
  const others = entries.filter(([k]) => k !== weakestKey).map(([k, v]) => `${v.toFixed(2)} ${LABELS[k]}`).join(', ');
  const zeroPhrase = weakestValue === 0 ? 'your only zero' : 'lagging behind the other two';

  return {
    line: `${LABELS[weakestKey]} is ${zeroPhrase} — ${others}, ${weakestValue.toFixed(2)} ${LABELS[weakestKey]}. Clear one ${LABELS[weakestKey]} entry this week and you'll be building real balance.`,
    prompts: PROMPTS[weakestKey],
  };
}
