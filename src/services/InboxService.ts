import { supabase } from '../lib/supabase';
import { ACTIVITY_TYPES, INBOX_TYPE, INBOX_WINDOW_DAYS, belongsInInbox, toInboxItem, type GiftClaim, type InboxItem, type InboxRow } from '../lib/inbox';

// The Notifications screen: the list, the unread dot, gift claims and the
// notification switches. Reads are the user's own rows (RLS).

const INBOX_LIMIT = 60;

// Rows of a listed type, or any row the server marked for the inbox.
const INBOX_FILTER = `type.in.(${[INBOX_TYPE, ...ACTIVITY_TYPES].join(',')}),data->>inbox.eq.true`;
const windowStart = () => new Date(Date.now() - INBOX_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

type Listener = () => void;
const listeners = new Set<Listener>();

/** Called whenever read state changes, so the bell badge can refresh. */
export function onInboxChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChanged() {
  listeners.forEach((l) => l());
}

// tier / days / accessExpiresAt are there for a plan gift; a future kind of
// gift may come back with none of them and is still a successful claim.
export type ClaimResult =
  | { ok: true; tier: string | null; days: number | null; accessExpiresAt: string | null }
  | { ok: false; error: string };

export class InboxService {
  static async fetchInbox(): Promise<InboxItem[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, read_at, created_at')
      .or(INBOX_FILTER)
      .gte('created_at', windowStart())
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT);
    if (error) throw new Error(error.message);
    return ((data ?? []) as InboxRow[]).filter(belongsInInbox).map(toInboxItem);
  }

  static async fetchUnreadCount(): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .or(INBOX_FILTER)
      .gte('created_at', windowStart())
      .is('read_at', null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  static async fetchGiftClaims(claimIds: string[]): Promise<Record<string, GiftClaim>> {
    if (claimIds.length === 0) return {};
    const { data, error } = await supabase
      .from('gift_claims')
      .select('id, tier, days, claim_by, claimed_at')
      .in('id', claimIds);
    if (error) throw new Error(error.message);
    const byId: Record<string, GiftClaim> = {};
    for (const claim of (data ?? []) as GiftClaim[]) byId[claim.id] = claim;
    return byId;
  }

  /** Marks messages as seen in the app (read + opened). Never throws. */
  static async markSeen(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    try {
      await supabase.from('notifications').update({ read_at: now }).in('id', ids).is('read_at', null);
      await supabase.from('notifications').update({ opened_at: now }).in('id', ids).is('opened_at', null);
    } catch (err) {
      if (__DEV__) console.log('[Inbox] markSeen failed', err);
    }
    emitChanged();
  }

  /** A tapped push: counts the message as opened. Never throws. */
  static async markPushOpened(messageId: string): Promise<void> {
    try {
      await supabase
        .from('notifications')
        .update({ opened_at: new Date().toISOString() })
        .eq('message_id', messageId)
        .is('opened_at', null);
    } catch (err) {
      if (__DEV__) console.log('[Inbox] markPushOpened failed', err);
    }
  }

  static async claimGift(claimId: string): Promise<ClaimResult> {
    const { data, error } = await supabase.rpc('claim_gift', { p_claim_id: claimId });
    if (error) return { ok: false, error: 'UNKNOWN' };
    const result = data as { ok?: boolean; error?: string; tier?: string; days?: number; access_expires_at?: string } | null;
    if (!result?.ok) {
      return { ok: false, error: result?.error ?? 'UNKNOWN' };
    }
    return { ok: true, tier: result.tier ?? null, days: result.days ?? null, accessExpiresAt: result.access_expires_at ?? null };
  }

  static async fetchPrefs(userId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('prefs')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return ((data?.prefs as Record<string, unknown> | null) ?? {});
  }

  static async savePrefs(userId: string, prefs: Record<string, unknown>): Promise<void> {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }
}
