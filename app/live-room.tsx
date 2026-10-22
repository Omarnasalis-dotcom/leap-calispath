import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { LiveRoomScreen } from '../src/screens/live/LiveRoomScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  if (!roomId) return <Redirect href="/weekly-challenge" />;

  return (
    <SpartanLayout hideToggle noBottomInset>
      <LiveRoomScreen roomId={roomId} />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
