import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MyClientsScreen } from '../src/screens/coaching/MyClientsScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <MyClientsScreen 
        coachId={params.coachId as string}
        isAdmin={params.isAdmin === 'true'}
      />
    </SpartanLayout>
  );
}
