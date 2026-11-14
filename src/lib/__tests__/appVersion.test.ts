import { compareVersions, getUpdateKind, localDay, softPromptDue } from '../appVersion';

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

  describe('getUpdateKind', () => {
    it('forces below the force minimum, even when a soft minimum is set', () => {
      expect(getUpdateKind('1.2.3', '1.2.16', '1.2.19')).toBe('force');
    });

    it('asks softly between the two minimums', () => {
      expect(getUpdateKind('1.2.16', '1.2.16', '1.2.19')).toBe('soft');
      expect(getUpdateKind('1.2.18', '1.2.3', '1.2.19')).toBe('soft');
    });

    it('does nothing at or above the soft minimum', () => {
      expect(getUpdateKind('1.2.19', '1.2.16', '1.2.19')).toBeNull();
      expect(getUpdateKind('1.3.0', '1.2.16', '1.2.19')).toBeNull();
    });

    it('treats a missing or blank minimum as no rule', () => {
      expect(getUpdateKind('1.0.0', null, null)).toBeNull();
      expect(getUpdateKind('1.0.0', '', undefined)).toBeNull();
      expect(getUpdateKind('1.0.0', null, '1.2.19')).toBe('soft');
      expect(getUpdateKind('1.0.0', '1.2.3', null)).toBe('force');
    });

    it('a soft minimum at or below the force minimum adds nothing', () => {
      expect(getUpdateKind('1.2.10', '1.2.10', '1.2.5')).toBeNull();
    });
  });

  describe('softPromptDue', () => {
    it('shows when never shown, or last shown on another day', () => {
      expect(softPromptDue(null, '2026-11-13')).toBe(true);
      expect(softPromptDue('2026-11-12', '2026-11-13')).toBe(true);
    });

    it('stays quiet for the rest of the same day', () => {
      expect(softPromptDue('2026-11-13', '2026-11-13')).toBe(false);
    });

    it('localDay pads month and day', () => {
      expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    });
  });
});
