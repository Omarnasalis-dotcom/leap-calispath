import { StyleSheet } from 'react-native';

// Arabic-mode style fixes (audit M16), applied app-wide:
// - letterSpacing pulls apart Arabic letters that must join, so it is dropped.
// - The app's Latin fonts (Barlow, Plus Jakarta, Oswald, Orbitron) have no
//   Arabic letters; each is swapped for the Cairo weight closest to it.

export function arabicFontFor(family: string): string {
  if (family === 'monospace' || family.startsWith('Cairo-')) return family;
  if (/ExtraBold|Black|800|900/.test(family)) return 'Cairo-ExtraBold';
  if (/SemiBold|600/.test(family)) return 'Cairo-SemiBold';
  if (/Bold|700/.test(family)) return 'Cairo-Bold';
  if (/Medium|500/.test(family)) return 'Cairo-Medium';
  if (/Light|300/.test(family)) return 'Cairo-Light';
  return 'Cairo-Regular';
}

type StyleObject = Record<string, unknown>;

export function arabicStyle<T extends StyleObject>(style: T): T {
  if (!('letterSpacing' in style) && typeof style.fontFamily !== 'string') return style;
  const next: StyleObject = { ...style };
  delete next.letterSpacing;
  if (typeof next.fontFamily === 'string') next.fontFamily = arabicFontFor(next.fontFamily);
  return next as T;
}

let installed = false;

// Rewrites every StyleSheet.create() made after this runs. It has to run
// before any screen module is loaded, which is why src/i18n is imported
// first in index.js. Inline style objects are not covered; screens with
// inline text styles use arabicStyle() directly.
export function installArabicStyleSheet() {
  if (installed) return;
  installed = true;
  const originalCreate = StyleSheet.create;
  (StyleSheet as { create: typeof StyleSheet.create }).create = ((styles: Record<string, StyleObject>) => {
    const next: Record<string, StyleObject> = {};
    for (const key of Object.keys(styles)) next[key] = arabicStyle(styles[key]);
    return originalCreate(next);
  }) as typeof StyleSheet.create;
}
