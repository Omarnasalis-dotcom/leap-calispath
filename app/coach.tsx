import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CoachScreen } from '../src/screens/CoachScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  // Set by CoachFab (src/components/coach/CoachFab.tsx) when a starter
  // prompt chip is tapped from the FAB's open panel — sends that prompt
  // immediately instead of showing the empty-state welcome screen.
  const { firstPrompt } = useLocalSearchParams<{ firstPrompt?: string }>();

  return (
    <SpartanLayout hideToggle>
      <CoachScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        initialPrompt={typeof firstPrompt === 'string' ? firstPrompt : undefined}
      />
    </SpartanLayout>
  );
}
