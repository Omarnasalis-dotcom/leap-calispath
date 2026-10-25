// "Redeem a code" (Settings → Redeem a code). Offer codes are redeemed by
// the store, never by the app: we only build the store's own redeem link
// with the code filled in. Apple: an offer code in App Store Connect; Google:
// a Play promo code tied to a "Developer determined" offer tagged
// rc-ignore-offer (docs/features/PRICING_AND_FIRST_TIME_OFFER_PLAN.md).

// App Store Connect app id, the `id=` of Apple's offer-code redeem link.
export const IOS_APP_STORE_ID = '6779574061';

export const MAX_REDEEM_CODE_LENGTH = 64;

// People paste codes from posts and messages: drop every space and line break.
export function normalizeRedeemCode(raw: string): string {
  return raw.replace(/\s+/g, '');
}

// Apple offer codes and Play promo codes are letters and digits only.
export function isValidRedeemCode(code: string): boolean {
  return code.length > 0 && code.length <= MAX_REDEEM_CODE_LENGTH && /^[A-Za-z0-9]+$/.test(code);
}

export function redeemUrl(platform: 'ios' | 'android', code: string): string {
  const c = encodeURIComponent(code);
  return platform === 'ios'
    ? `https://apps.apple.com/redeem?ctx=offercodes&id=${IOS_APP_STORE_ID}&code=${c}`
    : `https://play.google.com/redeem?code=${c}`;
}
