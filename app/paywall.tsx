import React from 'react';
import { PaywallScreen } from '../src/screens/PaywallScreen';

export default function Route() {
  return <PaywallScreen />;
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
