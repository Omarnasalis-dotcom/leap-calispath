import React from 'react';
import { Platform, StyleSheet, type TextProps } from 'react-native';

// Arabic-mode text fixes (audit M16), applied by the Text component itself
// so they reach StyleSheet and inline styles (kt(), style={{...}}) alike:
// - Text that contains Arabic letters drops letterSpacing (it pulls apart
//   letters that must join) and swaps the app's Latin fonts, which have no
//   Arabic letters, for the closest Cairo weight. English words and numbers
//   keep the original design fonts ("HOPLITE" stays in Oswald).
// - On iOS, text with no textAlign is aligned to the start (right).

// Only the app's own Latin text fonts are swapped. Anything else (icon fonts
// such as MaterialCommunityIcons, monospace) must keep its family, or the
// icons render as empty boxes.
const LATIN_TEXT_FONTS = /^(Barlow|BarlowCondensed|PlusJakartaSans|Oswald|Orbitron|BebasNeue)[-_]/;
const ARABIC_LETTERS = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function arabicFontFor(family: string): string {
  if (!LATIN_TEXT_FONTS.test(family)) return family;
  // Bebas Neue is a heavy display face with one weight.
  if (family.startsWith('BebasNeue')) return 'Cairo-ExtraBold';
  if (/ExtraBold|Black|800|900/.test(family)) return 'Cairo-ExtraBold';
  if (/SemiBold|600/.test(family)) return 'Cairo-SemiBold';
  if (/Bold|700/.test(family)) return 'Cairo-Bold';
  if (/Medium|500/.test(family)) return 'Cairo-Medium';
  if (/Light|300/.test(family)) return 'Cairo-Light';
  return 'Cairo-Regular';
}

type StyleObject = Record<string, unknown>;

// Arabic letters (Cairo) reach well above and below Latin ones, so a tight
// lineHeight tuned for Oswald/Barlow clips them (the Strength title).
const MIN_ARABIC_LINE_HEIGHT = 1.45;

export function arabicStyle<T extends StyleObject>(style: T): T {
  const next: StyleObject = { ...style };
  delete next.letterSpacing;
  if (typeof next.fontFamily === 'string') next.fontFamily = arabicFontFor(next.fontFamily);
  if (typeof next.fontSize === 'number' && typeof next.lineHeight === 'number') {
    next.lineHeight = Math.max(next.lineHeight, Math.round(next.fontSize * MIN_ARABIC_LINE_HEIGHT));
  }
  // Android: without font padding the taller glyphs are cut off.
  if (next.includeFontPadding === false) delete next.includeFontPadding;
  return next as T;
}

/** True when the text (including nested <Text> children) has Arabic letters. */
export function containsArabic(children: React.ReactNode): boolean {
  if (typeof children === 'string') return ARABIC_LETTERS.test(children);
  if (Array.isArray(children)) return children.some(containsArabic);
  if (React.isValidElement(children)) {
    return containsArabic((children.props as { children?: React.ReactNode }).children);
  }
  return false;
}

// iOS resolves "natural" alignment from the app's own language (English
// here, even with the layout forced right-to-left), so text with no
// textAlign sat on the left. React Native flips an explicit 'left' to the
// right in RTL, matching what Android already does on its own.
// Not for adjustsFontSizeToFit text: on iOS an alignment there made React
// Native shrink content-sized text to a sliver (the Strength tier name).
export function arabicTextStyle(
  style: StyleObject, hasArabic: boolean, platform = Platform.OS, fitsToWidth = false,
): StyleObject {
  const next = hasArabic ? arabicStyle(style) : style;
  if (platform === 'ios' && !fitsToWidth && next.textAlign == null) return { ...next, textAlign: 'left' };
  return next;
}

/**
 * iOS in the right-to-left (Arabic) layout shrinks single-line
 * adjustsFontSizeToFit text inside a flex row to a sliver — the Weekly
 * Challenge title and its hero stats ("—" included, so it isn't the font).
 * There it ellipsizes instead; Arabic labels are short, and a cut-off word
 * beats an unreadable one. Multi-line auto-fit text measures fine.
 */
export function singleLineFitFix(
  props: { adjustsFontSizeToFit?: boolean; numberOfLines?: number },
  platform = Platform.OS,
): { adjustsFontSizeToFit?: boolean } {
  return platform === 'ios' && props.adjustsFontSizeToFit && props.numberOfLines === 1
    ? { adjustsFontSizeToFit: false }
    : {};
}

let textInstalled = false;

// Screens import Text from 'react-native' and read it at render time, so
// replacing the export before any screen renders (src/i18n is imported first
// in index.js) covers all of them.
export function installArabicText() {
  if (textInstalled) return;
  textInstalled = true;
  // The real module object: `import * as` would give a copy, and replacing
  // Text on a copy changes nothing for the screens.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactNative = require('react-native') as typeof import('react-native');
  const OriginalText = ReactNative.Text;
  const ArabicText = React.forwardRef<React.ElementRef<typeof OriginalText>, TextProps>((props, ref) => {
    const flat = (StyleSheet.flatten(props.style) ?? {}) as StyleObject;
    const style = arabicTextStyle(flat, containsArabic(props.children), Platform.OS, !!props.adjustsFontSizeToFit);
    return React.createElement(OriginalText, { ...props, ...singleLineFitFix(props, Platform.OS), ref, style });
  });
  ArabicText.displayName = 'Text';
  Object.defineProperty(ReactNative, 'Text', { configurable: true, enumerable: true, get: () => ArabicText });
}
