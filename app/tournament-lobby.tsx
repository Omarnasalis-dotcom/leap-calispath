import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TournamentLobbyScreen } from '../src/screens/TournamentLobbyScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { TournamentStore } from '../src/lib/TournamentStore';

export default function Route() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  return (
    <SpartanLayout>
      <TournamentLobbyScreen
        sessionId={sessionId}
        onClose={() => router.back()}
        onEnterWorkout={(sid, roundConfig) => {
          TournamentStore.setRoundConfig(sid, roundConfig);
          router.push('/tournament-trial');
        }}
      />
    </SpartanLayout>
  );
}
