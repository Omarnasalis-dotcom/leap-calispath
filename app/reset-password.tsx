import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ResetPasswordScreen } from '../src/screens/ResetPasswordScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <ResetPasswordScreen 
        {...params}
        onComplete={() => router.replace('/auth')}
      />
    </SpartanLayout>
  );
}
