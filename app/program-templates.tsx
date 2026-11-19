import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ProgramTemplatesScreen } from '../src/screens/ProgramTemplatesScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  // ?tour=1: play the screen's guide now (from the Welcome to PRO/MAX screen).
  const { tour } = useLocalSearchParams<{ tour?: string }>();
  return (
    <SpartanLayout noBottomInset>
      <ProgramTemplatesScreen startTour={tour === '1'} />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
