import { AFTER, cardShake, celebrationFrom, celebrationTimeline, HERO_GLOW_PEAK, LOCK_BY_LEVEL } from '../journeyCelebration';
import { achievementFor } from '../journeyAchievements';
import { JourneyAchievementState, PointsEntry } from '../journeyPoints';

const thresholdOf = (l: number) => achievementFor(l)?.threshold ?? 0;
const award = (points: number): PointsEntry => ({ date: '2026-10-14', source: 'program_day', label: 'Push', points });

function state(over: Partial<JourneyAchievementState> = {}): JourneyAchievementState {
  return {
    level: 3, lifetime: 1145, current_threshold: 750, next_level: 4, next_threshold: 1500,
    pending: { level: 3, previous_level: 0, skipped: [1, 2] },
    ...over,
  };
}

describe('celebrationTimeline', () => {
  it('uses the handoff lock times and ends 1.5 s after the lock', () => {
    expect(celebrationTimeline(1)).toEqual({ lock: 1.3, end: 2.8 });
    expect(celebrationTimeline(8).end).toBeCloseTo(3.9);
    expect(Object.keys(LOCK_BY_LEVEL)).toHaveLength(8);
    expect(AFTER.countTo).toBeGreaterThan(AFTER.countFrom);
  });
});

describe('per-level effects', () => {
  it('shakes the card only for WARRIOR, only right after the lock', () => {
    expect(cardShake(1.7, 4, 1.65)).toBe(0);
    expect(cardShake(1.6, 5, 1.65)).toBe(0);
    expect(Math.abs(cardShake(1.67, 5, 1.65))).toBeGreaterThan(0);
    expect(cardShake(2.2, 5, 1.65)).toBe(0);
  });

  it('escalates the glow peak', () => {
    const peaks = [1, 2, 3, 4, 5, 6, 7, 8].map(l => HERO_GLOW_PEAK[l]);
    peaks.forEach((p, i) => { if (i) expect(p).toBeGreaterThanOrEqual(peaks[i - 1]); });
  });
});

describe('celebrationFrom', () => {
  it('returns nothing without a pending level', () => {
    expect(celebrationFrom(undefined, [], thresholdOf)).toBeNull();
    expect(celebrationFrom(state({ pending: null }), [], thresholdOf)).toBeNull();
  });

  it('counts up from before this call when the badge was just earned', () => {
    const d = celebrationFrom(state(), [award(50), award(20)], thresholdOf)!;
    expect(d).toEqual({ level: 3, previousLevel: 0, skipped: [1, 2], fromPoints: 1075, toPoints: 1145, nextThreshold: 1500 });
  });

  it('counts up from the badge threshold for a celebration that was waiting', () => {
    expect(celebrationFrom(state(), [], thresholdOf)!.fromPoints).toBe(750);
  });

  it('has no next badge at LEGEND', () => {
    const d = celebrationFrom(state({ level: 8, lifetime: 12160, next_level: null, next_threshold: null, pending: { level: 8, previous_level: 7, skipped: [] } }), [], thresholdOf)!;
    expect(d.nextThreshold).toBeNull();
    expect(d.fromPoints).toBe(12000);
  });
});
