import { isArabic, t } from '../i18n';

/**
 * What the athlete has left with the AI Coach, for display only. The server
 * checks every message by itself (ai_coach_log_chat_request): nothing here may
 * ever stop a message from being sent.
 */
export type CoachUsageWindow = 'lifetime' | 'period' | 'day' | 'week';

export interface CoachUsage {
  tier: string;
  window: CoachUsageWindow;
  messagesLeft: number;
  messagesLimit: number;
  resetsAt: string | null;
  budgetLeftPct: number | null;
  budgetUntil: string | null;
  /** The next message would be refused. */
  blocked: boolean;
}

const WINDOWS: CoachUsageWindow[] = ['lifetime', 'period', 'day', 'week'];
/** From here the ring turns red and a warning shows above the message box. */
export const NEAR_BUDGET_PCT = 25;
export const NEAR_MESSAGES = 3;

const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Anything unexpected gives null, which hides the line. */
export function parseCoachUsage(raw: unknown): CoachUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const { tier, window, messages_left: left, messages_limit: limit, resets_at: resets, budget_left_pct: pct, budget_until: until } = r;
  if (typeof tier !== 'string' || !WINDOWS.includes(window as CoachUsageWindow)) return null;
  if (typeof left !== 'number' || typeof limit !== 'number') return null;
  const budgetLeftPct = typeof pct === 'number' ? pct : null;
  return {
    tier,
    window: window as CoachUsageWindow,
    messagesLeft: left,
    messagesLimit: limit,
    resetsAt: isDate(resets) ? resets : null,
    budgetLeftPct,
    budgetUntil: isDate(until) ? until : null,
    blocked: left <= 0 || budgetLeftPct === 0,
  };
}

const locale = () => (isArabic ? 'ar' : undefined);

export const formatResetTime = (at: string | Date) =>
  new Date(at).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });

export const formatResetDayTime = (at: string | Date) =>
  new Date(at).toLocaleString(locale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export const formatUntilDate = (at: string | Date) =>
  new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

/** The server's day and week start at 00:00 UTC, and the week on a Monday. */
export function nextDayReset(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export function nextWeekReset(now = new Date()): Date {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday + 7));
}

export interface CoachUsageText {
  messages: string;
  budget: string | null;
  budgetLow: boolean;
}

/** Close to being refused. Free accounts never reach the chat box. */
export function coachUsageNear(usage: CoachUsage): boolean {
  if (usage.window === 'lifetime') return false;
  return usage.messagesLeft <= NEAR_MESSAGES || (usage.budgetLeftPct != null && usage.budgetLeftPct <= NEAR_BUDGET_PCT);
}

/** How full the ring is, 0 to 1: whichever of messages and budget is tighter. */
export function coachUsageLeft(usage: CoachUsage): number {
  const messages = usage.messagesLimit > 0 ? usage.messagesLeft / usage.messagesLimit : 0;
  return usage.budgetLeftPct == null ? messages : Math.min(messages, usage.budgetLeftPct / 100);
}

/** The short warning above the message box, only when close to a limit. */
export function coachUsageWarning(usage: CoachUsage): string | null {
  if (!coachUsageNear(usage)) return null;
  const parts: string[] = [];
  if (usage.messagesLeft <= NEAR_MESSAGES) {
    const key = usage.window === 'day' ? 'coach.warnDay' : usage.window === 'week' ? 'coach.warnWeek' : 'coach.warnPeriod';
    parts.push(t(key, { left: usage.messagesLeft }));
  }
  if (usage.budgetLeftPct != null && usage.budgetLeftPct <= NEAR_BUDGET_PCT) {
    parts.push(t('coach.warnBudget', { pct: usage.budgetLeftPct }));
  }
  return parts.join(' · ');
}

/** The details behind the ring. Null for free accounts. */
export function coachUsageText(usage: CoachUsage): CoachUsageText | null {
  if (usage.window === 'lifetime') return null;
  const { messagesLeft: left, messagesLimit: limit, resetsAt } = usage;
  let messages: string;
  if (usage.window === 'period') {
    messages = t('coach.usagePeriod', { left, limit });
  } else if (usage.window === 'week') {
    messages = t('coach.usageWeek', { left });
    if (resetsAt) messages += ` · ${t('coach.usageResets', { time: formatResetDayTime(resetsAt) })}`;
  } else {
    messages = t('coach.usageDay', { left, limit });
    if (resetsAt) messages += ` · ${t('coach.usageResets', { time: formatResetTime(resetsAt) })}`;
  }

  const { budgetLeftPct: pct, budgetUntil } = usage;
  if (pct == null) return { messages, budget: null, budgetLow: false };
  let budget = t('coach.usageBudget', { pct });
  if (budgetUntil) budget += ` · ${t('coach.usageUntil', { date: formatUntilDate(budgetUntil) })}`;
  return { messages, budget, budgetLow: pct <= NEAR_BUDGET_PCT };
}

const withUntil = (text: string, key: 'coach.periodUntil' | 'coach.usageUntil', separator: string, expiresAt?: string | null) => {
  const live = isDate(expiresAt) && Date.parse(expiresAt) > Date.now();
  return live ? `${text}${separator}${t(key, { date: formatUntilDate(expiresAt) })}` : text;
};

/**
 * ai_coach_log_chat_request raises one of these RATE_LIMIT:<REASON> prefixes
 * depending on which cap was hit. These go into the chat as a coach reply, so
 * they stay in the history sent to the AI Coach: the server recognizes them by
 * their opening words (tools/usageNotices.ts) and swaps them out. Keep those
 * words, in English and Arabic, or the AI reads the notice as its own.
 */
export function rateLimitCopy(reason: string | undefined, expiresAt?: string | null, now = new Date()): string {
  if (reason?.startsWith('RATE_LIMIT:BUDGET')) return withUntil(t('coach.quotaBudget'), 'coach.periodUntil', ' ', expiresAt);
  if (reason?.startsWith('RATE_LIMIT:CAP')) return withUntil(t('coach.quotaCap'), 'coach.periodUntil', ' ', expiresAt);
  if (reason?.startsWith('RATE_LIMIT:WEEKLY')) return t('coach.quotaWeekly', { time: formatResetDayTime(nextWeekReset(now)) });
  const time = formatResetTime(nextDayReset(now));
  return t(reason?.startsWith('RATE_LIMIT:DAILY') ? 'coach.quotaDaily' : 'coach.quotaDefault', { time });
}

/** The short form above the message box. `usage` wins when it names the week,
 * since the numbers can be newer than the refusal this copy came from. */
export function rateLimitBannerCopy(
  reason: string | undefined,
  usage: CoachUsage | null,
  expiresAt?: string | null,
  now = new Date(),
): string {
  if (reason?.startsWith('RATE_LIMIT:BUDGET')) return withUntil(t('coach.bannerBudget'), 'coach.usageUntil', ' · ', expiresAt);
  if (reason?.startsWith('RATE_LIMIT:CAP')) return withUntil(t('coach.bannerCap'), 'coach.usageUntil', ' · ', expiresAt);
  if (reason?.startsWith('RATE_LIMIT:WEEKLY') || (usage?.window === 'week' && usage.messagesLeft <= 0)) {
    return t('coach.bannerWeekly', { time: formatResetDayTime(nextWeekReset(now)) });
  }
  return t('coach.bannerDaily', { time: formatResetTime(nextDayReset(now)) });
}
