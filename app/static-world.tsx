import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StaticWorldScreen } from '../src/screens/StaticWorldScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <StaticWorldScreen onClose={() => router.back()}
        {...params}
      />
    </SpartanLayout>
  );
}
