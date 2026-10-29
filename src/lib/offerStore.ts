import { Platform } from 'react-native';
import Purchases, { INTRO_ELIGIBILITY_STATUS } from 'react-native-purchases';
import { isOfferDue, offerPrice, type OfferPrice } from './offerPrompt';

// The plan the welcome offer features: the tiers_2026 offering's Pro 1 month package.
export const FEATURED_PACKAGE = 'pro_1month';

// Dev builds only (Settings → Preview welcome offer, and the upgrade pop-up):
// sample prices, to check the layout before the store has a live offer.
export const PREVIEW_PRICE: OfferPrice = { regular: 'E£1,299.00', intro: 'E£999.99', percentOff: 23, months: 2 };

// Store answers are kept for a few minutes, per RevenueCat user, so the
// Profile gift doesn't ask Apple again on every visit. Errors aren't kept.
const CACHE_MS = 10 * 60 * 1000;
let cache: { userId: string; at: number; price: OfferPrice | null } | null = null;

/** Test hook: forget the kept answer. */
export function clearOfferCache(): void {
  cache = null;
}

// The featured plan's intro offer for this account, or null when the store
// has none for them (none set up, not started yet, or used before).
export async function loadOffer(): Promise<OfferPrice | null> {
  const userId = await Purchases.getAppUserID();
  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_MS) return cache.price;
  const price = await fetchOffer();
  cache = { userId, at: Date.now(), price };
  return price;
}

async function fetchOffer(): Promise<OfferPrice | null> {
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find((p) => p.identifier === FEATURED_PACKAGE);
  const price = offerPrice(pkg?.product);
  if (!price || !pkg) return null;
  // iOS knows upfront whether Apple would give the intro; Android only
  // returns offers the account can get.
  if (Platform.OS === 'ios') {
    const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility([pkg.product.identifier]);
    if (eligibility[pkg.product.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE) {
      return null;
    }
  }
  return price;
}

// Where to send the person for this moment, or null to show nothing: the
// moment is due for them and the store really has an offer. A store error
// counts as no offer. Dev builds open the sample preview when the store has
// none yet, so the moment can be checked before an offer goes live.
export async function offerRoute(...args: Parameters<typeof isOfferDue>): Promise<string | null> {
  const [trigger] = args;
  if (!(await isOfferDue(...args))) return null;
  const price = await loadOffer().catch(() => null);
  if (price) return `/welcome-offer?trigger=${trigger}`;
  return __DEV__ ? `/welcome-offer?trigger=${trigger}&preview=1` : null;
}
