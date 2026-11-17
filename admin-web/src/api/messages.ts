import { supabase } from '@/lib/supabase';

// Admin messages (migration 20261117120000_admin_messages_and_gifts): an
// admin writes a message, picks who gets it, and sends it as a push plus an
// inbox row. Who gets it is decided by the server (admin_message_audience);
// the preview and the send use the same rule. Pushes go out through the
// send-admin-message Edge Function.

export type MessageKind = 'news' | 'gift' | 'discount';
export type GiftTier = 'first' | 'pro' | 'max';

export interface MessageAudience {
  user_ids?: string[];
  access?: 'free' | 'paid';
  language?: 'en' | 'ar';
  platform?: 'ios' | 'android';
  version_below?: string;
  version_at_least?: string;
  active_days?: number;
  inactive_days?: number;
  min_tier?: number;
  max_tier?: number;
  community_id?: string;
  push_only?: boolean;
}

export interface MessagePayload {
  kind: MessageKind;
  title_en: string;
  body_en: string;
  title_ar?: string;
  body_ar?: string;
  screen?: string;
  audience: MessageAudience;
  gift_tier?: GiftTier;
  gift_days?: number;
  gift_claim_days?: number;
  code_ios?: string;
  code_android?: string;
}

export interface AudiencePreview {
  total: number;
  with_push: number;
  english: number;
  arabic: number;
  ios: number;
  android: number;
  skipped: Record<string, number>;
  sample: string[];
  problem: string | null;
}

export interface AdminMessage {
  id: string;
  kind: MessageKind;
  title_en: string;
  body_en: string;
  title_ar: string | null;
  body_ar: string | null;
  screen: string | null;
  audience: MessageAudience;
  gift_tier: GiftTier | null;
  gift_days: number | null;
  gift_claim_by: string | null;
  code_ios: string | null;
  code_android: string | null;
  is_test: boolean;
  target_count: number;
  created_at: string;
  created_by_name: string | null;
  recipients: number;
  pending: number;
  pushed: number;
  no_token: number;
  failed: number;
  delivered: number;
  receipts_pending: number;
  opened: number;
  claimed: number;
  purchased: number;
}

/** Screens a news message can open. Each exists in every app version in use. */
export const MESSAGE_SCREENS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Just open the app' },
  { value: 'profile', label: 'Profile' },
  { value: 'my-journey', label: 'Journey' },
  { value: 'training-center', label: 'Train' },
  { value: 'weekly-challenge', label: 'Weekly Challenge' },
  { value: 'one-min-max', label: 'One Min Max' },
  { value: 'coach', label: 'AI Coach' },
  { value: 'paywall', label: 'Plans (paywall)' },
  { value: 'redeem-code', label: 'Redeem a Code' },
];

export const SKIP_REASONS: Record<string, string> = {
  opted_out: 'switched off news and offers',
  has_subscription: 'already have a store subscription',
  staff: 'coaches and admins (already have full access)',
  old_app: 'on an app version that cannot claim a gift (below 1.2.20)',
  no_platform: 'phone type not known yet (no code to give)',
  no_code: 'no code entered for their phone type',
};

const ERRORS: Record<string, string> = {
  ADMIN_ONLY: 'Only admins can send messages.',
  INVALID_KIND: 'Pick a message type.',
  TEXT_REQUIRED: 'Write an English title and message.',
  ARABIC_INCOMPLETE: 'Arabic needs both a title and a message, or leave both empty.',
  TITLE_TOO_LONG: 'The title is too long (80 characters at most).',
  BODY_TOO_LONG: 'The message is too long (400 characters at most).',
  INVALID_SCREEN: 'Pick a screen from the list.',
  INVALID_TIER: 'Pick the gift plan.',
  INVALID_GIFT_DAYS: 'Gift days must be between 1 and 366.',
  INVALID_CLAIM_DAYS: 'Days to claim must be between 1 and 60.',
  CODE_REQUIRED: 'Enter a code for iPhone, Android, or both.',
  CODE_PLACEHOLDER_MISSING: 'Put {code} in the message where the code should appear (in Arabic too).',
  NO_RECIPIENTS: 'Nobody matches this audience.',
  TOO_MANY_RECIPIENTS: 'This audience is above the 5,000 limit.',
  COUNT_CHANGED: 'The audience changed since the preview. Check the new count and send again.',
  DUPLICATE_SEND: 'This exact message was already sent in the last 10 minutes.',
};

export function messageError(code: string | null | undefined): string {
  return (code && ERRORS[code]) || code || 'Something went wrong.';
}

function toError(error: { message: string }): Error {
  return new Error(ERRORS[error.message] ?? error.message);
}

export async function previewAudience(payload: MessagePayload): Promise<AudiencePreview> {
  const { data, error } = await supabase.rpc('admin_preview_message_audience', { p_payload: payload });
  if (error) throw toError(error);
  return data as AudiencePreview;
}

export interface SendResult {
  messageId: string;
  count: number;
  push: PushOutcome | null;
  pushError: string | null;
}

export interface PushOutcome {
  sent: number;
  failed: number;
  noToken: number;
  remaining: number;
}

/** Pushes the unsent rows of a message. Safe to call again: sent rows are skipped. */
export async function deliverMessage(messageId: string): Promise<PushOutcome> {
  const { data, error } = await supabase.functions.invoke('send-admin-message', {
    body: { message_id: messageId, action: 'send' },
  });
  if (error) throw new Error(error.message);
  return data as PushOutcome;
}

/**
 * Writes the message for exactly `confirmCount` people (the server refuses if
 * the audience is a different size now), then pushes it.
 */
export async function sendMessage(payload: MessagePayload, confirmCount: number): Promise<SendResult> {
  const { data, error } = await supabase.rpc('admin_send_message', {
    p_payload: payload,
    p_confirm_count: confirmCount,
  });
  if (error) throw toError(error);
  const result = data as { ok: boolean; error?: string; message_id?: string; count?: number };
  if (!result?.ok || !result.message_id) throw new Error(messageError(result?.error));

  // The message is saved either way; a failed push can be retried from the
  // history list.
  try {
    const push = await deliverMessage(result.message_id);
    return { messageId: result.message_id, count: result.count ?? confirmCount, push, pushError: null };
  } catch (err) {
    return {
      messageId: result.message_id,
      count: result.count ?? confirmCount,
      push: null,
      pushError: err instanceof Error ? err.message : 'The pushes did not go out.',
    };
  }
}

/** Asks Expo whether the pushes reached Apple/Google (ready ~15 minutes after sending). */
export async function checkDelivery(messageId: string): Promise<{ delivered: number; failed: number; waiting: number }> {
  const { data, error } = await supabase.functions.invoke('send-admin-message', {
    body: { message_id: messageId, action: 'receipts' },
  });
  if (error) throw new Error(error.message);
  return data as { delivered: number; failed: number; waiting: number };
}

export async function fetchMessages(): Promise<AdminMessage[]> {
  const { data, error } = await supabase.rpc('admin_get_messages', { p_limit: 100 });
  if (error) throw toError(error);
  return (data ?? []) as AdminMessage[];
}
