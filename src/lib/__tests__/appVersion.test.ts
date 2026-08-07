import { compareVersions } from '../appVersion';

describe('appVersion', () => {
  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      expect(compareVersions('1.1.7', '1.1.7')).toBe(0);
    });

    it('returns negative when a < b', () => {
      expect(compareVersions('1.1.6', '1.1.7')).toBeLessThan(0);
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    });

    it('returns positive when a > b', () => {
      expect(compareVersions('1.1.8', '1.1.7')).toBeGreaterThan(0);
      expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    });

    // The exact bug a naive string compare would introduce — "1.10.0" must
    // beat "1.9.0" numerically even though "1" < "9" lexicographically at
    // that character position.
    it('compares double-digit segments numerically, not lexicographically', () => {
      expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
      expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    });

    it('handles differing segment counts (missing patch/minor treated as 0)', () => {
      expect(compareVersions('1.2', '1.2.0')).toBe(0);
      expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0);
      expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0);
    });
  });
});
