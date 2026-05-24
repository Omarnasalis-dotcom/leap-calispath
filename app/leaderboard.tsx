import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LeaderboardScreen } from '../src/screens/LeaderboardScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <LeaderboardScreen 
        onPracticeTier={(tier) => router.push({ pathname: '/trial', params: { tier, mode: 'practice' } })} 
        onClose={() => router.back()} 
        onStartEternal={() => router.push({ pathname: '/trial', params: { mode: 'eternal' } })} 
        {...params}
      />
    </SpartanLayout>
  );
}
