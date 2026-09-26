import { cardStats, climbPercent, fmtTime, tierCaption, tierStatus, warriorsLabel } from '../strengthClimb';

const board = [
  { user_id: 'a', best_time_seconds: 160 },
  { user_id: 'b', best_time_seconds: 167 },
  { user_id: 'me', best_time_seconds: 185 },
];

describe('strengthClimb', () => {
  it('formats times as M\'SS"', () => {
    expect(fmtTime(160)).toBe(`2'40"`);
    expect(fmtTime(5)).toBe(`0'05"`);
    expect(fmtTime(59.6)).toBe(`1'00"`);
  });

  it('tier status relative to the current tier', () => {
    expect(tierStatus(1, 2)).toBe('complete');
    expect(tierStatus(2, 2)).toBe('current');
    expect(tierStatus(3, 2)).toBe('locked');
  });

  it('captions never invent a percentage', () => {
    expect(tierCaption(2, 2)).toBe('Pass the trial to reach Hoplite');
    expect(tierCaption(1, 2)).toBe('Tier complete');
    expect(tierCaption(5, 2)).toBe('Complete Spartan to unlock');
    expect(tierCaption(9, 9)).toBe('The final trial');
  });

  it('climb percent is tiers behind you out of 9', () => {
    expect(climbPercent(0)).toBe(0);
    expect(climbPercent(2)).toBe(22);
    expect(climbPercent(9)).toBe(100);
  });

  it('card stats: ranked, king, unranked, empty, locked', () => {
    expect(cardStats(board, 'me', 'current')).toEqual({ rank: '#3', rankOf: 'of 3', gap: `+0'25"`, ranked: true, king: false });
    expect(cardStats(board, 'a', 'complete')).toMatchObject({ rank: '#1', gap: 'KING', king: true });
    expect(cardStats(board, 'x', 'current')).toMatchObject({ rank: '—', rankOf: 'unranked · 3', gap: '—', ranked: false });
    expect(cardStats(board, 'x', 'locked').rankOf).toBe('of 3');
    expect(cardStats([], 'x', 'locked').rankOf).toBe('no entries yet');
  });

  it('warriors label singular/plural', () => {
    expect(warriorsLabel(1)).toBe('1 WARRIOR');
    expect(warriorsLabel(0)).toBe('0 WARRIORS');
  });
});
