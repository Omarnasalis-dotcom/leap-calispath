import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';
import en from './locales/en';
import ar from './locales/ar';
import { installArabicStyleSheet } from './arabicStyles';
import { installPluralRules } from './pluralRules';

export type AppLanguage = 'en' | 'ar';

// Arabic stays hidden from users until every screen is translated and
// reviewed (audit M16). Development builds can already switch to it.
export const ARABIC_ENABLED = false;
export const CAN_CHOOSE_ARABIC = ARABIC_ENABLED || __DEV__;

// React Native fixes the layout direction when the app starts, so the
// language for this run is read from it: Arabic exactly when the layout is
// right-to-left. Changing language saves the choice and restarts the app
// (see language.ts).
export const currentLanguage: AppLanguage =
  Platform.OS !== 'web' && I18nManager.isRTL && CAN_CHOOSE_ARABIC ? 'ar' : 'en';
export const isArabic = currentLanguage === 'ar';

if (isArabic) installArabicStyleSheet();
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
