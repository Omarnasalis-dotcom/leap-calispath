// The Notifications screen's layout logic ("Action-first" redesign): which
// notifications still need the person ("Needs you", with the AI Coach week
// as the hero card), and the rest as a month-by-month activity timeline.
// Pure functions over InboxItem; the screen loads the data.
import { giftState, routeFor, type GiftClaim, type InboxItem } from './inbox';
import { TIER_NAMES } from '../types';
import { isArabic, t } from '../i18n';

/** What a "Needs you" card is about; decides its icon, words and button. */
export type ActionKind = 'coach' | 'challenge' | 'overtaken' | 'gift' | 'discount' | 'program' | 'review';

export interface ActionEntry {
  kind: ActionKind;
  item: InboxItem;
}

export interface Feed {
  /** The newest unbuilt AI Coach week, or null. */
  hero: ActionEntry | null;
  /** Other "Needs you" cards, gifts first, then newest first. */
  cards: ActionEntry[];
  /** Everything else, newest first. */
  activity: InboxItem[];
}

/** Types the server can say are done (get_inbox_status): the week built, the challenge entered or over, back ahead on the board. */
export const STATUS_TYPES = new Set(['week_complete_nudge', 'weekly_challenge_started', 'leaderboard_overtaken']);

const DAY = 86400000;
/** Without a server answer, an item counts as waiting for this long (unless tapped). */
export const PENDING_DAYS = 7;
/** Codes and gifts stay up front longer: they're the point of the message. */
const OFFER_DAYS = 14;
/** Cards besides gifts, the AI Coach card included. Gifts never drop out. */
export const NEEDS_YOU_CAP = 3;

const ageDays = (item: InboxItem, nowMs: number) => (nowMs - new Date(item.createdAt).getTime()) / DAY;

/** Which board an overtake is about, so only the newest per board is shown. */
function boardKey(item: InboxItem): string {
  const f = item.fields;
  if (f.overtakenKind === 'time' && f.tier != null) return `tier:${f.tier}`;
  return `board:${f.boardName ?? item.params.board ?? item.screen ?? 'other'}`;
}

function actionKind(item: InboxItem): ActionKind | null {
  if (item.kind === 'gift') return 'gift';
  if (item.kind === 'discount') return 'discount';
  switch (item.type) {
    case 'week_complete_nudge': return 'coach';
    case 'weekly_challenge_started': return 'challenge';
    case 'leaderboard_overtaken': return 'overtaken';
    case 'client_program_update': return 'program';
    case 'program_review_ready': return 'review';
    default: return null;
  }
}

/**
 * Whether an item still needs the person. The server's answer (status) wins
 * where it has one: the AI Coach week built, the challenge entered or over.
 * Otherwise: not tapped yet and recent.
 */
export function isPending(
  item: InboxItem,
  kind: ActionKind,
  claim: GiftClaim | undefined,
  status: Record<string, boolean>,
  nowMs: number,
): boolean {
  const age = ageDays(item, nowMs);
  if (kind === 'gift') {
    const state = giftState(claim, nowMs);
    // A claim that didn't load: still offered while the gift is fresh (the server checks it).
    return state === 'claimable' || (state === 'unknown' && age <= OFFER_DAYS);
  }
  if (kind === 'discount') return !!item.code && !item.actedAt && age <= OFFER_DAYS;
  if (kind === 'coach' && item.fields.week == null) return false;
  const known = status[item.id];
  if (typeof known === 'boolean') return !known;
  return !item.actedAt && age <= PENDING_DAYS;
}

export function buildFeed(
  items: InboxItem[],
  claims: Record<string, GiftClaim>,
  status: Record<string, boolean>,
  nowMs: number,
): Feed {
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const gifts: ActionEntry[] = [];
  const pending: ActionEntry[] = [];
  let hero: ActionEntry | null = null;
  const boardsSeen = new Set<string>();
  const used = new Set<string>();

  for (const item of sorted) {
    const kind = actionKind(item);
    if (!kind) continue;
    const claim = item.claimId ? claims[item.claimId] : undefined;
    if (!isPending(item, kind, claim, status, nowMs)) continue;
    if (kind === 'gift') {
      gifts.push({ kind, item });
      used.add(item.id);
      continue;
    }
    if (kind === 'coach') {
      // Only the newest unbuilt week; an older one is history.
      if (hero) continue;
      hero = { kind, item };
      used.add(item.id);
      continue;
    }
    if (kind === 'overtaken') {
      const key = boardKey(item);
      if (boardsSeen.has(key)) continue;
      boardsSeen.add(key);
    }
    pending.push({ kind, item });
  }

  const room = Math.max(0, NEEDS_YOU_CAP - (hero ? 1 : 0));
  const shown = pending.slice(0, room);
  for (const entry of shown) used.add(entry.item.id);

  return {
    hero,
    cards: [...gifts, ...shown],
    activity: sorted.filter((i) => !used.has(i.id)),
  };
}

/**
 * What the bell counts: everything unread, plus what still needs the person
 * but was already seen ("Needs you"), so the bell doesn't go quiet while a
 * week waits to be built or a gift to be claimed.
 */
export function badgeCount(unread: number, feed: Feed): number {
  const waiting = [feed.hero, ...feed.cards].filter((e): e is ActionEntry => !!e && !e.item.unread);
  return unread + waiting.length;
}

/** One line of the activity timeline: a notification, or a month's weekly-challenge starts folded together. */
export type ActivityEntry =
  | { kind: 'item'; item: InboxItem }
  | { kind: 'challenges'; key: string; items: InboxItem[] };

/**
 * A month's weekly-challenge starts (two or more) fold into one row, placed
 * where the newest one was; they're the same message every week.
 */
export function foldChallenges(items: InboxItem[]): ActivityEntry[] {
  const challenges = items.filter((i) => i.type === 'weekly_challenge_started');
  if (challenges.length < 2) return items.map((item) => ({ kind: 'item' as const, item }));
  const out: ActivityEntry[] = [];
  let placed = false;
  for (const item of items) {
    if (item.type !== 'weekly_challenge_started') {
      out.push({ kind: 'item', item });
    } else if (!placed) {
      out.push({ kind: 'challenges', key: `challenges:${item.id}`, items: challenges });
      placed = true;
    }
  }
  return out;
}

/**
 * A challenge that started over a week ago is over: its row opens nothing,
 * since the challenge screen shows this week's challenge, not that one.
 */
export function isPastChallenge(item: InboxItem, nowMs: number): boolean {
  return item.type === 'weekly_challenge_started' && ageDays(item, nowMs) > PENDING_DAYS;
}

/** Activity cut into calendar months, newest first; the year only when it isn't this year. */
export function groupByMonth(items: InboxItem[], nowMs: number, locale?: string): { key: string; label: string; items: InboxItem[] }[] {
  const thisYear = new Date(nowMs).getFullYear();
  const groups: { key: string; label: string; items: InboxItem[] }[] = [];
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const label = d.toLocaleDateString(locale, d.getFullYear() === thisYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Within 6 days: the weekday ("Sat"); older: the date ("12 Nov"). Phone's locale and time zone. */
export function dateLabel(createdAt: string, nowMs: number, locale?: string): string {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return '';
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  if (at.getTime() >= today.getTime() - 6 * DAY) return at.toLocaleDateString(locale, { weekday: 'short' });
  return at.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** A line of text with its name part in bold. */
export type Segment = { text: string; bold: boolean };

const MARK = '\u0007';

/**
 * A translated sentence whose name part is bold: `sentence` gets a marker in
 * place of the name, so the sentence order stays the language's own (Arabic
 * may put the name anywhere).
 */
export function withBoldName(sentence: (name: string) => string, name: string): Segment[] {
  const text = sentence(MARK);
  const parts = text.split(MARK);
  const out: Segment[] = [];
  parts.forEach((part, i) => {
    if (part) out.push({ text: part, bold: false });
    // Bidi isolates keep a Latin name from flipping the Arabic sentence around it.
    if (i < parts.length - 1) out.push({ text: isArabic ? `\u2068${name}\u2069` : name, bold: true });
  });
  return out;
}

export function whoName(item: InboxItem): string {
  return item.fields.byName ?? t('inboxFeed.someone');
}

/** "Well-Rounded" / "Power World"... in the reader's language. */
export function boardLabel(boardName: string | null): string {
  switch (boardName) {
    case 'Well-Rounded': return t('inboxFeed.boardWra');
    case 'Power World': return t('inboxFeed.boardPower');
    case 'Static World': return t('inboxFeed.boardStatic');
    case '1MM': return t('inboxFeed.board1mm');
    default: return t('inboxFeed.boardGeneric');
  }
}

export function tierLabel(tier: number | null): string {
  return tier != null && TIER_NAMES[tier] ? TIER_NAMES[tier] : t('inboxFeed.tierN', { n: tier ?? 0 });
}

/**
 * The timeline line for an activity item: the name leads, in bold. Anything
 * the server couldn't name falls back to its own title (bold) and text.
 */
export function timelineText(item: InboxItem): { line: Segment[]; sub: string | null } {
  const f = item.fields;
  if (item.type === 'weekly_challenge_started' && f.challengeName) {
    return { line: withBoldName((name) => t('inboxFeed.lineChallenge', { name }), f.challengeName), sub: null };
  }
  if (item.type === 'week_complete_nudge' && f.week != null) {
    return { line: withBoldName((name) => t('inboxFeed.lineWeek', { name }), t('inboxFeed.weekN', { n: f.week })), sub: null };
  }
  if (item.type === 'leaderboard_overtaken' && f.overtakenKind === 'score') {
    return { line: withBoldName((name) => t('inboxFeed.lineOvertakenScore', { name, board: boardLabel(f.boardName) }), whoName(item)), sub: null };
  }
  if (item.type === 'leaderboard_overtaken' && f.overtakenKind === 'time') {
    return { line: withBoldName((name) => t('inboxFeed.lineOvertakenTime', { name, tier: tierLabel(f.tier) }), whoName(item)), sub: null };
  }
  if (item.type === 'client_program_update' && f.programName) {
    return { line: withBoldName((name) => t('inboxFeed.lineProgram', { name }), f.programName), sub: null };
  }
  return { line: [{ text: item.title, bold: true }], sub: item.body || null };
}

/**
 * Where tapping an item goes (a card, its button or a timeline row), or null.
 * Overtakes sent before 2026-11-17 only say "profile": they open the board
 * they're about, read from their saved names, like the newer ones do.
 */
export function itemRoute(item: InboxItem, kind?: ActionKind | null): string | null {
  if (item.kind === 'discount' && item.code) return `/redeem-code?code=${encodeURIComponent(item.code)}`;
  if (item.type === 'leaderboard_overtaken' && item.screen === 'profile' && !item.params.board && !item.params.boardTier) {
    const f = item.fields;
    if (f.overtakenKind === 'time' && f.tier != null) return `/profile?activeTab=strength&boardTier=${f.tier}`;
    if (f.boardName === 'Well-Rounded') return '/profile?activeTab=profile&board=wra';
  }
  const route = routeFor(item);
  if (route) return route;
  if (kind === 'challenge') return '/weekly-challenge';
  if (kind === 'overtaken') return '/profile';
  return null;
}
