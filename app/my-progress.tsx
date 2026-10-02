import React from 'react';
import { MyProgressScreen } from '../src/screens/MyProgressScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <MyProgressScreen />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
