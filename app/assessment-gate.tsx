import React from 'react';
import { useRouter } from 'expo-router';
import { SpartanLayout } from './_layout';
import { AssessmentGateScreen } from '../src/screens/AssessmentGateScreen';

export default function AssessmentGate() {
  const router = useRouter();

  return (
    <SpartanLayout>
      <AssessmentGateScreen 
        onStartAssessment={() => router.replace('/assessment')}
      />
    </SpartanLayout>
  );
}
