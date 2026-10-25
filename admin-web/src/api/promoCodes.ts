import { supabase } from '@/lib/supabase';

// Android promo codes (migration 20261026120000_promo_codes). The app sends a
// code to claim_promo_code and buys the Play offer the server names. Every
// read and write goes through admin RPCs; each write is in admin_audit_log.

export interface AdminPromoCode {
  code: string;
  product_id: string;
  offer_id: string;
  label: string;
  max_redemptions: number | null;
  new_customers_only: boolean;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  claimed_count: number;
  purchased_count: number;
}

export interface PromoCodeInput {
  create: boolean;
  code: string;
  product_id: string;
  offer_id: string;
  label: string;
  max_redemptions: number | null;
  new_customers_only: boolean;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

/**
 * The Play offers a code can point to: "Developer determined" offers tagged
 * rc-ignore-offer (docs/features/PRICING_AND_FIRST_TIME_OFFER_PLAN.md). Each
 * one must exist and be active in Play Console, or the app says the offer
 * isn't available.
 */
export const PROMO_OFFERS: Array<{ product_id: string; offer_id: string; label: string }> = [
  { product_id: 'pro:pro-1month', offer_id: 'pro-1month-code', label: 'Pro 1 month · 38% off × 2 months' },
  { product_id: 'pro:pro-2months', offer_id: 'pro-2months-code', label: 'Pro 2 months · 30% off × 2 periods (4 months)' },
  { product_id: 'max:max-1month', offer_id: 'max-1month-code', label: 'Max 1 month · 29% off × 2 months' },
  { product_id: 'max:max-2months', offer_id: 'max-2months-code', label: 'Max 2 months · 28% off × 2 periods (4 months)' },
  { product_id: 'first:first-1month', offer_id: 'first-1month-code', label: 'First 1 month · 29% off × 2 months' },
];

const ADMIN_ERRORS: Record<string, string> = {
  FORBIDDEN: 'Only admins can do that.',
  NOT_FOUND: 'That code no longer exists.',
  INVALID_CODE_FORMAT: 'Codes are 3–32 letters and digits (no spaces or symbols).',
  INVALID_OFFER: 'Pick an offer from the list.',
  INVALID_LIMIT: 'The limit must be 1 or more, or empty for no limit.',
  INVALID_DATES: 'The end must be after the start.',
  CODE_EXISTS: 'That code already exists. Pick another.',
  CODE_LOCKED: 'People already claimed this code, so its offer can no longer change. Switch it off and make a new code instead.',
};

function toError(error: { message: string }): Error {
  return new Error(ADMIN_ERRORS[error.message] ?? error.message);
}

export async function fetchPromoCodes(): Promise<AdminPromoCode[]> {
  const { data, error } = await supabase.rpc('admin_get_promo_codes');
  if (error) throw toError(error);
  return ((data ?? []) as AdminPromoCode[]).map((c) => ({
    ...c,
    claimed_count: Number(c.claimed_count ?? 0),
    purchased_count: Number(c.purchased_count ?? 0),
  }));
}

export async function savePromoCode(input: PromoCodeInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_upsert_promo_code', {
    p_create: input.create,
    p_code: input.code,
    p_product_id: input.product_id,
    p_offer_id: input.offer_id,
    p_label: input.label,
    p_max_redemptions: input.max_redemptions,
    p_new_customers_only: input.new_customers_only,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_is_active: input.is_active,
  });
  if (error) throw toError(error);
  return data as string;
}
