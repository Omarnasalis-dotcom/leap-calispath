import { isUsageNotice } from '../../../supabase/functions/ai-coach/tools/usageNotices';
import {
  CoachUsage,
  coachUsageText,
  nextDayReset,
  nextWeekReset,
  parseCoachUsage,
  rateLimitBannerCopy,
  rateLimitCopy,
} from '../coachUsage';

const raw = (over: Record<string, unknown> = {}) => ({
  tier: 'pro',
  window: 'day',
  messages_left: 7,
  messages_limit: 10,
  resets_at: '2026-11-07T00:00:00+00:00',
  budget_left_pct: 72,
  budget_until: '2026-12-01T10:00:00+00:00',
  ...over,
});
const usage = (over: Record<string, unknown> = {}) => parseCoachUsage(raw(over)) as CoachUsage;
const FUTURE = new Date(Date.now() + 10 * 86400000).toISOString();

describe('parseCoachUsage', () => {
  it('reads the server answer', () => {
    expect(usage()).toMatchObject({ tier: 'pro', window: 'day', messagesLeft: 7, messagesLimit: 10, budgetLeftPct: 72, blocked: false });
  });

  it('marks blocked when messages or budget are gone', () => {
    expect(usage({ messages_left: 0 }).blocked).toBe(true);
    expect(usage({ budget_left_pct: 0 }).blocked).toBe(true);
    expect(usage({ budget_left_pct: 1 }).blocked).toBe(false);
  });

  it.each([
    [null], ['nope'], [{}],
    [raw({ window: 'month' })],
    [raw({ messages_left: '7' })],
    [raw({ tier: null })],
  ])('hides the line on an unexpected answer', (bad) => {
    expect(parseCoachUsage(bad)).toBeNull();
  });

  it('drops a broken date instead of showing Invalid Date', () => {
    const u = usage({ resets_at: 'soon', budget_until: 12 });
    expect(u.resetsAt).toBeNull();
    expect(u.budgetUntil).toBeNull();
    expect(JSON.stringify(coachUsageText(u))).not.toContain('Invalid');
  });
});

describe('server reset times', () => {
  it('uses 00:00 UTC', () => {
    expect(nextDayReset(new Date('2026-11-06T23:59:00Z')).toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(nextDayReset(new Date('2026-12-31T12:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('starts the week on Monday, including from a Sunday and a Monday', () => {
    expect(nextWeekReset(new Date('2026-11-06T14:00:00Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z'); // Friday
    expect(nextWeekReset(new Date('2026-11-08T23:00:00Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z'); // Sunday
    expect(nextWeekReset(new Date('2026-11-09T00:00:00Z')).toISOString()).toBe('2026-11-16T00:00:00.000Z'); // Monday
  });
});

describe('the chat line', () => {
  it('shows nothing for free accounts', () => {
    expect(coachUsageText(usage({ tier: 'free', window: 'lifetime', messages_left: 5, messages_limit: 8, budget_left_pct: null }))).toBeNull();
  });

  it('shows the day, its reset and the budget with its end date', () => {
    const text = coachUsageText(usage())!;
    expect(text.messages).toMatch(/^7 of 10 left today · Resets /);
    expect(text.budget).toMatch(/^Budget 72% · Until /);
    expect(text.budgetLow).toBe(false);
  });

  it('shows the plan period for First, with no separate reset', () => {
    const text = coachUsageText(usage({ tier: 'first', window: 'period', messages_left: 12, messages_limit: 20 }))!;
    expect(text.messages).toBe('12 of 20 messages left');
  });

  it('shows the week when it is the tighter limit', () => {
    expect(coachUsageText(usage({ window: 'week', messages_left: 3, messages_limit: 50 }))!.messages).toMatch(/^3 left this week · Resets /);
  });

  it('warns at 10% and below only', () => {
    expect(coachUsageText(usage({ budget_left_pct: 11 }))!.budgetLow).toBe(false);
    expect(coachUsageText(usage({ budget_left_pct: 10 }))!.budgetLow).toBe(true);
    expect(coachUsageText(usage({ budget_left_pct: 0 }))!.budgetLow).toBe(true);
  });

  it('leaves out the dates when the plan has none', () => {
    const text = coachUsageText(usage({ budget_until: null, resets_at: null }))!;
    expect(text.messages).toBe('7 of 10 left today');
    expect(text.budget).toBe('Budget 72%');
  });

  it('never shows dollars', () => {
    expect(JSON.stringify(coachUsageText(usage()))).not.toContain('$');
  });
});

describe('limit notices', () => {
  const REASONS = ['RATE_LIMIT:BUDGET: x', 'RATE_LIMIT:CAP: x', 'RATE_LIMIT:WEEKLY: x', 'RATE_LIMIT:DAILY: x', undefined];

  // These stay in the history sent to the AI Coach. If the server stops
  // recognizing one, the AI reads it as its own words (bug of 2026-09-29).
  it.each(REASONS)('%s stays recognizable to the server once filled in', (reason) => {
    expect(isUsageNotice(rateLimitCopy(reason, FUTURE))).toBe(true);
    expect(isUsageNotice(rateLimitCopy(reason, null))).toBe(true);
  });

  it('leaves no placeholder unfilled', () => {
    for (const reason of REASONS) {
      expect(rateLimitCopy(reason, FUTURE)).not.toContain('{{');
      expect(rateLimitBannerCopy(reason, null, FUTURE)).not.toContain('{{');
    }
  });

  it('never promises midnight or a renewal', () => {
    for (const reason of REASONS) {
      expect(rateLimitCopy(reason, FUTURE)).not.toMatch(/midnight|renew/i);
      expect(rateLimitBannerCopy(reason, null, FUTURE)).not.toMatch(/midnight|renew/i);
    }
  });

  it('adds the end date only while it is ahead', () => {
    expect(rateLimitCopy('RATE_LIMIT:BUDGET', FUTURE)).toContain('This period runs until');
    expect(rateLimitCopy('RATE_LIMIT:BUDGET', '2020-01-01T00:00:00Z')).not.toContain('until');
    expect(rateLimitCopy('RATE_LIMIT:BUDGET', null)).not.toContain('until');
  });

  it('names messages, not budget, when the message allowance ran out', () => {
    expect(rateLimitBannerCopy('RATE_LIMIT:CAP', null)).toContain('Messages used');
  });

  it('shows the carried-over allowance as the day\'s limit', () => {
    expect(coachUsageText(usage({ messages_left: 8, messages_limit: 14 }))!.messages).toMatch(/^8 of 14 left today/);
  });

  it('points to the week when the day and the week are both used up', () => {
    const both = usage({ window: 'week', messages_left: 0 });
    expect(rateLimitBannerCopy('RATE_LIMIT:DAILY: x', both)).toContain('Weekly');
    expect(rateLimitBannerCopy('RATE_LIMIT:DAILY: x', null)).toContain('Daily');
  });
});
