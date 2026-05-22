import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BattleScreen } from '../src/screens/BattleScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const { clashId } = useLocalSearchParams<{ clashId: string }>();

  return (
    <SpartanLayout hideToggle>
      <BattleScreen
        clashId={clashId}
        onFinish={() => router.replace('/profile')}
      />
    </SpartanLayout>
  );
}
