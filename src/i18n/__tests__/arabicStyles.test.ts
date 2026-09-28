import React from 'react';
import { Text } from 'react-native';
import { arabicFontFor, arabicStyle, arabicTextStyle, containsArabic } from '../arabicStyles';
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
    ['material-community', 'material-community'],
    ['Cairo-Bold', 'Cairo-Bold'],
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

describe('arabicTextStyle', () => {
  it('fixes Arabic text; English text keeps its font and spacing', () => {
    const style = { fontFamily: 'Oswald-Bold', letterSpacing: 2 };
    expect(arabicTextStyle(style, true, 'android')).toEqual({ fontFamily: 'Cairo-Bold' });
    expect(arabicTextStyle(style, false, 'android')).toEqual(style);
  });

  it('on iOS, text without an alignment gets start alignment (flipped to the right in RTL)', () => {
    expect(arabicTextStyle({ fontSize: 12 }, false, 'ios')).toEqual({ fontSize: 12, textAlign: 'left' });
    expect(arabicTextStyle({ textAlign: 'center' }, true, 'ios')).toEqual({ textAlign: 'center' });
  });
});

describe('containsArabic', () => {
  it('finds Arabic in strings, arrays and nested Text', () => {
    expect(containsArabic('HOPLITE')).toBe(false);
    expect(containsArabic(['3', ' · ', 'المستوى'])).toBe(true);
    expect(containsArabic(React.createElement(Text, null, 'مرحبا'))).toBe(true);
    expect(containsArabic(42 as unknown as React.ReactNode)).toBe(false);
  });
});
