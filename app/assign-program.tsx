import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AssignProgramScreen } from '../src/screens/coaching/AssignProgramScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <AssignProgramScreen 
        {...params}
      />
    </SpartanLayout>
  );
}
