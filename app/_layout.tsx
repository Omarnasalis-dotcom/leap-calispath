import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments, Redirect } from 'expo-router';
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

  useEffect(() => {
    if (loading || hasSeenOnboarding === null) return;
    if (user && !profile) return;

    // Auth and Onboarding state is resolved. We can now hide the native splash screen.
    if (!isSplashHidden) {
      SplashScreen.hideAsync().catch(() => {});
      isSplashHidden = true;
    }
  }, [user, profile, loading, hasSeenOnboarding]);

  if (loading || hasSeenOnboarding === null) {
    // Return null because the native splash screen is covering the view
    return null;
  }

  // 1. Wait for profile to load in the background if logged in
  if (user && !profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <LeapLogo size={40} animated />
      </View>
    );
  }

  const inAuthGroup = segments[0] === 'auth' || segments[0] === 'reset-password';
  const inOnboarding = segments[0] === 'onboarding';
  const inAssessmentGroup = segments[0] === 'assessment' || segments[0] === 'assessment-gate';

  // 2. Prevent rendering children and redirect when a password reset is required
  if (needsPasswordReset) {
    if (segments[0] !== 'reset-password') {
      return <Redirect href="/reset-password" />;
    }
  }

  // 3. Prevent rendering children and redirect for unauthenticated users accessing locked routes
  if (!user) {
    if (!hasSeenOnboarding && !inOnboarding) {
      return <Redirect href="/onboarding" />;
    }
    if (hasSeenOnboarding && !inAuthGroup) {
      return <Redirect href="/auth" />;
    }
  } else {
    // 4. Prevent rendering children and redirect unassessed users to assessment
    if (!profile?.assessed_at) {
      if (!inAssessmentGroup) {
        return <Redirect href="/assessment" />;
      }
    } else {
      // 5. Prevent rendering children and redirect assessed users away from onboarding/auth/assessment routes
      if (inAssessmentGroup || inAuthGroup || inOnboarding) {
        return <Redirect href="/" />;
      }
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
