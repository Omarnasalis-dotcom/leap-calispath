import { deriveStanding, youBarSubline, initials, fmt2 } from '../worldStanding';
import { parseWorldSummary } from '../../services/WorldSummaryService';
import { getCountryCode } from '../../constants/countries';

describe('deriveStanding', () => {
  it('new user: nothing filled, not ranked', () => {
    const s = deriveStanding({ rank: null, rankedCount: 40, score: 0, topScore: 180, above: { rank: 40, score: 3, name: 'x' } });
    expect(s).toMatchObject({ isRanked: false, isKing: false, rankProgress: 0, topProgress: 0, gapProgress: 0 });
  });

  it('ranked: gap is the amount to PASS (+0.01), rings are real ratios', () => {
    const s = deriveStanding({ rank: 5, rankedCount: 21, score: 107.5, topScore: 183, above: { rank: 4, score: 120, name: '@sara.m' } });
    expect(s.isRanked).toBe(true);
    expect(s.isKing).toBe(false);
    expect(s.gapToPass).toBe(12.51);
    expect(s.gapProgress).toBeCloseTo(107.5 / 120);
    expect(s.rankProgress).toBeCloseTo(1 - 4 / 21);
    expect(s.topProgress).toBeCloseTo(107.5 / 183);
  });

  it('king: gap ring full, no gap, rank ring full', () => {
    const s = deriveStanding({ rank: 1, rankedCount: 21, score: 200, topScore: 200, above: null });
    expect(s).toMatchObject({ isKing: true, gapToPass: null, gapProgress: 1, rankProgress: 1, topProgress: 1 });
  });

  it('tied at #1 is still king', () => {
    expect(deriveStanding({ rank: 1, rankedCount: 3, score: 100, topScore: 100, above: null }).isKing).toBe(true);
  });
});

describe('youBarSubline', () => {
  const list = [
    { user_id: 'a', name: '@alpha', points: 150 },
    { user_id: 'me', name: '@me', points: 120 },
  ];
  it('pts to pass the row above in the visible list', () => {
    expect(youBarSubline(list, 'me', 120, 'Endurance')).toEqual({ index: 1, text: '30.01 pts to pass @alpha' });
  });
  it('king', () => {
    expect(youBarSubline(list.slice(1), 'me', 120, 'Static').text).toBe('Static King · hold the top spot');
  });
  it('filtered out vs never logged', () => {
    expect(youBarSubline(list.slice(0, 1), 'me', 120, 'X').text).toBe('Not in this filter');
    expect(youBarSubline([], 'me', 0, 'X').text).toBe('Log a set to join the board');
  });
});

describe('helpers', () => {
  it('initials', () => {
    expect(initials('@omar.nasser')).toBe('ON');
    expect(initials('Leap')).toBe('LE');
    expect(initials('')).toBe('?');
  });
  it('fmt2 guards NaN', () => {
    expect(fmt2(NaN)).toBe('0.00');
    expect(fmt2(12.345)).toBe('12.35');
  });
  it('getCountryCode decodes flags', () => {
    expect(getCountryCode('Saudi Arabia')).toBe('SA');
    expect(getCountryCode('United Kingdom')).toBe('GB');
    expect(getCountryCode('Atlantis')).toBe('');
    expect(getCountryCode(null)).toBe('');
  });
});

describe('parseWorldSummary', () => {
  it('normalises string numerics and nulls', () => {
    const s = parseWorldSummary({
      ranked_count: 4, top_score: '50', my_score: '15', my_rank: 3,
      above: { rank: 2, score: '20', name: 'Charlie' },
      movement_bests: { wall_handstand: '100' },
    });
    expect(s).toEqual({
      rankedCount: 4, topScore: 50, myScore: 15, myRank: 3,
      above: { rank: 2, score: 20, name: 'Charlie' },
      movementBests: { wall_handstand: 100 },
    });
    expect(parseWorldSummary({ my_rank: null, above: null }).myRank).toBeNull();
  });
});
