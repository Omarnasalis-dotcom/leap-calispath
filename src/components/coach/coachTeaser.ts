// Design handoff FAB open panel — `coachLine` + `prompts`. Deliberately
// NOT LLM-generated: this is seen on every Profile visit and needs to feel
// instant, so it's a small pure function over data already on the profile
// (statics_tier/power_points/one_mm_points — same real columns
// attach_stat_bars reads server-side, see supabase/functions/ai-coach/
// tools/attachStatBars.ts), not a Claude call.
import { t, isArabic } from '../../i18n';
export interface CoachTeaser {
  line: string;
  prompts: string[];
}

type Discipline = 'static' | 'power' | 'one_min_max';
const LABELS: Record<Discipline, string> = { static: t('coachFab.static'), power: t('coachFab.power'), one_min_max: '1MM' };
const PROMPTS: Record<Discipline, string[]> = {
  static: [t('coachFab.startStatic'), t('coachFab.whyGap'), t('coachFab.scale')],
  power: [t('coachFab.startPower'), t('coachFab.whyGap'), t('coachFab.scale')],
  one_min_max: [t('coachFab.start1mm'), t('coachFab.whyGap'), t('coachFab.scale')],
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
  const others = entries.filter(([k]) => k !== weakestKey).map(([k, v]) => `${v.toFixed(2)} ${LABELS[k]}`).join(isArabic ? '، ' : ', ');
  const zeroPhrase = weakestValue === 0 ? t('coachFab.onlyZero') : t('coachFab.lagging');

  return {
    line: t('coachFab.line', { weak: LABELS[weakestKey], phrase: zeroPhrase, others, value: weakestValue.toFixed(2) }),
    prompts: PROMPTS[weakestKey],
  };
}
