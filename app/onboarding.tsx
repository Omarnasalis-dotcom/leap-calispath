import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingScreen } from '../src/screens/OnboardingScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <OnboardingScreen 
        {...params}
      />
    </SpartanLayout>
  );
}
