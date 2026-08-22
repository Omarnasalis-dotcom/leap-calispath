import React from 'react';
import { useRouter } from 'expo-router';
import { WorkoutLibraryScreen } from '../src/screens/WorkoutLibraryScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();

  return (
    <SpartanLayout>
      <WorkoutLibraryScreen onClose={() => router.back()} />
    </SpartanLayout>
  );
}
