import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AdminTournamentScreen } from '../src/screens/AdminTournamentScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <AdminTournamentScreen onClose={() => router.back()} 
        {...params}
      />
    </SpartanLayout>
  );
}
