import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClashScreen } from '../src/screens/ClashScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <ClashScreen 
        onStartBattle={(id) => router.push({ pathname: '/battle', params: { clashId: id } })} 
        onClose={() => router.back()} 
        onOpenRankings={() => router.push('/glory-leaderboard')}  
        {...params}
      />
    </SpartanLayout>
  );
}
