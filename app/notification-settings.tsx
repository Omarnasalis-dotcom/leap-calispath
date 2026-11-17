import React from 'react';
import { NotificationSettingsScreen } from '../src/screens/NotificationSettingsScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

// Settings > Notifications.
export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <NotificationSettingsScreen />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
