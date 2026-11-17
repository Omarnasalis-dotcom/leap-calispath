import React from 'react';
import { InboxScreen } from '../src/screens/InboxScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

// Messages from the Leap team. Opened from the Profile bell or a gift push
// (the server sends data.screen = 'notifications').
export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <InboxScreen />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
