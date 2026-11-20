// The Notifications screen. It lists two things from the notifications table:
// - messages from the Leap team (admin-web Messages page, migration
//   20261117120000_admin_messages_and_gifts): type 'admin_message'; data says
//   what kind it is and what its button does;
// - the app's own notifications worth reading later: a new weekly challenge,
//   someone passing you, a program update from the coach, a finished week.
// Reminders and "new personal best" pushes are of the moment and stay out.

export const INBOX_TYPE = 'admin_message';

// Shown by default. The server can add any other type without an app release
// by writing data.inbox = true on the row, or hide one with data.inbox = false.
export const ACTIVITY_TYPES = [
  'weekly_challenge_started',
  'leaderboard_overtaken',
  'client_program_update',
  'week_complete_nudge',
  'program_review_ready',
];

/** How far back the screen and the unread dot look. */
export const INBOX_WINDOW_DAYS = 60;

export type InboxKind = 'news' | 'gift' | 'discount';
export type GiftTier = 'first' | 'pro' | 'max';

export interface InboxRow {
  id: string;
  /** Missing on rows loaded before types were listed: treated as a team message. */
  type?: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  /** When the person tapped the item or its button (migration 20261119100000). */
  acted_at?: string | null;
}

/**
 * The names inside a notification, saved as separate fields by the server
 * (notification_fields, migration 20261119100000), so the screen can lead
 * with them in either language. Missing on anything the server couldn't read.
 */
export interface NotificationFields {
  challengeName: string | null;
  /** Who overtook you; null = "someone". */
  byName: string | null;
  /** 'score' = a world or Well-Rounded board; 'time' = a strength tier. */
  overtakenKind: 'score' | 'time' | null;
  /** English board name as the server wrote it: Well-Rounded, Power World, Static World, 1MM. */
  boardName: string | null;
  tier: number | null;
  /** The AI Coach week just finished. */
  week: number | null;
  programName: string | null;
}

export interface InboxItem {
  id: string;
  /** The notification's server type (admin_message, leaderboard_overtaken, ...). */
  type: string;
  kind: InboxKind;
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  /** Route the button opens, already checked against the allowed list. */
  screen: string | null;
  /** Query params for that route (e.g. a tab or an id). */
  params: Record<string, string>;
  /** A web link the button opens instead of a screen (https only). */
  url: string | null;
  /** The button's own text, already in the reader's language. */
  buttonLabel: string | null;
  /** A picture shown above the text (https only). */
  imageUrl: string | null;
  /** false = no pop-up on app open; the message waits in the inbox. */
  popup: boolean;
  /** After this time the message is hidden. */
  expiresAt: string | null;
  /** The gift pill's own text, for gifts that aren't "plan for N days". */
  giftText: string | null;
  code: string | null;
  claimId: string | null;
  giftTier: GiftTier | null;
  giftDays: number | null;
  actedAt: string | null;
  fields: NotificationFields;
}

export interface GiftClaim {
  id: string;
  tier: GiftTier | string;
  days: number;
  claim_by: string;
  claimed_at: string | null;
}

export type GiftState = 'claimable' | 'claimed' | 'expired' | 'unknown';

// Screens a message may open: every athlete screen that makes sense as a
// destination, so the server can start using one without an app release.
// Anything else is ignored. Who may enter a screen (tier gates, onboarding)
// is still AuthGuard's call.
const ALLOWED_SCREENS = new Set([
  'profile',
  'training-center',
  'my-journey',
  'my-progress',
  'weekly-challenge',
  'one-min-max',
  'static-world',
  'power-world',
  'champions-arena',
  'coach',
  'program-templates',
  'customize-program',
  'quick-workout',
  'paywall',
  'welcome-offer',
  'redeem-code',
  'notifications',
  'notification-settings',
  'warrior-program',
  'coaching-review',
]);

// Fields of data that describe the message itself, not the opened screen.
const NOT_PARAMS = new Set([
  'screen', 'kind', 'message_id', 'inbox', 'popup', 'button', 'url', 'image_url', 'expires_at', 'params',
  'code', 'claim_id', 'gift_tier', 'gift_days', 'gift_text', 'key',
  // notification_fields: describe the notification, not the screen.
  'challenge_name', 'by_name', 'board_name', 'tier', 'week', 'program_id', 'program_name', 'week_program',
]);

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function fieldsOf(data: Record<string, unknown>): NotificationFields {
  const kind = text(data.kind);
  return {
    challengeName: text(data.challenge_name),
    byName: text(data.by_name),
    overtakenKind: kind === 'score' || kind === 'time' ? kind : null,
    boardName: text(data.board_name),
    tier: num(data.tier),
    week: num(data.week),
    // A coach's week unlock names its program in week_program (1.2.20 reads program_name as a new program).
    programName: text(data.program_name) ?? text(data.week_program),
  };
}

function httpsUrl(value: unknown): string | null {
  const url = text(value);
  return url && /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

function stringParams(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[key] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = String(v);
  }
  return out;
}

// The pop-up only announces fresh messages; older ones wait in the inbox.
const PROMPT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Whether a notifications row belongs on the Notifications screen. */
export function belongsInInbox(row: InboxRow): boolean {
  const flag = row.data?.inbox;
  if (flag === false || flag === 'false') return false;
  if (flag === true || flag === 'true') return true;
  const type = row.type ?? INBOX_TYPE;
  return type === INBOX_TYPE || ACTIVITY_TYPES.includes(type);
}

export function toInboxItem(row: InboxRow): InboxItem {
  const data = row.data ?? {};
  const type = row.type ?? INBOX_TYPE;
  const fromTeam = type === INBOX_TYPE;
  const rawKind = fromTeam ? text(data.kind) : null;
  const kind: InboxKind = rawKind === 'gift' || rawKind === 'discount' ? rawKind : 'news';
  // The app's own notifications keep their screen's params at the top level
  // of data (as the push tap handler reads them); team messages use data.params.
  const params = stringParams(data.params);
  if (!fromTeam) {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && !NOT_PARAMS.has(key)) params[key] = value;
    }
  }
  const rawTier = text(data.gift_tier);
  const days = typeof data.gift_days === 'number' ? data.gift_days : Number(data.gift_days);
  const screen = text(data.screen);
  return {
    id: row.id,
    type,
    kind,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    unread: row.read_at == null,
    screen: kind === 'news' && screen && ALLOWED_SCREENS.has(screen) ? screen : null,
    params,
    url: kind === 'news' ? httpsUrl(data.url) : null,
    buttonLabel: text(data.button),
    imageUrl: httpsUrl(data.image_url),
    // The app's own notifications already arrived as a push: no pop-up
    // unless the server asks for one.
    popup: fromTeam ? data.popup !== false && data.popup !== 'false' : data.popup === true || data.popup === 'true',
    expiresAt: text(data.expires_at),
    giftText: kind === 'gift' ? text(data.gift_text) : null,
    code: kind === 'discount' ? text(data.code) : null,
    claimId: kind === 'gift' ? text(data.claim_id) : null,
    giftTier: rawTier === 'first' || rawTier === 'pro' || rawTier === 'max' ? rawTier : null,
    giftDays: Number.isFinite(days) && days > 0 ? days : null,
    actedAt: row.acted_at ?? null,
    fields: fieldsOf(data),
  };
}

export function giftState(claim: GiftClaim | undefined, nowMs: number): GiftState {
  if (!claim) return 'unknown';
  if (claim.claimed_at) return 'claimed';
  return new Date(claim.claim_by).getTime() > nowMs ? 'claimable' : 'expired';
}

export function isExpired(item: InboxItem, nowMs: number): boolean {
  if (!item.expiresAt) return false;
  const at = new Date(item.expiresAt).getTime();
  return Number.isFinite(at) && at <= nowMs;
}

/** The inbox list: everything that hasn't expired. */
export function visibleItems(items: InboxItem[], nowMs: number): InboxItem[] {
  return items.filter((i) => !isExpired(i, nowMs));
}

/** Where a news message's button goes inside the app, or null. */
export function routeFor(item: InboxItem): string | null {
  if (!item.screen) return null;
  const query = Object.entries(item.params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `/${item.screen}${query ? `?${query}` : ''}`;
}

/**
 * The message the pop-up shows: the newest unread one, if recent, not expired,
 * not marked inbox-only, and not already shown in this app session.
 */
export function pickPromptItem(items: InboxItem[], nowMs: number, alreadyShown: ReadonlySet<string> = new Set()): InboxItem | null {
  const fresh = items
    .filter((i) => i.unread && i.popup && !alreadyShown.has(i.id) && !isExpired(i, nowMs)
      && nowMs - new Date(i.createdAt).getTime() <= PROMPT_MAX_AGE_MS)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return fresh[0] ?? null;
}

// Notification switches (Settings > Notifications). Each switch turns a
// group of server notification types on or off; the server skips a type
// whose key is false in notification_preferences.prefs.
export type PrefGroup = 'training' | 'challenges' | 'news';

export const PREF_GROUP_KEYS: Record<PrefGroup, string[]> = {
  training: ['daily_reminder'],
  challenges: ['weekly_challenge_started', 'weekly_challenge_ending', 'leaderboard_overtaken'],
  news: [INBOX_TYPE],
};

/** A group is on unless every one of its keys is switched off. */
export function isGroupOn(prefs: Record<string, unknown> | null | undefined, group: PrefGroup): boolean {
  const p = prefs ?? {};
  return !PREF_GROUP_KEYS[group].every((key) => p[key] === false || p[key] === 'false');
}

export function withGroup(prefs: Record<string, unknown> | null | undefined, group: PrefGroup, on: boolean): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(prefs ?? {}) };
  for (const key of PREF_GROUP_KEYS[group]) next[key] = on;
  return next;
}
