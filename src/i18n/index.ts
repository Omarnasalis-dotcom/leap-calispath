import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';
import en from './locales/en';
import ar from './locales/ar';
import { installArabicText } from './arabicStyles';
import { installPluralRules } from './pluralRules';

export type AppLanguage = 'en' | 'ar';

// Arabic is released (audit M16): it follows the phone's language and can be
// switched in Settings. Setting this to false hides it again (English only).
export const ARABIC_ENABLED = true;
export const CAN_CHOOSE_ARABIC = ARABIC_ENABLED || __DEV__;

// React Native fixes the layout direction when the app starts, so the
// language for this run is read from it: Arabic exactly when the layout is
// right-to-left. Changing language saves the choice and restarts the app
// (see language.ts).
export const currentLanguage: AppLanguage =
  Platform.OS !== 'web' && I18nManager.isRTL && CAN_CHOOSE_ARABIC ? 'ar' : 'en';
export const isArabic = currentLanguage === 'ar';

if (isArabic) installArabicText();
installPluralRules();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: currentLanguage,
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;

// The language never changes while the app is running (switching restarts
// it), so screens can call t() directly instead of the useTranslation hook.
export const t = i18n.t.bind(i18n);

// Right-to-left for this run. Most layout mirrors on its own; use this for
// what doesn't: slide animations (translateX), and arrow icons via FLIP_X.
export const isRTL = isArabic;
export const FLIP_X = isRTL ? ({ transform: [{ scaleX: -1 }] } as const) : undefined;

// "Tier 3" in English, "المستوى الثالث" in Arabic (tiers 0-9). Tier names
// themselves (Helot … Eternity) are never translated.
export function tierLevelLabel(tier: number): string {
  return tier >= 0 && tier <= 9 ? t(`tiers.level${tier}` as 'tiers.level0') : `Tier ${tier}`;
}

// Keeps a number-with-marks such as 3'00" or 1:05 in left-to-right order
// inside Arabic text, where the bidi algorithm would otherwise reverse it
// ("00'3). No-op in English.
export function ltr(text: string): string {
  return isRTL ? `\u2066${text}\u2069` : text;
}

// For overlays placed at measured screen coordinates (measureInWindow's x is
// always from the physical left edge): React Native turns `left` into the
// right-side offset in right-to-left layouts, so convert it back.
export function physicalLeft(x: number, width: number, screenWidth: number): number {
  return isRTL ? screenWidth - x - width : x;
}
