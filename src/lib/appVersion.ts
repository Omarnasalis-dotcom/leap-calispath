import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from './supabase';

// 'force': below app_config.minimum_version — full-screen block, no way past.
// 'soft':  below app_config.soft_minimum_version only — a "Later"-able
//          pop-up, at most once a day (SoftUpdatePrompt).
export type UpdateKind = 'force' | 'soft';

export interface ForceUpdateStatus {
  kind: UpdateKind;
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

// Which update this install needs. The force minimum always wins; a soft
// minimum at or below the force minimum never adds anything. Blank/missing
// values mean "no rule".
export function getUpdateKind(
  installed: string,
  minimum: string | null | undefined,
  softMinimum: string | null | undefined,
): UpdateKind | null {
  if (minimum && compareVersions(installed, minimum) < 0) return 'force';
  if (softMinimum && compareVersions(installed, softMinimum) < 0) return 'soft';
  return null;
}

type VersionRow = { minimum_version: string | null; soft_minimum_version?: string | null; message: string | null };

// Deliberately fails open on every error path (missing row, network
// failure, unreadable native version, unexpected exception) — this is a UX
// nudge tool, not a security gate. Letting someone through on a hiccup is
// always the safe direction; blocking everyone on a hiccup is not.
export async function checkForceUpdate(): Promise<ForceUpdateStatus | null> {
  if (Platform.OS === 'web') return null;

  try {
    let { data, error } = await supabase
      .from('app_config')
      .select('minimum_version, soft_minimum_version, message')
      .eq('platform', Platform.OS)
      .maybeSingle<VersionRow>();
    // A database without soft_minimum_version must not switch the force
    // block off too — ask again for the force fields alone.
    if (error) {
      ({ data, error } = await supabase
        .from('app_config')
        .select('minimum_version, message')
        .eq('platform', Platform.OS)
        .maybeSingle<VersionRow>());
    }

    if (error || !data) return null;

    const installedVersion = Application.nativeApplicationVersion;
    if (!installedVersion) return null;

    const kind = getUpdateKind(installedVersion, data.minimum_version, data.soft_minimum_version);
    if (!kind) return null;
    return {
      kind,
      message: data.message || 'Please update to continue.',
      storeUrl: STORE_URLS[Platform.OS] || '',
    };
  } catch {
    return null;
  }
}

// The soft pop-up shows at most once per local calendar day. `lastShownDay`
// is the YYYY-MM-DD it last showed (or null if never).
export function softPromptDue(lastShownDay: string | null, today: string): boolean {
  return lastShownDay !== today;
}

export function localDay(date: Date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// Profile's soft "update available" card: the store has a newer version
// (app_config.latest_version) than this install. Never blocks anything, so
// every error path means no card.
export async function checkUpdateAvailable(): Promise<{ version: string; storeUrl: string } | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('latest_version')
      .eq('platform', Platform.OS)
      .maybeSingle();
    const latest = (data as { latest_version?: string | null } | null)?.latest_version;
    const installed = Application.nativeApplicationVersion;
    const storeUrl = STORE_URLS[Platform.OS];
    if (error || !latest || !installed || !storeUrl) return null;
    return compareVersions(installed, latest) < 0 ? { version: latest, storeUrl } : null;
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

// Remote switch for the welcome offer screen (src/lib/offerPrompt.ts).
// Fails closed: no offer screen unless it's switched on for this platform.
export async function checkFirstTimeOfferEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('first_time_offer_enabled')
      .eq('platform', Platform.OS)
      .maybeSingle();

    if (error || !data) return false;
    return (data as { first_time_offer_enabled?: boolean }).first_time_offer_enabled === true;
  } catch {
    return false;
  }
}

// Remote switch for Live Tournament (docs/features/LIVE_TOURNAMENT_PLAN.md).
// Fails closed like the Team switch; admins see the LIVE tab regardless.
export async function checkLiveTournamentEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('live_tournament_enabled')
      .eq('platform', Platform.OS)
      .maybeSingle();

    if (error || !data) return false;
    return (data as { live_tournament_enabled?: boolean }).live_tournament_enabled === true;
  } catch {
    return false;
  }
}

// Remote switch for Team Challenge (docs/features/TEAM_CHALLENGE_PLAN.md).
// Fails closed: a network hiccup hides the Team tab rather than showing a
// feature that may not be live. Admins see it regardless (WeeklyChallengeScreen).
export async function checkTeamChallengeEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('team_challenge_enabled')
      .eq('platform', Platform.OS)
      .maybeSingle();

    if (error || !data) return false;
    return (data as { team_challenge_enabled?: boolean }).team_challenge_enabled === true;
  } catch {
    return false;
  }
}
