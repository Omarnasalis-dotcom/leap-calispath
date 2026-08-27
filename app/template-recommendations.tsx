import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WorkoutLibraryScreen } from '../src/screens/WorkoutLibraryScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();

  return (
    <SpartanLayout>
      <WorkoutLibraryScreen onClose={() => router.back()} initialTab={tab} />
    </SpartanLayout>
  );
}
