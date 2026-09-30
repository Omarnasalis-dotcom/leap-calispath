import React from 'react';
import { useRouter } from 'expo-router';
import { WeeklyChallengeScreen } from '../src/screens/WeeklyChallengeScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  
  return (
    <SpartanLayout hideToggle noBottomInset>
      <WeeklyChallengeScreen onClose={() => router.back()} />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
