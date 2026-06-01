import React from 'react';
import { useRouter } from 'expo-router';
import { TournamentTrialScreen } from '../src/screens/TournamentTrialScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { TournamentStore } from '../src/lib/TournamentStore';

export default function Route() {
  const router = useRouter();
  const sessionId = TournamentStore.getSessionId() ?? '';
  const roundConfig = TournamentStore.getRoundConfig();

  if (!roundConfig) {
    router.back();
    return null;
  }

  return (
    <SpartanLayout>
      <TournamentTrialScreen
        sessionId={sessionId}
        roundConfig={roundConfig}
        onClose={() => {
          TournamentStore.clear();
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/clash');
          }
        }}
      />
    </SpartanLayout>
  );
}
