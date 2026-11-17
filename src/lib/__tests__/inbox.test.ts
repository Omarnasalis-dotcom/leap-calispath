import { giftState, isExpired, isGroupOn, pickPromptItem, routeFor, toInboxItem, visibleItems, withGroup, type GiftClaim, type InboxRow } from '../inbox';

const NOW = new Date('2026-11-17T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function row(over: Partial<InboxRow> = {}): InboxRow {
  return { id: 'n1', title: 'Title', body: 'Body', data: { kind: 'news' }, read_at: null, created_at: new Date(NOW - DAY).toISOString(), ...over };
}

describe('toInboxItem', () => {
  it('reads a news message and keeps an allowed screen', () => {
    const item = toInboxItem(row({ data: { kind: 'news', screen: 'weekly-challenge' } }));
    expect(item).toMatchObject({ kind: 'news', screen: 'weekly-challenge', unread: true, code: null, claimId: null });
  });

  it('drops a screen that is not on the allowed list', () => {
    expect(toInboxItem(row({ data: { kind: 'news', screen: 'admin-tournament' } })).screen).toBeNull();
  });

  it('treats an unknown or missing kind as news', () => {
    expect(toInboxItem(row({ data: { kind: 'something' } })).kind).toBe('news');
    expect(toInboxItem(row({ data: null })).kind).toBe('news');
  });

  it('reads a discount code', () => {
    const item = toInboxItem(row({ data: { kind: 'discount', code: 'LEAP30', screen: 'redeem-code' } }));
    expect(item).toMatchObject({ kind: 'discount', code: 'LEAP30', screen: null });
  });

  it('reads a gift, with days as a number or a string', () => {
    const asNumber = toInboxItem(row({ data: { kind: 'gift', claim_id: 'c1', gift_tier: 'pro', gift_days: 14 } }));
    expect(asNumber).toMatchObject({ kind: 'gift', claimId: 'c1', giftTier: 'pro', giftDays: 14 });
    expect(toInboxItem(row({ data: { kind: 'gift', claim_id: 'c1', gift_tier: 'gold', gift_days: '7' } }))).toMatchObject({ giftTier: null, giftDays: 7 });
  });

  it('marks a read row as not unread', () => {
    expect(toInboxItem(row({ read_at: '2026-11-17T00:00:00Z' })).unread).toBe(false);
  });
});

describe('message extras (usable later without an app release)', () => {
  it('reads a link, button text, picture and params', () => {
    const item = toInboxItem(row({ data: {
      kind: 'news', screen: 'weekly-challenge', params: { tab: 'team', week: 3, x: { nested: true } },
      url: 'https://example.com/a', button: 'JOIN', image_url: 'https://example.com/a.jpg',
    } }));
    expect(item).toMatchObject({ url: 'https://example.com/a', buttonLabel: 'JOIN', imageUrl: 'https://example.com/a.jpg', params: { tab: 'team', week: '3' } });
    expect(routeFor(item)).toBe('/weekly-challenge?tab=team&week=3');
  });

  it('only accepts https links and pictures', () => {
    const item = toInboxItem(row({ data: { kind: 'news', url: 'http://example.com', image_url: 'javascript:alert(1)' } }));
    expect(item.url).toBeNull();
    expect(item.imageUrl).toBeNull();
  });

  it('has no route without a screen', () => {
    expect(routeFor(toInboxItem(row({ data: { kind: 'news', params: { a: 'b' } } })))).toBeNull();
  });

  it('allows the newer destination screens', () => {
    for (const screen of ['my-progress', 'static-world', 'power-world', 'program-templates', 'notification-settings']) {
      expect(toInboxItem(row({ data: { kind: 'news', screen } })).screen).toBe(screen);
    }
  });

  it('hides an expired message and keeps the rest', () => {
    const live = toInboxItem(row({ id: 'live', data: { kind: 'news', expires_at: new Date(NOW + DAY).toISOString() } }));
    const gone = toInboxItem(row({ id: 'gone', data: { kind: 'news', expires_at: new Date(NOW - DAY).toISOString() } }));
    const plain = toInboxItem(row({ id: 'plain' }));
    expect(isExpired(gone, NOW)).toBe(true);
    expect(visibleItems([live, gone, plain], NOW).map((i) => i.id)).toEqual(['live', 'plain']);
  });

  it('reads a gift with its own text', () => {
    expect(toInboxItem(row({ data: { kind: 'gift', claim_id: 'c1', gift_text: '50 Journey points' } })).giftText).toBe('50 Journey points');
  });
});

describe('giftState', () => {
  const claim: GiftClaim = { id: 'c1', tier: 'pro', days: 14, claim_by: new Date(NOW + DAY).toISOString(), claimed_at: null };

  it('is claimable before the deadline', () => expect(giftState(claim, NOW)).toBe('claimable'));
  it('is expired after the deadline', () => expect(giftState(claim, NOW + 2 * DAY)).toBe('expired'));
  it('is claimed once claimed, even after the deadline', () =>
    expect(giftState({ ...claim, claimed_at: new Date(NOW).toISOString() }, NOW + 2 * DAY)).toBe('claimed'));
  it('is unknown when the claim was not loaded', () => expect(giftState(undefined, NOW)).toBe('unknown'));
});

describe('pickPromptItem', () => {
  it('picks the newest unread recent message', () => {
    const items = [
      toInboxItem(row({ id: 'old', created_at: new Date(NOW - 3 * DAY).toISOString() })),
      toInboxItem(row({ id: 'new', created_at: new Date(NOW - DAY).toISOString() })),
      toInboxItem(row({ id: 'read', read_at: 'x', created_at: new Date(NOW).toISOString() })),
    ];
    expect(pickPromptItem(items, NOW)?.id).toBe('new');
  });

  it('ignores unread messages older than 14 days', () => {
    expect(pickPromptItem([toInboxItem(row({ created_at: new Date(NOW - 15 * DAY).toISOString() }))], NOW)).toBeNull();
  });

  it('skips inbox-only, expired and already-shown messages', () => {
    const quiet = toInboxItem(row({ id: 'quiet', data: { kind: 'news', popup: false } }));
    const gone = toInboxItem(row({ id: 'gone', data: { kind: 'news', expires_at: new Date(NOW - 1000).toISOString() } }));
    const shown = toInboxItem(row({ id: 'shown' }));
    const next = toInboxItem(row({ id: 'next', created_at: new Date(NOW - 2 * DAY).toISOString() }));
    expect(pickPromptItem([quiet, gone, shown, next], NOW, new Set(['shown']))?.id).toBe('next');
    expect(pickPromptItem([quiet, gone], NOW)).toBeNull();
  });

  it('returns null with nothing unread', () => {
    expect(pickPromptItem([toInboxItem(row({ read_at: 'x' }))], NOW)).toBeNull();
  });
});

describe('notification switches', () => {
  it('is on by default', () => {
    expect(isGroupOn(null, 'news')).toBe(true);
    expect(isGroupOn({}, 'challenges')).toBe(true);
  });

  it('is off only when every key of the group is off', () => {
    expect(isGroupOn({ admin_message: false }, 'news')).toBe(false);
    expect(isGroupOn({ admin_message: 'false' }, 'news')).toBe(false);
    expect(isGroupOn({ weekly_challenge_started: false }, 'challenges')).toBe(true);
  });

  it('switches every key of a group and keeps the others', () => {
    const next = withGroup({ daily_reminder: false }, 'challenges', false);
    expect(next).toEqual({ daily_reminder: false, weekly_challenge_started: false, weekly_challenge_ending: false, leaderboard_overtaken: false });
    expect(isGroupOn(next, 'challenges')).toBe(false);
    expect(isGroupOn(withGroup(next, 'challenges', true), 'challenges')).toBe(true);
  });
});
