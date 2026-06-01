import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Keep the native splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { useStealthFonts } from '../hooks/useFonts';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { LeapLogo } from '../src/components/LeapLogo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GlobalErrorBoundary } from '../src/components/GlobalErrorBoundary';

let isSplashHidden = false;


// Auth Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, hasSeenOnboarding, needsPasswordReset } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || hasSeenOnboarding === null) return;

    // Wait for the profile to finish loading in the background if the user is logged in
    if (user && !profile) return;

    const inAuthGroup = segments[0] === 'auth' || segments[0] === 'reset-password';
    const inOnboarding = segments[0] === 'onboarding';
    
    // Auth and Onboarding state is resolved. We can now hide the native splash screen.
    if (!isSplashHidden) {
      SplashScreen.hideAsync().catch(() => {});
      isSplashHidden = true;
    }

    if (needsPasswordReset) {
      if (segments[0] !== 'reset-password') {
        router.replace('/reset-password');
      }
      return;
    }

    if (!user) {
      if (!hasSeenOnboarding && !inOnboarding) {
        router.replace('/onboarding');
      } else if (hasSeenOnboarding && !inAuthGroup) {
        router.replace('/auth');
      }
    } else {
      // Gate unassessed users and force them to complete their strength assessment
      if (!profile?.assessed_at) {
        const inAssessmentGroup = segments[0] === 'assessment' || segments[0] === 'assessment-gate';
        if (!inAssessmentGroup) {
          router.replace('/assessment');
        }
        return;
      } else {
        // Redirect already assessed users away from assessment screens
        if (segments[0] === 'assessment' || segments[0] === 'assessment-gate') {
          router.replace('/');
          return;
        }
      }

      if (inAuthGroup || inOnboarding) {
        router.replace('/');
      }
    }
  }, [user, profile, loading, hasSeenOnboarding, needsPasswordReset, segments]);

  if (loading || hasSeenOnboarding === null) {
    // Return null because the native splash screen is covering the view
    return null;
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
            <AuthGuard>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
            </AuthGuard>
            <StatusBar style="auto" />
          </AuthProvider>
        </ThemeProvider>
      </GlobalErrorBoundary>
    </SafeAreaProvider>
  );
}
