import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SpartanLayout } from './_layout';
import { TrialScreen } from '../src/screens/TrialScreen';

export default function Trial() {
  const router = useRouter();
  const params = useLocalSearchParams();

  return (
    <SpartanLayout>
      <TrialScreen
        mode={params.mode as 'progression' | 'practice' | 'eternal' || 'progression'}
        practiceTier={params.tier ? parseInt(params.tier as string) : null}
        onComplete={() => router.replace('/rank-reveal')}
        onAbandon={() => router.back()}
      />
    </SpartanLayout>
  );
}
