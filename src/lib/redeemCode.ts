// "Redeem a code" (Settings → Redeem a Code).
// iOS: Apple's own offer codes, typed into Apple's sheet; nothing here.
// Android: Leap's own codes (Google Play promo codes can only give a free
// trial). claim_promo_code checks the code and answers with the Play offer
// to buy; the offers are "Developer determined" + tagged rc-ignore-offer, so
// they only reach people with a code. Migration 20261026120000_promo_codes.

// Same rule as the promo_codes.code check: 3–32 letters and digits.
export const MIN_REDEEM_CODE_LENGTH = 3;
export const MAX_REDEEM_CODE_LENGTH = 32;

// People paste codes from posts and messages: drop spaces and line breaks.
// Stored uppercase on the server.
export function normalizeRedeemCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidRedeemCode(code: string): boolean {
  return /^[A-Z0-9]+$/.test(code) && code.length >= MIN_REDEEM_CODE_LENGTH && code.length <= MAX_REDEEM_CODE_LENGTH;
}

export type ClaimError =
  | 'NOT_SIGNED_IN'
  | 'TOO_MANY_ATTEMPTS'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'CODE_USED_UP'
  | 'ALREADY_SUBSCRIBED'
  | 'NEW_CUSTOMERS_ONLY';

export type ClaimResult =
  | { ok: true; code: string; productId: string; offerId: string }
  | { ok: false; error: ClaimError | 'UNKNOWN' };

const CLAIM_ERRORS: ClaimError[] = [
  'NOT_SIGNED_IN', 'TOO_MANY_ATTEMPTS', 'INVALID_CODE', 'CODE_EXPIRED',
  'CODE_USED_UP', 'ALREADY_SUBSCRIBED', 'NEW_CUSTOMERS_ONLY',
];

// The RPC's jsonb answer, checked field by field.
export function parseClaimResult(data: unknown): ClaimResult {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === true && typeof d.product_id === 'string' && typeof d.offer_id === 'string') {
    return { ok: true, code: String(d.code ?? ''), productId: d.product_id, offerId: d.offer_id };
  }
  const error = CLAIM_ERRORS.find((e) => e === d.error);
  return { ok: false, error: error ?? 'UNKNOWN' };
}

// RevenueCat names a Play product "<subscription>:<base plan>" and an offer
// option "<base plan>:<offer>".
export function playOfferTarget(productId: string, offerId: string): { subscriptionId: string; optionId: string } | null {
  const [subscriptionId, basePlanId, ...rest] = productId.split(':');
  if (!subscriptionId || !basePlanId || rest.length > 0 || !offerId) return null;
  return { subscriptionId, optionId: `${basePlanId}:${offerId}` };
}
