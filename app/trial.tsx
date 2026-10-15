import React from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { TrialScreen } from '../src/screens/TrialScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useReturnTo } from '../src/hooks/useReturnTo';

export default function Route() {
  const { mode, tier, step } = useLocalSearchParams<{ mode: string; tier: string; step: string }>();
  const { returnTo, questSlotKey, goBackOrReturnTo, completeQuestAndReturn } = useReturnTo();

  return (
    <SpartanLayout hideToggle>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <TrialScreen
        mode={(mode as 'progression' | 'practice' | 'eternal' | 'step') || 'progression'}
        practiceTier={typeof tier !== 'undefined' ? parseInt(tier as string, 10) : undefined}
        stepNumber={step === '2' ? 2 : 1}
        fromJourney={returnTo === 'journey' && !!questSlotKey}
        // onComplete fires on a genuine pass (rank-up) or a saved step. Opened
        // from the Journey trial checkpoint, it closes that checkpoint (which
        // is the only place trial and step points are earned); from anywhere
        // else (the Strength tab) it just goes back.
        onComplete={() => {
          if (completeQuestAndReturn()) return;
          goBackOrReturnTo('/profile');
        }}
        onBack={() => goBackOrReturnTo('/')}
      />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
