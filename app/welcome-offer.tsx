import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { WelcomeOfferScreen } from '../src/screens/WelcomeOfferScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import type { OfferTrigger } from '../src/lib/offerPrompt';

const TRIGGERS: OfferTrigger[] = ['assessment', 'program_complete', 'banner'];

export default function Route() {
  const { trigger, preview } = useLocalSearchParams<{ trigger?: string; preview?: string }>();
  const safeTrigger = TRIGGERS.find((t) => t === trigger) ?? 'banner';
  return (
    <SpartanLayout noBottomInset>
      <WelcomeOfferScreen trigger={safeTrigger} preview={__DEV__ && preview === '1'} />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
