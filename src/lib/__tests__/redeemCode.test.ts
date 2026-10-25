import { isValidRedeemCode, normalizeRedeemCode, redeemUrl, MAX_REDEEM_CODE_LENGTH } from '../redeemCode';

describe('normalizeRedeemCode', () => {
  it('drops spaces and line breaks from a pasted code', () => {
    expect(normalizeRedeemCode('  LEAP 30\n')).toBe('LEAP30');
  });

  it('keeps the case as typed (the store decides)', () => {
    expect(normalizeRedeemCode('Leap30')).toBe('Leap30');
  });
});

describe('isValidRedeemCode', () => {
  it('accepts letters and digits', () => {
    expect(isValidRedeemCode('LEAP30')).toBe(true);
    expect(isValidRedeemCode('a1B2c3')).toBe(true);
  });

  it('rejects empty, symbols and overlong codes', () => {
    expect(isValidRedeemCode('')).toBe(false);
    expect(isValidRedeemCode('LEAP-30')).toBe(false);
    expect(isValidRedeemCode('LEAP30&x=1')).toBe(false);
    expect(isValidRedeemCode('A'.repeat(MAX_REDEEM_CODE_LENGTH))).toBe(true);
    expect(isValidRedeemCode('A'.repeat(MAX_REDEEM_CODE_LENGTH + 1))).toBe(false);
  });
});

describe('redeemUrl', () => {
  it("builds Apple's offer-code link for this app", () => {
    expect(redeemUrl('ios', 'LEAP30')).toBe('https://apps.apple.com/redeem?ctx=offercodes&id=6779574061&code=LEAP30');
  });

  it("builds Google Play's redeem link", () => {
    expect(redeemUrl('android', 'LEAP30')).toBe('https://play.google.com/redeem?code=LEAP30');
  });
});
