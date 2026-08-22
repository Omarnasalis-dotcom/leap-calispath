import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from './supabase';

export interface ForceUpdateStatus {
  message: string;
  storeUrl: string;
}

const STORE_URLS: Partial<Record<typeof Platform.OS, string>> = {
  ios: 'https://apps.apple.com/app/id6779574061',
  android: 'https://play.google.com/store/apps/details?id=com.leap.calispath',
};

// Numeric segment comparison, not string comparison — "1.10.0" must compare
// greater than "1.9.0", which a plain string compare would get backwards.
// Returns negative if a < b, positive if a > b, 0 if equal.
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Deliberately fails open on every error path (missing row, network
// failure, unreadable native version, unexpected exception) — this is a UX
// nudge tool, not a security gate. Letting someone through on a hiccup is
// always the safe direction; blocking everyone on a hiccup is not.
export async function checkForceUpdate(): Promise<ForceUpdateStatus | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('minimum_version, message')
      .eq('platform', Platform.OS)
      .maybeSingle();

    if (error || !data) return null;

    const installedVersion = Application.nativeApplicationVersion;
    if (!installedVersion) return null;

    if (compareVersions(installedVersion, data.minimum_version) < 0) {
      return {
        message: data.message || 'Please update to continue.',
        storeUrl: STORE_URLS[Platform.OS] || '',
      };
    }

    return null;
  } catch {
    return null;
  }
}

// Remote kill switch for Pro-feature gating (AI Coach, full Workout
// Library, etc) — see canAccessPro() in entitlement.ts. While false, every
// user gets Pro access, which is how new Pro features ship and get tested
// before enforcement actually turns on. Same fail-open philosophy as
// checkForceUpdate above, but inverted for a different reason: there it's a
// UX nudge, so failing open just means someone isn't nagged to update. Here
// failing open (i.e. returning false, gating off) is still the correct
// default, because wrongly locking Pro features for the entire user base
// over a network hiccup is a far worse outcome than a transient bug leaving
// the gate off a little longer than intended.
export async function checkPaywallEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('paywall_enabled')
      .eq('platform', Platform.OS)
      .maybeSingle();

    if (error || !data) return false;
    return data.paywall_enabled === true;
  } catch {
    return false;
  }
}
