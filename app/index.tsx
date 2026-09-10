import React from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { LeapLogo } from '../src/components/LeapLogo';
import { useTheme } from '../src/contexts/ThemeContext';
import { consumePostOnboardingDestination } from '../src/lib/postOnboardingDestination';

export default function Index() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();

  // Handle the race condition where AuthGuard unblocks but profile hasn't loaded
  if (user && !profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme?.background?.primary || '#000' }}>
        <LeapLogo size={40} animated />
      </View>
    );
  }

  // Intercept new/incomplete-onboarding users and send them to the Milestone
  // Lane — same combined condition as AuthGuard's own rule 5/5b in
  // app/_layout.tsx (assessed_at then onboarding_completed_at). Keeping this
  // in sync with AuthGuard matters: this screen's own decision, not just
  // AuthGuard's, is what a user's very first post-signup navigation lands on.
  if (!profile?.assessed_at || !profile?.onboarding_completed_at) {
    return <Redirect href="/onboarding-journey" />;
  }

  // Almost always null (the default/normal case) -- only set, briefly, by
  // the Program Ready celebration's Start Program choice, right before it
  // flips onboarding_completed_at. See postOnboardingDestination.ts for why
  // this is a synchronous in-memory signal rather than an imperative
  // router.replace() or an AsyncStorage flag.
  const dest = consumePostOnboardingDestination();
  return <Redirect href={dest ?? '/profile'} />;
}
