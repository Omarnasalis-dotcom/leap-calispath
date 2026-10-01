import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from './supabase';

// First-party product analytics (audit 2026-09-25, M5/M18): events go to the
// app_events table in this project's own Supabase — no third-party SDK. Most
// of the funnel is derived server-side from existing data (see
// admin_get_growth_analytics); these events cover only what nothing else
// records. Read in admin-web's Growth page.
export type AnalyticsEvent =
  | 'app_opened'
  | 'complete_profile_viewed'
  | 'complete_profile_error'
  | 'paywall_viewed'
  | 'purchase_completed'
  | 'purchase_restored'
  | 'purchase_cancelled'
  | 'paywall_failed'
  | 'ai_coach_opened'
  | 'welcome_intro_completed'
  | 'welcome_intro_skipped';

// Fire-and-forget: never throws, never blocks the UI, and does nothing
// without a signed-in session (the table only accepts a user's own events).
export function track(event: AnalyticsEvent, properties: Record<string, string | number | boolean | null> = {}): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await supabase.from('app_events').insert({
        event,
        properties,
        platform: Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : null,
        app_version: Application.nativeApplicationVersion ?? null,
      });
    } catch {
      // Analytics must never affect the app.
    }
  })();
}

// app_opened at most once per 30 minutes per app process, so foreground
// flicker (permission prompts, the purchase sheet) isn't counted as opens.
const APP_OPEN_MIN_GAP_MS = 30 * 60 * 1000;
let lastAppOpenAt = 0;
export function trackAppOpened(): void {
  const now = Date.now();
  if (now - lastAppOpenAt < APP_OPEN_MIN_GAP_MS) return;
  lastAppOpenAt = now;
  track('app_opened');
}
