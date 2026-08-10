import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, useRouter, useSegments, useNavigationContainerRef, Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
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
  const { user, profile, loading, profileLoading, needsPasswordReset } = useAuth();
  const { theme } = useTheme();
  const segments = useSegments();
  const splashHiddenRef = useRef(false);

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
    if (user && !profile) return;

    // Auth and Onboarding state is resolved. We can now hide the native splash screen.
    if (!splashHiddenRef.current) {
      SplashScreen.hideAsync().catch(() => { });
      splashHiddenRef.current = true;
    }
  }, [user, profile, loading, profileLoading]);

  if (loading || (profileLoading && !profile)) {
    // If the native splash screen hides early in dev, this ensures they see the logo
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background.primary }}>
        <LeapLogo size={120} animated />
      </View>
    );
  }

  // 1. Wait for profile to load in the background if logged in
  if (user && !profile) {
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
