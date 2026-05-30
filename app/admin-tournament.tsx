import React from 'react';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';
import { AdminTournamentScreen } from '../src/screens/AdminTournamentScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useAuth } from '../src/contexts/AuthContext';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile } = useAuth();

  if (!profile?.is_admin) return <Redirect href="/" />;

  return (
    <SpartanLayout>
      <AdminTournamentScreen onClose={() => router.back()} 
        {...params}
      />
    </SpartanLayout>
  );
}
