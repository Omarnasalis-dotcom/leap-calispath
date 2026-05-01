import React from 'react';
import { useRouter } from 'expo-router';
import { SpartanLayout } from './_layout';
import { AssessmentScreen } from '../src/screens/AssessmentScreen';

export default function Assessment() {
  const router = useRouter();

  return (
    <SpartanLayout>
      <AssessmentScreen 
        onComplete={() => router.replace('/rank-reveal')}
      />
    </SpartanLayout>
  );
}
