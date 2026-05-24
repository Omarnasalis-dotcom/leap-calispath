import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClientDashboardScreen } from '../src/screens/coaching/ClientDashboardScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <ClientDashboardScreen 
        warriorId={params.warriorId as string}
        templateId={params.templateId as string}
      />
    </SpartanLayout>
  );
}
