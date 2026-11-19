import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PlanWelcomeScreen } from '../src/screens/PlanWelcomeScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const { tier, upgrade } = useLocalSearchParams<{ tier?: string; upgrade?: string }>();
  return (
    <SpartanLayout noBottomInset>
      <PlanWelcomeScreen tier={tier === 'max' ? 'max' : 'pro'} upgrade={tier === 'max' && upgrade === '1'} />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
