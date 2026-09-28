import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';
import { ARABIC_ENABLED, CAN_CHOOSE_ARABIC, type AppLanguage } from './index';

const LANGUAGE_KEY = 'app_language_v1';
// Remembers a restart already made for a language, so a platform that
// ignores the direction change can't restart the app over and over.
const RELOAD_GUARD_KEY = 'app_language_reload_v1';

function deviceLanguage(): AppLanguage {
  try {
    return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

// A saved choice from Settings wins; otherwise follow the phone's language.
// Until Arabic is released, only an explicit choice in a development build
// turns it on.
export async function getPreferredLanguage(): Promise<AppLanguage> {
  if (!CAN_CHOOSE_ARABIC) return 'en';
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // Fall through to the default.
  }
  return ARABIC_ENABLED ? deviceLanguage() : 'en';
}

function applyDirection(language: AppLanguage) {
  const rtl = language === 'ar';
  // Takes effect from the next start. allowRTL(false) matters for English
  // too: Android otherwise mirrors the layout on phones set to Arabic.
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}

async function restartOnce(language: AppLanguage) {
  try {
    if ((await AsyncStorage.getItem(RELOAD_GUARD_KEY)) === language) return;
    await AsyncStorage.setItem(RELOAD_GUARD_KEY, language);
    await reloadAppAsync('language direction');
  } catch {
    // Worst case the new direction applies on the next start.
  }
}

// Runs once at startup: makes the layout direction match the language,
// restarting straight away (while the splash screen is still up) when it
// doesn't.
export async function syncLanguageDirection() {
  if (Platform.OS === 'web') return;
  const language = await getPreferredLanguage();
  applyDirection(language);
  if (I18nManager.isRTL === (language === 'ar')) {
    AsyncStorage.removeItem(RELOAD_GUARD_KEY).catch(() => {});
    return;
  }
  await restartOnce(language);
}

export async function setAppLanguage(language: AppLanguage) {
  if (Platform.OS === 'web') return;
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
    await AsyncStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    // Still apply it for this device session.
  }
  applyDirection(language);
  await restartOnce(language);
}
