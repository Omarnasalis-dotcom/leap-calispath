import React from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { TrialScreen } from '../src/screens/TrialScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useReturnTo, CURRENT_TRIAL_QUEST_SENTINEL, markCurrentTrialDone } from '../src/hooks/useReturnTo';
import { useAuth } from '../src/contexts/AuthContext';

export default function Route() {
  const { mode, tier, step } = useLocalSearchParams<{ mode: string; tier: string; step: string }>();
  const { questSlotKey, goBackOrReturnTo, completeQuestAndReturn } = useReturnTo();
  const { user } = useAuth();

  return (
    <SpartanLayout hideToggle>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <TrialScreen
        mode={(mode as 'progression' | 'practice' | 'eternal' | 'step') || 'progression'}
        practiceTier={typeof tier !== 'undefined' ? parseInt(tier as string, 10) : undefined}
        stepNumber={step === '2' ? 2 : 1}
        // TrialScreen's onComplete only ever fires from a genuine pass (the
        // RankUpReveal/showVictory branch) -- previously just replaced to
        // '/my-journey' directly, which never told the lane the Strength
        // Trial slot was actually resolved (no questSlotKey, no
        // completeQuestAndReturn), so the trial card stayed 'active'
        // forever even after really completing it. completeQuestAndReturn
        // is a no-op (returns false) when not reached via the journey
        // lane's own questSlotKey param, so the plain '/profile' fallback
        // below still covers every other entry point.
        // Started outside the lane (Strength's tier grid): go back there,
        // and leave the lane a note so its trial card still resolves.
        // A step opened from the Journey checkpoint closes it (and earns its
        // points there); from anywhere else it just goes back, paying nothing.
        onComplete={async () => {
          if (completeQuestAndReturn()) return;
          if (mode === 'step') { goBackOrReturnTo('/profile'); return; }
          if (questSlotKey === CURRENT_TRIAL_QUEST_SENTINEL && user) {
            await markCurrentTrialDone(user.id);
          }
          goBackOrReturnTo('/profile');
        }}
        onBack={() => goBackOrReturnTo('/')}
      />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
