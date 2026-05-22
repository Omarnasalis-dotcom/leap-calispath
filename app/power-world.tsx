import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PowerWorldScreen } from '../src/screens/PowerWorldScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <PowerWorldScreen onBack={() => router.back()} 
        {...params}
      />
    </SpartanLayout>
  );
}
