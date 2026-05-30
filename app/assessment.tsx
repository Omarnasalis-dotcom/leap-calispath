import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AssessmentScreen } from '../src/screens/AssessmentScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <AssessmentScreen 
        {...params}
        onComplete={() => router.replace('/')}
      />
    </SpartanLayout>
  );
}
