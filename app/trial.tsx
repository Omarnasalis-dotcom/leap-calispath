import React from 'react';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { TrialScreen } from '../src/screens/TrialScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useReturnTo } from '../src/hooks/useReturnTo';

export default function Route() {
  const router = useRouter();
  const { mode, tier } = useLocalSearchParams<{ mode: string; tier: string }>();
  const { returnTo, goBackOrReturnTo, completeQuestAndReturn } = useReturnTo();

  return (
    <SpartanLayout hideToggle>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <TrialScreen
        mode={(mode as 'progression' | 'practice' | 'eternal') || 'progression'}
        practiceTier={typeof tier !== 'undefined' ? parseInt(tier as string, 10) : undefined}
        // TrialScreen's onComplete only ever fires from a genuine pass (the
        // RankUpReveal/showVictory branch) -- previously just replaced to
        // '/my-journey' directly, which never told the lane the Strength
        // Trial slot was actually resolved (no questSlotKey, no
        // completeQuestAndReturn), so the trial card stayed 'active'
        // forever even after really completing it. completeQuestAndReturn
        // is a no-op (returns false) when not reached via the journey
        // lane's own questSlotKey param, so the plain '/profile' fallback
        // below still covers every other entry point.
        onComplete={() => {
          if (!completeQuestAndReturn()) {
            router.replace(returnTo === 'journey' ? '/my-journey' : '/profile');
          }
        }}
        onBack={() => goBackOrReturnTo('/')}
      />
    </SpartanLayout>
  );
}
