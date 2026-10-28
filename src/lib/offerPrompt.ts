import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkFirstTimeOfferEnabled } from './appVersion';

// The welcome offer screen (/welcome-offer): the store's intro offer (Pro
// 1 month) with a way to enter a code. Shown at three moments, each once:
//  - 'assessment': right after the first assessment's tier reveal
//  - 'program_complete': after finishing the last day of the free program
//  - 'banner': from Profile's gift (OfferGiftChip), which stays while the
//    store has an offer for the person
// Only for people who never had a paid plan, while the paywall and
// app_config.first_time_offer_enabled are on. The stores enforce who
// really gets the intro; this only decides when to show the screen.
// Plan: docs/features/PRICING_AND_FIRST_TIME_OFFER_PLAN.md (Part 2).

export type OfferTrigger = 'assessment' | 'program_complete' | 'banner';

/** What this device remembers, per user (ISO dates). */
export interface OfferSeen {
  assessment?: string;
  program_complete?: string;
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
  } | null;
}

/** Who may see the offer at all. "Never subscribed" = no plan was ever granted. */
export function isOfferAudience({ platform, paywallEnabled, offerEnabled, profile }: AudienceInput): boolean {
  if (platform !== 'ios' && platform !== 'android') return false;
  if (!paywallEnabled || !offerEnabled || !profile) return false;
  if (profile.is_admin === true || profile.is_coach === true) return false;
  return !profile.subscription_tier && !profile.access_expires_at;
}

/** Whether a moment should show the offer, given what was already seen. */
export function offerDue(trigger: OfferTrigger, seen: OfferSeen): boolean {
  switch (trigger) {
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

export async function markOfferSeen(userId: string, field: keyof OfferSeen): Promise<void> {
  try {
    const seen = await loadOfferSeen(userId);
    if (seen[field]) return;
    await AsyncStorage.setItem(key(userId), JSON.stringify({ ...seen, [field]: new Date().toISOString() }));
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
  return isOfferAudience({ ...base, offerEnabled }) && offerDue(trigger, seen);
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
