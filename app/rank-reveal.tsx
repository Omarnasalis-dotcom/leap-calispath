import React from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { SpartanLayout } from './_layout';
import { RankRevealScreen } from '../src/screens/RankRevealScreen';

export default function RankReveal() {
  const router = useRouter();
  const { profile } = useAuth();

  if (!profile) {
    router.replace('/profile');
    return null;
  }

  return (
    <SpartanLayout>
      <RankRevealScreen
        profile={profile}
        onContinue={() => router.replace('/profile')}
      />
    </SpartanLayout>
  );
}
