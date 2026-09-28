import { arabicFontFor, arabicStyle } from '../arabicStyles';
import en from '../locales/en';
import ar from '../locales/ar';

describe('arabicFontFor', () => {
  it.each([
    ['BarlowCondensed-ExtraBold', 'Cairo-ExtraBold'],
    ['BarlowCondensed-Bold', 'Cairo-Bold'],
    ['BarlowCondensed-SemiBold', 'Cairo-SemiBold'],
    ['BarlowCondensed-Medium', 'Cairo-Medium'],
    ['Barlow-Regular', 'Cairo-Regular'],
    ['PlusJakartaSans-Light', 'Cairo-Light'],
    ['Oswald-Bold', 'Cairo-Bold'],
    ['Orbitron_900Black', 'Cairo-ExtraBold'],
    ['Orbitron_700Bold', 'Cairo-Bold'],
    ['monospace', 'monospace'],
  ])('%s -> %s', (from, to) => {
    expect(arabicFontFor(from)).toBe(to);
  });
});

describe('arabicStyle', () => {
  it('drops letterSpacing and swaps the font, keeping everything else', () => {
    expect(arabicStyle({ fontSize: 14, letterSpacing: 2, fontFamily: 'PlusJakartaSans-Bold', color: 'red' })).toEqual({
      fontSize: 14,
      fontFamily: 'Cairo-Bold',
      color: 'red',
    });
  });

  it('returns styles without text settings unchanged', () => {
    const style = { flex: 1, padding: 4 };
    expect(arabicStyle(style)).toBe(style);
  });
});

describe('translations', () => {
  const keys = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));

  it('Arabic has exactly the English keys (plus Arabic-only plural forms), none empty', () => {
    const pluralForm = /_(zero|one|two|few|many|other)$/;
    const base = (k: string) => k.replace(pluralForm, '');
    // Every English key exists in Arabic, and Arabic adds nothing but plural
    // forms of English keys.
    expect(new Set(keys(ar).map(base))).toEqual(new Set(keys(en).map(base)));
    for (const key of keys(ar)) {
      const value = key.split('.').reduce<any>((o, k) => o[k], ar);
      expect(value.trim()).not.toBe('');
    }
  });
});
