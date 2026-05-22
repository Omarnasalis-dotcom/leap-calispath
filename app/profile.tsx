import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ProfileScreen } from '../src/screens/ProfileScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <ProfileScreen 
        {...params}
      />
    </SpartanLayout>
  );
}
