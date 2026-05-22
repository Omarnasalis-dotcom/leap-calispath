import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { RankRevealScreen } from '../src/screens/RankRevealScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useAuth } from '../src/contexts/AuthContext';

export default function Route() {
  const router = useRouter();
  const { profile } = useAuth();
  const { category } = useLocalSearchParams<{ category: string }>();

  if (!profile) {
    router.replace('/profile');
    return null;
  }

  return (
    <SpartanLayout hideToggle>
      <RankRevealScreen
        profile={profile}
        category={(category as 'strength' | 'power') || 'strength'}
        onContinue={() => router.replace('/profile')}
      />
    </SpartanLayout>
  );
}
