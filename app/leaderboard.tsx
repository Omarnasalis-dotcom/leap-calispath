import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LeaderboardScreen } from '../src/screens/LeaderboardScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useAuth } from '../src/contexts/AuthContext';

export default function Route() {
  const router = useRouter();
  const { profile } = useAuth();
  const { tier, ...rest } = useLocalSearchParams();

  const initialTier = tier ? parseInt(tier as string, 10) : undefined;

  return (
    <SpartanLayout>
      <LeaderboardScreen
        onPracticeTier={(tierNum) => {
          const mode = tierNum < (profile?.strength_tier || 0) ? 'practice' : 'progression';
          router.push({ pathname: '/trial', params: { tier: tierNum, mode } });
        }}
        onClose={() => router.back()}
        onStartEternal={() => router.push({ pathname: '/trial', params: { mode: 'eternal' } })}
        initialTier={initialTier}
      />
    </SpartanLayout>
  );
}
