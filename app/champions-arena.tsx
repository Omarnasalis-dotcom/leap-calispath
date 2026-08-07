import React from 'react';
import { useRouter } from 'expo-router';
import { ChampionsArenaScreen } from '../src/screens/ChampionsArenaScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { ArenaPhase } from '../src/services/ArenaService';

export default function Route() {
  const router = useRouter();

  return (
    <SpartanLayout noBottomInset>
      <ChampionsArenaScreen
        onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onStartArenaWorkout={(phase: ArenaPhase) =>
          router.push({ pathname: '/arena-workout', params: { sessionId: phase.id } })
        }
      />
    </SpartanLayout>
  );
}
