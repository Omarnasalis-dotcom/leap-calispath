import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments, Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

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
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { TutorialProvider } from '../src/contexts/TutorialContext';
import { useStealthFonts } from '../hooks/useFonts';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { LeapLogo } from '../src/components/LeapLogo';
import { TutorialOverlay } from '../src/components/tutorial/TutorialOverlay';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GlobalErrorBoundary } from '../src/components/GlobalErrorBoundary';

// Auth Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading, needsPasswordReset } = useAuth();
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
        <LeapLogo size={120} animated />
      </View>
    );
  }

  // 1. Wait for profile to load in the background if logged in
  if (user && !profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
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
    'power-world': 6
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

export default function RootLayout() {
  const fontsLoaded = useStealthFonts();

  if (!fontsLoaded) {
    // Return null because the native splash screen is covering the view
    return null;
  }

  return (
    <SafeAreaProvider>
      <GlobalErrorBoundary>
        <ThemeProvider>
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
            <StatusBar style="auto" />
          </AuthProvider>
        </ThemeProvider>
      </GlobalErrorBoundary>
    </SafeAreaProvider>
  );
}
