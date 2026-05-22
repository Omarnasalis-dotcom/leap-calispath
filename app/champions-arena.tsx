import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChampionsArenaScreen } from '../src/screens/ChampionsArenaScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <ChampionsArenaScreen 
        onClose={() => router.back()} 
        onStartArenaWorkout={(phase) => router.push({ pathname: '/arena-workout', params: { sessionId: phase.id } })}
        {...params}
      />
    </SpartanLayout>
  );
}
