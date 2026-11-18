import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkFirstTimeOfferEnabled } from './appVersion';

// The welcome offer screen (/welcome-offer): the store's intro offer (Pro
// 1 month) with a way to enter a code. Shown at three moments, each once:
//  - 'assessment': right after the first assessment's tier reveal
//  - 'program_complete': after finishing the last day of the free program
//  - 'banner': from Profile's gift (OfferGiftChip), which stays while the
//    store has an offer for the person
//  - 'gift_ended': the first time the app is used after a gift (or any
//    granted plan) ended, once per gift
// Only for people with no plan running who never bought one from a store
// (a gift doesn't count as buying), while the paywall and
// app_config.first_time_offer_enabled are on. The stores enforce who
// really gets the intro; this only decides when to show the screen.
// Plan: docs/features/PRICING_AND_FIRST_TIME_OFFER_PLAN.md (Part 2).

export type OfferTrigger = 'assessment' | 'program_complete' | 'banner' | 'gift_ended';

/** What this device remembers, per user (ISO dates). */
export interface OfferSeen {
  assessment?: string;
  program_complete?: string;
  /** The end date of the gift whose ending already showed the offer. */
  gift_ended?: string;
}

interface AudienceInput {
  platform: string;
  paywallEnabled: boolean;
  offerEnabled: boolean;
  profile: {
    is_admin?: boolean | null;
    is_coach?: boolean | null;
    subscription_tier?: string | null;
    access_expires_at?: string | null;
    entitlement_source?: string | null;
    rc_original_transaction_id?: string | null;
  } | null;
}

type OfferProfile = NonNullable<AudienceInput['profile']>;

const isRunning = (profile: OfferProfile, nowMs: number) =>
  !!profile.access_expires_at && new Date(profile.access_expires_at).getTime() > nowMs;

/**
 * When a gift (a plan granted by Leap, not bought) ended, or null. Only for
 * someone who never bought from a store.
 */
export function giftEndedAt(profile: OfferProfile | null | undefined, nowMs = Date.now()): string | null {
  if (!profile?.access_expires_at || profile.rc_original_transaction_id) return null;
  if (profile.entitlement_source === 'rc_subscription') return null;
  return isRunning(profile, nowMs) ? null : profile.access_expires_at;
}

/**
 * Who may see the offer at all: nothing running now, and never bought from a
 * store. Someone whose gift ended still counts as new (the stores agree).
 */
export function isOfferAudience({ platform, paywallEnabled, offerEnabled, profile }: AudienceInput, nowMs = Date.now()): boolean {
  if (platform !== 'ios' && platform !== 'android') return false;
  if (!paywallEnabled || !offerEnabled || !profile) return false;
  if (profile.is_admin === true || profile.is_coach === true) return false;
  if (profile.rc_original_transaction_id || profile.entitlement_source === 'rc_subscription') return false;
  return !isRunning(profile, nowMs);
}

/** Whether a moment should show the offer, given what was already seen. */
export function offerDue(trigger: OfferTrigger, seen: OfferSeen, endedAt: string | null = null): boolean {
  switch (trigger) {
    case 'gift_ended':
      // Once per gift: a later gift that ends shows it again.
      return !!endedAt && seen.gift_ended !== endedAt;
    case 'assessment':
      return !seen.assessment;
    case 'program_complete':
      return !seen.program_complete;
    case 'banner':
      // Profile's gift stays while the offer lasts (until the person subscribes).
      return true;
  }
}

const key = (userId: string) => `welcome_offer_seen_${userId}`;

export async function loadOfferSeen(userId: string): Promise<OfferSeen> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as OfferSeen) : {};
  } catch {
    return {};
  }
}

/** value: what to remember (the gift's end date for 'gift_ended'). */
export async function markOfferSeen(userId: string, field: keyof OfferSeen, value?: string): Promise<void> {
  try {
    const seen = await loadOfferSeen(userId);
    if (field === 'gift_ended' ? seen.gift_ended === value : seen[field]) return;
    await AsyncStorage.setItem(key(userId), JSON.stringify({ ...seen, [field]: value ?? new Date().toISOString() }));
  } catch {
    // Device storage is a convenience here: at worst the offer shows again.
  }
}

/** Reads the server switch and this device's memory; never throws. */
export async function isOfferDue(
  trigger: OfferTrigger,
  input: { userId: string | undefined } & Omit<AudienceInput, 'offerEnabled' | 'platform'>,
): Promise<boolean> {
  if (!input.userId) return false;
  const base = { platform: Platform.OS, paywallEnabled: input.paywallEnabled, profile: input.profile };
  // Cheap checks first, so most users never hit the network for this.
  if (!isOfferAudience({ ...base, offerEnabled: true })) return false;
  const [offerEnabled, seen] = await Promise.all([checkFirstTimeOfferEnabled(), loadOfferSeen(input.userId)]);
  return isOfferAudience({ ...base, offerEnabled }) && offerDue(trigger, seen, giftEndedAt(input.profile));
}

// ── Prices ──────────────────────────────────────────────────────────────

interface StorePrice {
  price: number;
  priceString: string;
  introPrice: { price: number; priceString: string; cycles: number; periodUnit: string; periodNumberOfUnits: number } | null;
}

export interface OfferPrice {
  regular: string;
  intro: string;
  /** Whole percent off, e.g. 23. */
  percentOff: number;
  /** Discounted months in total, or null when the store's period isn't in months. */
  months: number | null;
}

/** The intro offer of a store product, or null when it has none. */
export function offerPrice(product: StorePrice | null | undefined): OfferPrice | null {
  const intro = product?.introPrice;
  if (!product || !intro || !(intro.price > 0) || !(product.price > 0) || intro.price >= product.price) return null;
  const months = intro.periodUnit === 'MONTH' ? intro.cycles * intro.periodNumberOfUnits : null;
  return {
    regular: product.priceString,
    intro: intro.priceString,
    percentOff: Math.round((1 - intro.price / product.price) * 100),
    months: months && months > 0 ? months : null,
  };
}
