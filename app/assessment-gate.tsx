import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AssessmentGateScreen } from '../src/screens/AssessmentGateScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <AssessmentGateScreen 
        {...params}
      />
    </SpartanLayout>
  );
}
