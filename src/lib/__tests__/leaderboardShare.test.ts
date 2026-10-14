import {
  buildShareBoard, formatShareGap, formatShareScore, LB_COUNTDOWN_END, LB_LOCK, placeLand, podiumScoreSize, rankAt,
  scoreProgress, shareTitleSize, usernameInitials,
} from '../leaderboardShare';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ user_id: `u${i + 1}`, username: `user.${i + 1}`, score: 100 - i }));

describe('timeline', () => {
  it('lands 3rd, 2nd, then 1st on the lock', () => {
    expect(placeLand(2)).toBeCloseTo(1.2);
    expect(placeLand(1)).toBeCloseTo(1.45);
    expect(placeLand(0)).toBeCloseTo(LB_LOCK);
    expect(LB_LOCK).toBeCloseTo(1.7);
  });

  it('counts scores up and the rank down', () => {
    expect(scoreProgress(0, 0)).toBe(0);
    expect(scoreProgress(5, 0)).toBe(1);
    expect(rankAt(LB_LOCK, 14, 238, true)).toBe(238);
    expect(rankAt(LB_COUNTDOWN_END, 14, 238, true)).toBe(14);
    expect(rankAt(0, 14, 238, false)).toBe(14);
  });
});

describe('usernameInitials', () => {
  it('follows the handoff rule', () => {
    expect(usernameInitials('kaito.moves')).toBe('KM');
    expect(usernameInitials('zeyad_pulls')).toBe('ZP');
    expect(usernameInitials('theo')).toBe('TH');
    expect(usernameInitials('')).toBe('?');
  });
});

describe('buildShareBoard', () => {
  it('ranks the sharer within the board as shown', () => {
    const b = buildShareBoard(rows(238), 'u14', 'me');
    expect(b.top3.map(p => p.username)).toEqual(['user.1', 'user.2', 'user.3']);
    expect(b.you).toEqual({ rank: 14, username: 'user.14', score: 87, gap: 13 });
    expect(b.total).toBe(238);
    expect(b.countdown).toBe(true);
  });

  it('marks a podium sharer and skips the countdown', () => {
    const b = buildShareBoard(rows(10), 'u2', 'me');
    expect(b.top3[1].isYou).toBe(true);
    expect(b.countdown).toBe(false);
  });

  it('skips the countdown when last', () => {
    expect(buildShareBoard(rows(5), 'u5', 'me').countdown).toBe(false);
  });

  it('handles a sharer who is not on the board', () => {
    const b = buildShareBoard(rows(2), 'zz', 'ahmed.leaps');
    expect(b.top3).toHaveLength(2);
    expect(b.you).toEqual({ rank: null, username: 'ahmed.leaps', score: null, gap: 0 });
  });

  it('measures a time gap the same way (lower is better)', () => {
    const b = buildShareBoard([
      { user_id: 'a', username: 'a', score: 118 },
      { user_id: 'b', username: 'b', score: 134 },
    ], 'b', 'b');
    expect(b.you.gap).toBe(16);
  });
});

describe('formatting', () => {
  it('formats scores per type', () => {
    expect(formatShareScore(134, 'time')).toBe('2:14');
    expect(formatShareScore(5530, 'time')).toBe('1:32:10');
    expect(formatShareScore(1240, 'reps')).toBe('1,240');
    expect(formatShareScore(1204.75, 'points')).toBe('1,204.75');
    // Team times keep their tenths; whole seconds stay as they were.
    expect(formatShareScore(245.3, 'time')).toBe('4:05.3');
    expect(formatShareScore(245, 'time')).toBe('4:05');
  });

  it('uses the boards\' gap convention', () => {
    expect(formatShareGap(16, 'time')).toBe('+0:16');
    expect(formatShareGap(44, 'reps')).toBe('−44');
    expect(formatShareGap(86.12, 'points')).toBe('−86.12');
  });

  it('steps sizes', () => {
    expect(shareTitleSize('STRATEGOS')).toBe(30);
    expect(shareTitleSize('THE ULTIMATE THIRTY DAY MUSCLE-UP ENDURANCE LADDER')).toBe(22);
    expect(podiumScoreSize('1,204.75', true)).toBe(15);
    expect(podiumScoreSize('186', false)).toBe(15);
  });
});
