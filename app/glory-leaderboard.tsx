import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GloryLeaderboardScreen } from '../src/screens/GloryLeaderboardScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <GloryLeaderboardScreen onClose={() => router.back()} 
        {...params}
      />
    </SpartanLayout>
  );
}
