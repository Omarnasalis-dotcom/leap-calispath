import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, Text, TouchableOpacity } from 'react-native';
import { Stack, useRouter, useSegments, useNavigationContainerRef, Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import * as Sentry from '@sentry/react-native';

// registerNavigationContainer(ref) is called once the container mounts (see
// RootLayout below) — this instance is what actually records the
// screen-to-screen breadcrumb trail Sentry attaches to every crash report.
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

// Disabled in dev so local debugging (Fast Refresh, red-box errors, manual
// testing) never pollutes the Sentry project with noise that isn't a real
// user-facing crash — enabled is a second guard on top of only wiring the
// DSN into preview/production EAS environments, not development.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  tracesSampleRate: 1.0,
  integrations: [navigationIntegration],
});

// Foreground pushes still show a banner/sound instead of arriving silently —
// the default handler suppresses them while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android 8+ requires a channel to exist before a notification is shown, or
// it falls back to an OS-generated default with unpredictable importance
// (no guaranteed heads-up banner/sound). Runs at module scope so the channel
// exists before AuthContext's registerPushToken ever requests a token. iOS
// has no channel concept — setNotificationChannelAsync is a no-op there, so
// this doesn't need a Platform.OS guard, but skipping the call on iOS keeps
// it explicit that this line means nothing outside Android.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    lightColor: '#FF5252',
  });
}

// Keep the native splash screen visible while we fetch resources. Runs at
// module scope, so a dev Fast Refresh re-executes it against a view
// controller that's already had its splash hidden/unregistered — swallow
// that rejection the same way hideAsync() below does, instead of letting
// it surface as an uncaught promise rejection.
SplashScreen.preventAutoHideAsync().catch(() => { });

// Global guard: Strip all console logs in production to prevent data leaks.
// Includes console.error — Supabase error objects logged at call sites
// throughout the app can carry query/schema details, so this needs the
// same treatment as log/warn/info, not just the "noisy" methods.
if (!__DEV__) {
  console.log = () => { };
  console.warn = () => { };
  console.info = () => { };
  console.error = () => { };
}

import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { TutorialProvider } from '../src/contexts/TutorialContext';
import { useStealthFonts } from '../hooks/useFonts';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { LeapLogo } from '../src/components/LeapLogo';
import { TutorialOverlay } from '../src/components/tutorial/TutorialOverlay';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GlobalErrorBoundary } from '../src/components/GlobalErrorBoundary';
import { ForceUpdateScreen } from '../src/components/ForceUpdateScreen';
import { checkForceUpdate, ForceUpdateStatus } from '../src/lib/appVersion';

// Auth Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading, profileLoadFailed, refreshProfile, needsPasswordReset } = useAuth();
  const { theme } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const splashHiddenRef = useRef(false);
  const initialDeepLinkHandledRef = useRef(false);
  // Caches the one native bridge call to Linking.getInitialURL() across
  // however many times this effect's body re-runs while waiting on
  // sign-in — undefined means "not fetched yet", null means "fetched, no
  // launch URL".
  const pendingDeepLinkUrlRef = useRef<string | null | undefined>(undefined);
  // Same singleton ref expo-router's own NavigationContainer is mounted
  // against (this hook returns expo-router's internal shared ref, not a new
  // one) — used below to read the actually-mounted route synchronously,
  // right before deciding whether to navigate. useSegments() is a reactive
  // hook one abstraction layer removed from the real navigation state and
  // isn't guaranteed to have caught up to expo-router's own automatic
  // linking resolution by the time this async check runs, which is what let
  // the previous version of this fix still occasionally double-navigate.
  const navigationRef = useNavigationContainerRef();

  // Same class of problem AuthContext's reset-password handling already
  // works around: on a cold start, AuthGuard renders a plain loading view
  // (not the real <Stack>) for the first several frames while auth/profile
  // state resolves — any real-world delay there (a cold network connection,
  // most commonly) is enough for expo-router's automatic initial-URL
  // handling to have already given up by the time the Stack finally mounts,
  // silently dropping the deep link and landing on the default route
  // instead. Replay it explicitly once state has settled and it's actually
  // safe to land there (authenticated, assessed — same gate the normal
  // redirect logic below would apply anyway).
  useEffect(() => {
    if (initialDeepLinkHandledRef.current) return;
    if (Platform.OS === 'web') return;
    if (loading || profileLoading) return;
    if (user && !profile) return;

    async function checkDeepLink() {
      if (pendingDeepLinkUrlRef.current === undefined) {
        pendingDeepLinkUrlRef.current = await Linking.getInitialURL().catch(() => null);
      }
      const url = pendingDeepLinkUrlRef.current;

      // A bare `scheme://paywall` URL parses "paywall" into the hostname
      // slot, not path (standard scheme://host/path URL structure) — a
      // strict field check on either one alone is brittle across the
      // various shapes a deep link can arrive in. Matching AuthContext's
      // existing reset-password handler's approach: a plain substring check
      // on the raw URL, which is robust regardless of how it parses.
      if (!url || !url.includes('paywall')) {
        // Nothing to ever replay — safe to lock this permanently.
        initialDeepLinkHandledRef.current = true;
        return;
      }

      // There's a pending paywall deep link, but nobody's signed in yet
      // (e.g. cold-launched via the link while logged out). Don't lock the
      // ref yet — leave this effect eligible to re-run once sign-in
      // completes, so the original intent survives instead of being
      // silently dropped the moment `loading`/`profileLoading` happened to
      // settle before auth did.
      if (!user || !profile?.assessed_at) return;

      initialDeepLinkHandledRef.current = true;

      // Only replay if expo-router's own automatic handling hasn't already
      // landed here on its own — it isn't guaranteed to drop the URL, just
      // unreliable, and re-navigating to a route that's already the actual
      // mounted screen forces PaywallScreen to remount, firing a second
      // RevenueCatUI.presentPaywall() on top of the first.
      // Cast past the strict ParamList-derived route type — this project
      // doesn't augment ReactNavigation.RootParamList, so TS narrows
      // getCurrentRoute() to `never` for .name even though it's a plain
      // string at runtime.
      const currentRouteName = (navigationRef.getCurrentRoute() as { name?: string } | undefined)?.name;
      if (currentRouteName !== 'paywall') {
        router.replace('/paywall');
      }
    }

    checkDeepLink();
  }, [loading, profileLoading, user, profile, router, navigationRef]);

  if (__DEV__) {
    console.log('[AuthGuard Diagnostic]', {
      segments,
      userId: user?.id,
      profileLoaded: !!profile,
      assessedAt: profile?.assessed_at,
      loading,
      needsPasswordReset
    });
  }

  useEffect(() => {
    if (loading || profileLoading) return;
    // A failed load still needs the native splash released — otherwise the
    // retry UI below is stuck behind it and never actually becomes visible.
    if (user && !profile && !profileLoadFailed) return;

    // Auth and Onboarding state is resolved. We can now hide the native splash screen.
    if (!splashHiddenRef.current) {
      SplashScreen.hideAsync().catch(() => { });
      splashHiddenRef.current = true;
    }
  }, [user, profile, loading, profileLoading, profileLoadFailed]);

  if (loading || (profileLoading && !profile)) {
    // If the native splash screen hides early in dev, this ensures they see the logo
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background.primary }}>
        <LeapLogo size={120} animated />
      </View>
    );
  }

  // 1. Wait for profile to load in the background if logged in. If the fetch
  // itself failed (network hiccup on a cold launch, most commonly), don't
  // spin forever on a profile that's never coming — offer a retry instead.
  if (user && !profile) {
    if (profileLoadFailed) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32, backgroundColor: theme.background.primary }}>
          <LeapLogo size={120} animated={false} />
          <Text style={{ color: theme.text.secondary, textAlign: 'center' }}>
            Couldn't load your profile. Check your connection and try again.
          </Text>
          <TouchableOpacity
            onPress={() => refreshProfile()}
            style={{ paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: theme.text.secondary }}
          >
            <Text style={{ color: theme.text.primary, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background.primary }}>
        <LeapLogo size={120} animated />
      </View>
    );
  }

  const inAuthGroup = segments[0] === 'auth' || segments[0] === 'reset-password';
  const inOnboarding = segments[0] === 'onboarding';
  const inAssessmentGroup = segments[0] === 'assessment' || segments[0] === 'assessment-gate';
  const inCompleteProfile = segments[0] === 'complete-profile';
  const isResetPassword = segments[0] === 'reset-password';

  // 2. Prevent rendering children and redirect when a password reset is required
  if (needsPasswordReset) {
    if (segments[0] !== 'reset-password') {
      return <Redirect href="/reset-password" />;
    }
  }

  // 3. Prevent rendering children and redirect for unauthenticated users accessing locked routes
  if (!user) {
    if (!inAuthGroup) {
      return <Redirect href="/auth" />;
    }
  } else {
    // 4. Force first-time social sign-ins to pick a username before anything else.
    // Email/password signup always sets display_name during signUp(), so this
    // only ever fires for a Google/Apple sign-in that just created its profile row.
    if (!profile?.display_name) {
      if (!inCompleteProfile) {
        return <Redirect href="/complete-profile" />;
      }
    } else if (inCompleteProfile) {
      return <Redirect href="/" />;
    } else if (!profile?.assessed_at) {
      // 5. Prevent rendering children and redirect unassessed users to assessment
      if (!inAssessmentGroup) {
        return <Redirect href="/assessment" />;
      }
    } else {
      // 6. Prevent rendering children and redirect assessed users away from onboarding/auth/assessment routes.
      // reset-password is deliberately excluded: it must stay reachable regardless of
      // whatever session happens to already exist (a stale cached session, or the
      // transient USER_UPDATED event fired mid-flow by updateUser() during the reset
      // itself) — otherwise this redirect fires before the reset flow ever completes.
      if (inAssessmentGroup || (inAuthGroup && !isResetPassword) || inOnboarding) {
        return <Redirect href="/" />;
      }
    }
  }

  // 7. Enforce strength tier gates for locked worlds (Static, Clash, Power, Champions)
  const strengthTier = profile?.strength_tier || 0;
  const tierLocks: Record<string, number> = {
    'static-world': 1,
    'power-world': 6,
    // champions-arena is open to everyone as a spectator (leaderboard/phase
    // preview) below tier 9 — ChampionsArenaScreen itself swaps the "START
    // ARENA TRIAL" button for a locked pill when strength_tier < 9. Only the
    // actual workout route stays hard-gated.
    'arena-workout': 9
  };
  const currentRoute = segments[0];
  if (user && profile?.assessed_at && currentRoute && tierLocks[currentRoute] !== undefined) {
    if (strengthTier < tierLocks[currentRoute]) {
      return <Redirect href="/" />;
    }
  }

  // 8. Block coaching/admin routes from non-admin, non-coach users
  const coachingRoutes = [
    'coaching-hub',
    'my-clients',
    'client-dashboard',
    'program-builder',
    'progress-tracking'
  ];
  if (user && profile?.assessed_at && currentRoute && coachingRoutes.includes(currentRoute)) {
    const isAdmin = profile?.is_admin === true;
    const isCoach = profile?.is_coach === true || isAdmin;
    if (!isCoach) {
      return <Redirect href="/" />;
    }
  }

  return children;
}

function RootLayout() {
  const fontsLoaded = useStealthFonts();
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const [forceUpdate, setForceUpdate] = useState<ForceUpdateStatus | null>(null);

  useEffect(() => {
    checkForceUpdate().then(setForceUpdate);
  }, []);

  useEffect(() => {
    navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    function handleNotificationResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const screen = data?.screen;
      if (typeof screen !== 'string') return;

      // Forward every other string field in the payload (warriorId, etc.) as
      // a query param — the target route reads them via useLocalSearchParams,
      // same as any other in-app navigation to that screen.
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(data ?? {})) {
        if (key !== 'screen' && typeof value === 'string') {
          query.set(key, value);
        }
      }
      const queryString = query.toString();
      router.push(`/${screen}${queryString ? `?${queryString}` : ''}` as never);
    }

    // Cold start: the app was launched by tapping a notification. The
    // listener below only fires for taps that happen while it's already
    // registered (foreground/backgrounded) — it never sees the tap that
    // actually launched the app, so that case falls through to the normal
    // index.tsx redirect (e.g. /profile) instead of the intended screen.
    // getLastNotificationResponseAsync() is the documented way to recover
    // that specific response; clear it after handling so a later, unrelated
    // app open doesn't replay the same navigation.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
        Notifications.clearLastNotificationResponseAsync();
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => subscription.remove();
  }, [router]);

  if (!fontsLoaded) {
    // Return null because the native splash screen is covering the view
    return null;
  }

  return (
    <SafeAreaProvider>
      <GlobalErrorBoundary>
        <ThemeProvider>
          {forceUpdate ? (
            // ForceUpdateScreen renders LeapLogo, which calls useTheme() —
            // it still needs ThemeProvider even though it deliberately skips
            // AuthProvider/TutorialProvider (nothing below this screen ever
            // needs auth or tutorial state; it's a full-screen block, not a
            // normal app screen).
            <ForceUpdateScreen message={forceUpdate.message} storeUrl={forceUpdate.storeUrl} />
          ) : (
            <AuthProvider>
              <TutorialProvider>
                <View style={{ flex: 1 }}>
                  <AuthGuard>
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
                      <Stack.Screen name="trial" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
                      <Stack.Screen name="profile" options={{ animation: 'none' }} />
                      <Stack.Screen name="power-world" options={{ animation: 'none' }} />
                      <Stack.Screen name="static-world" options={{ animation: 'none' }} />
                      <Stack.Screen name="one-min-max" options={{ animation: 'none' }} />
                    </Stack>
                  </AuthGuard>
                  <TutorialOverlay />
                </View>
              </TutorialProvider>
            </AuthProvider>
          )}
        </ThemeProvider>
      </GlobalErrorBoundary>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
