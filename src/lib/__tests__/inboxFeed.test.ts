import { buildFeed, dateLabel, groupByMonth, itemRoute, NEEDS_YOU_CAP, timelineText, withBoldName } from '../inboxFeed';
import type { InboxItem, NotificationFields } from '../inbox';

const now = new Date('2026-11-19T12:00:00').getTime();
const at = (iso: string) => new Date(iso).toISOString();
const noFields: NotificationFields = { challengeName: null, byName: null, overtakenKind: null, boardName: null, tier: null, week: null, programName: null };

let seq = 0;
type Over = Omit<Partial<InboxItem>, 'fields'> & { fields?: Partial<NotificationFields> };
function item(over: Over = {}): InboxItem {
  seq += 1;
  const { fields, ...rest } = over;
  return {
    id: `n${seq}`, type: 'admin_message', kind: 'news', title: 'T', body: 'B', createdAt: at('2026-11-18T10:00:00'),
    unread: false, screen: null, params: {}, url: null, buttonLabel: null, imageUrl: null, popup: false, expiresAt: null,
    giftText: null, code: null, claimId: null, giftTier: null, giftDays: null, actedAt: null,
    ...rest,
    fields: { ...noFields, ...fields },
  };
}
const challenge = (over: Over = {}, name = 'Loop B2') =>
  item({ type: 'weekly_challenge_started', screen: 'weekly-challenge', fields: { challengeName: name }, ...over });
const week = (n: number, over: Partial<InboxItem> = {}) => item({ type: 'week_complete_nudge', screen: 'coach', fields: { week: n }, ...over });
const overtaken = (board: string, over: Partial<InboxItem> = {}) =>
  item({ type: 'leaderboard_overtaken', fields: { overtakenKind: 'score', boardName: board, byName: 'yahia' }, ...over });

describe('Needs you', () => {
  it('puts the unbuilt AI Coach week up front as the hero, newest only', () => {
    const w7 = week(7, { createdAt: at('2026-11-12T10:00:00') });
    const w6 = week(6, { createdAt: at('2026-11-05T10:00:00') });
    const feed = buildFeed([w6, w7], {}, { [w7.id]: false, [w6.id]: false }, now);
    expect(feed.hero?.item.id).toBe(w7.id);
    expect(feed.activity.map((i) => i.id)).toContain(w6.id);
  });

  it("follows the server's answer: a built week or an entered challenge is history", () => {
    const w = week(7);
    const c = challenge();
    const feed = buildFeed([w, c], {}, { [w.id]: true, [c.id]: true }, now);
    expect(feed.hero).toBeNull();
    expect(feed.cards).toHaveLength(0);
    expect(feed.activity).toHaveLength(2);
  });

  it('without a server answer: waiting while not tapped and under 7 days old', () => {
    const fresh = challenge({ createdAt: at('2026-11-14T10:00:00') });
    const tapped = challenge({ createdAt: at('2026-11-15T10:00:00'), actedAt: at('2026-11-15T11:00:00') }, 'X');
    const old = challenge({ createdAt: at('2026-11-07T10:00:00') }, 'Beasts');
    const feed = buildFeed([fresh, tapped, old], {}, {}, now);
    expect(feed.cards.map((e) => e.item.id)).toEqual([fresh.id]);
  });

  it('shows only the newest overtake per board', () => {
    const a = overtaken('Well-Rounded', { createdAt: at('2026-11-18T10:00:00') });
    const b = overtaken('Well-Rounded', { createdAt: at('2026-11-17T10:00:00') });
    const c = overtaken('1MM', { createdAt: at('2026-11-16T10:00:00') });
    const feed = buildFeed([a, b, c], {}, {}, now);
    expect(feed.cards.map((e) => e.item.id)).toEqual([a.id, c.id]);
    expect(feed.activity.map((i) => i.id)).toEqual([b.id]);
  });

  it(`caps the cards at ${NEEDS_YOU_CAP} with the hero, but never drops a gift to claim`, () => {
    const w = week(7);
    const items = [w, challenge(), overtaken('Well-Rounded'), overtaken('1MM'), overtaken('Power World')];
    const gift = item({ kind: 'gift', claimId: 'c1', giftTier: 'pro', giftDays: 7 });
    const claims = { c1: { id: 'c1', tier: 'pro', days: 7, claim_by: '2099-01-01T00:00:00Z', claimed_at: null } };
    const feed = buildFeed([...items, gift], claims, { [w.id]: false }, now);
    expect(feed.hero).not.toBeNull();
    expect(feed.cards[0].kind).toBe('gift');
    expect(feed.cards.filter((e) => e.kind !== 'gift')).toHaveLength(NEEDS_YOU_CAP - 1);
    expect(feed.activity).toHaveLength(2);
  });

  it('a claimed gift, a used code or plain news stays in the activity', () => {
    const gift = item({ kind: 'gift', claimId: 'c1' });
    const code = item({ kind: 'discount', code: 'MAX50', actedAt: at('2026-11-18T11:00:00') });
    const news = item();
    const claims = { c1: { id: 'c1', tier: 'pro', days: 7, claim_by: '2099-01-01T00:00:00Z', claimed_at: '2026-11-17T00:00:00Z' } };
    const feed = buildFeed([gift, code, news], claims, {}, now);
    expect(feed.cards).toHaveLength(0);
    expect(feed.activity).toHaveLength(3);
  });

  it('a fresh code waits up front until used', () => {
    const code = item({ kind: 'discount', code: 'MAX50' });
    expect(buildFeed([code], {}, {}, now).cards.map((e) => e.kind)).toEqual(['discount']);
  });
});

describe('activity', () => {
  it('groups by calendar month, newest first, with the year only when it is not this year', () => {
    const groups = groupByMonth([
      item({ createdAt: at('2026-11-07T10:00:00') }),
      item({ createdAt: at('2026-10-31T10:00:00') }),
      item({ createdAt: at('2025-12-20T10:00:00') }),
    ], now, 'en-US');
    expect(groups.map((g) => g.label)).toEqual(['November', 'October', 'December 2025']);
  });

  it('dates: weekday within 6 days, then day and month', () => {
    expect(dateLabel(at('2026-11-14T10:00:00'), now, 'en-US')).toBe('Sat');
    expect(dateLabel(at('2026-11-12T10:00:00'), now, 'en-GB')).toBe('12 Nov');
  });

  it('leads with the name, in bold', () => {
    expect(timelineText(challenge({}, 'Beasts')).line).toEqual([
      { text: 'Beasts', bold: true },
      { text: ' challenge started', bold: false },
    ]);
    expect(timelineText(week(6)).line).toEqual([
      { text: 'You finished ', bold: false },
      { text: 'Week 6', bold: true },
    ]);
    const time = item({ type: 'leaderboard_overtaken', fields: { overtakenKind: 'time', tier: 0, byName: 'Abdo2009' } });
    expect(timelineText(time).line.map((s) => s.text).join('')).toBe('Abdo2009 beat your time in Helot');
  });

  it('falls back to the title and text when the server could not read the names', () => {
    const old = item({ type: 'leaderboard_overtaken', title: "You've Been Overtaken!", body: 'Someone…' });
    expect(timelineText(old)).toEqual({ line: [{ text: "You've Been Overtaken!", bold: true }], sub: 'Someone…' });
  });

  it('keeps the sentence order of the language', () => {
    expect(withBoldName((name) => `before ${name} after`, 'X')).toEqual([
      { text: 'before ', bold: false }, { text: 'X', bold: true }, { text: ' after', bold: false },
    ]);
  });
});

describe('where each notification goes', () => {
  it('every type opens its screen', () => {
    expect(itemRoute(challenge())).toBe('/weekly-challenge');
    expect(itemRoute(item({ type: 'client_program_update', screen: 'warrior-program' }))).toBe('/warrior-program');
    expect(itemRoute(item({ type: 'program_review_ready', screen: 'warrior-program' }))).toBe('/warrior-program');
    expect(itemRoute(item({ type: 'leaderboard_overtaken', screen: 'one-min-max', fields: { overtakenKind: 'score', boardName: '1MM' } }))).toBe('/one-min-max');
    expect(itemRoute(item({ kind: 'discount', code: 'MAX50' }))).toBe('/redeem-code?code=MAX50');
    expect(itemRoute(item({ screen: 'weekly-challenge', params: { tab: 'team' } }))).toBe('/weekly-challenge?tab=team');
    expect(itemRoute(item({ kind: 'gift', claimId: 'c1' }))).toBeNull();
  });

  it('new overtakes keep the board they were sent with', () => {
    expect(itemRoute(item({ type: 'leaderboard_overtaken', screen: 'profile', params: { activeTab: 'profile', board: 'wra' } }))).toBe('/profile?activeTab=profile&board=wra');
    expect(itemRoute(item({ type: 'leaderboard_overtaken', screen: 'profile', params: { activeTab: 'strength', boardTier: '3' } }))).toBe('/profile?activeTab=strength&boardTier=3');
  });

  it('old overtakes that only said "profile" open their board from the saved names', () => {
    expect(itemRoute(item({ type: 'leaderboard_overtaken', screen: 'profile', fields: { overtakenKind: 'score', boardName: 'Well-Rounded' } }))).toBe('/profile?activeTab=profile&board=wra');
    expect(itemRoute(item({ type: 'leaderboard_overtaken', screen: 'profile', fields: { overtakenKind: 'time', tier: 0 } }))).toBe('/profile?activeTab=strength&boardTier=0');
  });
});
