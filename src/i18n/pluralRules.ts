// Hermes (React Native's JS engine) has no Intl.PluralRules, and without it
// i18next treats every language as English (one/other). The app only needs
// English and Arabic, so this installs a minimal version of just those two
// rules (CLDR cardinal rules, whole numbers) when the engine lacks it.

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export function arabicPlural(n: number): PluralCategory {
  const mod100 = Math.abs(Math.trunc(n)) % 100;
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
}

export function englishPlural(n: number): PluralCategory {
  return n === 1 ? 'one' : 'other';
}

class MinimalPluralRules {
  private readonly arabic: boolean;
  constructor(locale?: string | string[]) {
    const code = (Array.isArray(locale) ? locale[0] : locale) ?? 'en';
    this.arabic = code.toLowerCase().startsWith('ar');
  }
  select(n: number): PluralCategory {
    return this.arabic ? arabicPlural(n) : englishPlural(n);
  }
  resolvedOptions() {
    return {
      locale: this.arabic ? 'ar' : 'en',
      pluralCategories: this.arabic
        ? (['zero', 'one', 'two', 'few', 'many', 'other'] as PluralCategory[])
        : (['one', 'other'] as PluralCategory[]),
    };
  }
}

export function installPluralRules() {
  const intl = (globalThis as { Intl?: Record<string, unknown> }).Intl;
  if (!intl || typeof intl.PluralRules === 'function') return;
  intl.PluralRules = MinimalPluralRules;
}
