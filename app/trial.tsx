import React from 'react';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { TrialScreen } from '../src/screens/TrialScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useReturnTo } from '../src/hooks/useReturnTo';

export default function Route() {
  const router = useRouter();
  const { mode, tier } = useLocalSearchParams<{ mode: string; tier: string }>();
  const { returnTo, goBackOrReturnTo } = useReturnTo();

  return (
    <SpartanLayout hideToggle>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <TrialScreen
        mode={(mode as 'progression' | 'practice' | 'eternal') || 'progression'}
        practiceTier={typeof tier !== 'undefined' ? parseInt(tier as string, 10) : undefined}
        onComplete={() => (returnTo === 'journey' ? router.replace('/my-journey') : router.replace('/profile'))}
        onBack={() => goBackOrReturnTo('/')}
      />
    </SpartanLayout>
  );
}
