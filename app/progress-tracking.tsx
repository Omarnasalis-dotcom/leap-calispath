import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProgressTrackingScreen } from '../src/screens/coaching/ProgressTrackingScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <ProgressTrackingScreen 
        {...params}
      />
    </SpartanLayout>
  );
}
