import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AuthScreen } from '../src/screens/AuthScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <AuthScreen 
        {...params}
      />
    </SpartanLayout>
  );
}
