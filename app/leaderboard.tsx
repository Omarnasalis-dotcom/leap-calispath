import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LeaderboardScreen } from '../src/screens/LeaderboardScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const { tier, ...rest } = useLocalSearchParams();
  
  const initialTier = tier ? parseInt(tier as string, 10) : undefined;
  
  return (
    <SpartanLayout>
      <LeaderboardScreen 
        onPracticeTier={(tierNum) => router.push({ pathname: '/trial', params: { tier: tierNum, mode: 'practice' } })} 
        onClose={() => router.back()} 
        onStartEternal={() => router.push({ pathname: '/trial', params: { mode: 'eternal' } })} 
        initialTier={initialTier}
      />
    </SpartanLayout>
  );
}
