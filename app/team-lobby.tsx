import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { TeamLobbyScreen } from '../src/screens/team/TeamLobbyScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();
  if (!teamId) return <Redirect href="/weekly-challenge" />;

  return (
    <SpartanLayout hideToggle noBottomInset>
      <TeamLobbyScreen teamId={teamId} />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
