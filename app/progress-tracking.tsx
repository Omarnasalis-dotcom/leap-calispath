import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProgressTrackingScreen } from '../src/screens/coaching/ProgressTrackingScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useAuth } from '../src/contexts/AuthContext';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  // Falls back to the logged-in coach's own id when not passed explicitly
  // (e.g. arriving here from a push notification deep link) — same fix as
  // app/my-clients.tsx.
  const coachId = (params.coachId as string) || user?.id;

  return (
    <SpartanLayout>
      <ProgressTrackingScreen
        coachId={coachId}
        isAdmin={params.isAdmin === 'true'}
        warriorId={params.warriorId as string | undefined}
      />
    </SpartanLayout>
  );
}
