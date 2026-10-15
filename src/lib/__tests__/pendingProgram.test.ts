import { parsePendingProgram, pendingAutoCreates, pendingExpired } from '../pendingProgram';

const now = 1_000_000_000_000;
const stash = (minutesAgo: number) => JSON.stringify({ ids: ['a', 'b'], at: now - minutesAgo * 60_000 });

describe('pending custom program stash', () => {
  it('auto-creates only straight after buying', () => {
    expect(pendingAutoCreates(parsePendingProgram(stash(5), now)!)).toBe(true);
    expect(pendingAutoCreates(parsePendingProgram(stash(45), now)!)).toBe(false);
  });
  it('drops a stash older than a day', () => {
    expect(pendingExpired(parsePendingProgram(stash(60 * 23), now)!)).toBe(false);
    expect(pendingExpired(parsePendingProgram(stash(60 * 25), now)!)).toBe(true);
  });
  it('treats an old bare-array stash as stale: restored for review, never auto-created', () => {
    const p = parsePendingProgram(JSON.stringify(['a']), now)!;
    expect(p.ids).toEqual(['a']);
    expect(pendingAutoCreates(p)).toBe(false);
    expect(pendingExpired(p)).toBe(false);
  });
  it('ignores garbage', () => {
    expect(parsePendingProgram('not json', now)).toBeNull();
    expect(parsePendingProgram(JSON.stringify({ ids: ['a'] }), now)).toBeNull();
  });
});
