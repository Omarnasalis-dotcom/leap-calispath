import { formatLeaderboardTime, getOrdinalRank } from '../leaderboard';

describe('formatLeaderboardTime', () => {
  it('should return seconds only when under 60', () => {
    expect(formatLeaderboardTime(45)).toBe('45s');
    expect(formatLeaderboardTime(0)).toBe('0s');
    expect(formatLeaderboardTime(59)).toBe('59s');
  });

  it('should return mm:ss format when 60 seconds or more', () => {
    expect(formatLeaderboardTime(60)).toBe('1:00');
    expect(formatLeaderboardTime(90)).toBe('1:30');
    expect(formatLeaderboardTime(3600)).toBe('60:00');
  });

  it('should pad seconds with leading zero', () => {
    expect(formatLeaderboardTime(61)).toBe('1:01');
    expect(formatLeaderboardTime(609)).toBe('10:09');
  });
});

describe('getOrdinalRank', () => {
  it('should return st for 1', () => {
    expect(getOrdinalRank(1)).toBe('1st');
  });

  it('should return nd for 2', () => {
    expect(getOrdinalRank(2)).toBe('2nd');
  });

  it('should return rd for 3', () => {
    expect(getOrdinalRank(3)).toBe('3rd');
  });

  it('should return th for 4 to 20', () => {
    expect(getOrdinalRank(4)).toBe('4th');
    expect(getOrdinalRank(11)).toBe('11th');
    expect(getOrdinalRank(12)).toBe('12th');
    expect(getOrdinalRank(13)).toBe('13th');
  });

  it('should handle 21st, 22nd, 23rd correctly', () => {
    expect(getOrdinalRank(21)).toBe('21st');
    expect(getOrdinalRank(22)).toBe('22nd');
    expect(getOrdinalRank(23)).toBe('23rd');
  });

  it('should handle 100th correctly', () => {
    expect(getOrdinalRank(100)).toBe('100th');
  });
});
