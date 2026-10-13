import {
  cardGlow, completionCount, completionPct, formatSessionDuration, fuseProgress, programNameSize, ringGeometry,
  segmentLand, segmentProgress, statValueSize, WC_C, wcTimeline,
} from '../workoutComplete';

describe('wcTimeline', () => {
  it('scales the hero by block count (handoff examples)', () => {
    expect(wcTimeline(1, true).lock).toBeCloseTo(2.0);
    expect(wcTimeline(5, true).lock).toBeCloseTo(2.425);
    expect(wcTimeline(8, true).lock).toBeCloseTo(2.8);
    expect(wcTimeline(8, true).segDur).toBeCloseTo(0.385);
  });

  it('lands the last segment exactly on the lock', () => {
    for (const n of [1, 2, 5, 8]) {
      const tl = wcTimeline(n, false);
      expect(segmentLand(n - 1, tl)).toBeCloseTo(tl.lock);
    }
  });

  it('only adds the fuse beat at 100%', () => {
    const full = wcTimeline(5, true);
    const partial = wcTimeline(5, false);
    expect(full.fuse).toBeCloseTo(full.lock + 0.35);
    expect(full.c0).toBe(full.fuse);
    expect(partial.fuse).toBe(partial.lock);
    expect(fuseProgress(partial.lock + 1, partial)).toBe(0);
    expect(fuseProgress(full.fuse, full)).toBe(1);
  });
});

describe('ringGeometry', () => {
  it('has no gap for one block', () => {
    const g = ringGeometry(1);
    expect(g.gapLen).toBe(0);
    expect(g.segLen).toBeCloseTo(WC_C);
  });

  it('caps gaps at 8° and fills the circle', () => {
    const g = ringGeometry(5);
    expect(g.gapLen).toBeCloseTo((8 / 360) * WC_C);
    expect(5 * (g.segLen + g.gapLen)).toBeCloseTo(WC_C);
    expect(g.starts[0]).toBeCloseTo(g.gapLen / 2);
    expect(ringGeometry(8).gapLen).toBeCloseTo((5.4 / 360) * WC_C);
  });
});

describe('completionCount', () => {
  it('holds across missed segments and lands on the percent', () => {
    const tl = wcTimeline(5, false);
    const completed = [0, 2, 4];
    expect(completionCount(0, 60, completed, 5, tl)).toBe(0);
    // Segment 0 landed, segment 2 not started yet (1 is missed): 1/3 of 60.
    expect(completionCount(segmentLand(0, tl), 60, completed, 5, tl)).toBe(20);
    expect(completionCount(tl.lock, 60, completed, 5, tl)).toBe(60);
  });

  it('stays 0 with nothing completed', () => {
    expect(completionCount(10, 0, [], 5, wcTimeline(5, false))).toBe(0);
  });

  it('sweeps a single block smoothly', () => {
    const tl = wcTimeline(1, true);
    expect(segmentProgress(0.6 + tl.segDur / 2, 0, 1, tl)).toBeCloseTo(0.5);
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatSessionDuration(2892)).toBe('48:12');
    expect(formatSessionDuration(5530)).toBe('1:32:10');
    expect(formatSessionDuration(5)).toBe('0:05');
  });

  it('steps the program name size', () => {
    expect(programNameSize('PULL-UP MASTERY')).toBe(30);
    expect(programNameSize('A'.repeat(30))).toBe(26);
    expect(programNameSize('ADVANCED STREET WORKOUT FOUNDATIONS PROGRAM')).toBe(22);
  });

  it('steps the stat value size for long values', () => {
    expect(statValueSize('48:12')).toBe(26);
    expect(statValueSize('12,840')).toBe(26);
    expect(statValueSize('1:32:10')).toBe(22);
  });

  it('rounds the completion percent', () => {
    expect(completionPct(3, 5)).toBe(60);
    expect(completionPct(0, 0)).toBe(0);
  });
});

describe('cardGlow', () => {
  it('settles per outcome', () => {
    const full = wcTimeline(5, true);
    const partial = wcTimeline(5, false);
    expect(cardGlow(full.end + 5, full, 1, true, false)).toBeCloseTo(0.3);
    expect(cardGlow(partial.end + 5, partial, 1, false, false)).toBeCloseTo(0.22);
    expect(cardGlow(partial.end + 5, partial, 0, false, true)).toBeCloseTo(0.12);
  });
});
