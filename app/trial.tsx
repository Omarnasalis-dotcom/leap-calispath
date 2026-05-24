import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TrialScreen } from '../src/screens/TrialScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const { mode, tier } = useLocalSearchParams<{ mode: string; tier: string }>();

  return (
    <SpartanLayout hideToggle>
      <TrialScreen
        mode={(mode as 'progression' | 'practice' | 'eternal') || 'progression'}
        practiceTier={typeof tier !== 'undefined' ? parseInt(tier as string, 10) : undefined}
        onComplete={() => router.replace('/profile')}
        onBack={() => router.back()}
      />
    </SpartanLayout>
  );
}
