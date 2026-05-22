import React from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { LeapLogo } from '../src/components/LeapLogo';
import { useTheme } from '../src/contexts/ThemeContext';

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

  // Intercept new users and force them to the assessment
  if (!profile?.assessed_at) {
    return <Redirect href="/assessment" />;
  }

  return <Redirect href="/profile" />;
}
