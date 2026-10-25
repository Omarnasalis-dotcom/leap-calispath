import {
  isValidRedeemCode,
  normalizeRedeemCode,
  parseClaimResult,
  playOfferTarget,
  MAX_REDEEM_CODE_LENGTH,
} from '../redeemCode';

describe('normalizeRedeemCode', () => {
  it('drops spaces and line breaks and uppercases, like the server', () => {
    expect(normalizeRedeemCode('  leap 30\n')).toBe('LEAP30');
  });
});

describe('isValidRedeemCode', () => {
  it('accepts 3–32 letters and digits', () => {
    expect(isValidRedeemCode('LEAP30')).toBe(true);
    expect(isValidRedeemCode('ABC')).toBe(true);
    expect(isValidRedeemCode('A'.repeat(MAX_REDEEM_CODE_LENGTH))).toBe(true);
  });

  it('rejects short, long, lowercase and symbol codes', () => {
    expect(isValidRedeemCode('')).toBe(false);
    expect(isValidRedeemCode('AB')).toBe(false);
    expect(isValidRedeemCode('A'.repeat(MAX_REDEEM_CODE_LENGTH + 1))).toBe(false);
    expect(isValidRedeemCode('leap30')).toBe(false);
    expect(isValidRedeemCode('LEAP-30')).toBe(false);
  });
});

describe('parseClaimResult', () => {
  it('reads a successful claim', () => {
    expect(parseClaimResult({ ok: true, code: 'LEAP30', product_id: 'pro:pro-1month', offer_id: 'pro-1month-code' }))
      .toEqual({ ok: true, code: 'LEAP30', productId: 'pro:pro-1month', offerId: 'pro-1month-code' });
  });

  it('passes known error codes through', () => {
    expect(parseClaimResult({ ok: false, error: 'CODE_USED_UP' })).toEqual({ ok: false, error: 'CODE_USED_UP' });
  });

  it('treats anything else as UNKNOWN', () => {
    expect(parseClaimResult({ ok: false, error: 'SOMETHING' })).toEqual({ ok: false, error: 'UNKNOWN' });
    expect(parseClaimResult(null)).toEqual({ ok: false, error: 'UNKNOWN' });
    expect(parseClaimResult({ ok: true })).toEqual({ ok: false, error: 'UNKNOWN' });
  });
});

describe('playOfferTarget', () => {
  it("builds RevenueCat's subscription id and option id", () => {
    expect(playOfferTarget('pro:pro-1month', 'pro-1month-code'))
      .toEqual({ subscriptionId: 'pro', optionId: 'pro-1month:pro-1month-code' });
  });

  it('rejects malformed product ids', () => {
    expect(playOfferTarget('pro', 'x')).toBeNull();
    expect(playOfferTarget('a:b:c', 'x')).toBeNull();
    expect(playOfferTarget('pro:pro-1month', '')).toBeNull();
  });
});
