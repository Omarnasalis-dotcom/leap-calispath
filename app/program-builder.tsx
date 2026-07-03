import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProgramBuilderScreen } from '../src/screens/coaching/ProgramBuilderScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <ProgramBuilderScreen
        {...params}
        onClose={() => router.back()}
      />
    </SpartanLayout>
  );
}
