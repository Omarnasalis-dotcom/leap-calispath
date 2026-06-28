import React from 'react';
import { useRouter } from 'expo-router';
import { CoachingHubScreen } from '../src/screens/coaching/CoachingHubScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();

  return (
    <SpartanLayout>
      <CoachingHubScreen onClose={() => router.back()} />
    </SpartanLayout>
  );
}
