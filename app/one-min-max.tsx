import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OneMinMaxScreen } from '../src/screens/OneMinMaxScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <OneMinMaxScreen onBack={() => router.back()} 
        {...params}
      />
    </SpartanLayout>
  );
}
