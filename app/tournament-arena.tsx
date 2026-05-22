import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TournamentArenaScreen } from '../src/screens/TournamentArenaScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout>
      <TournamentArenaScreen navigation={{}} 
        {...params}
      />
    </SpartanLayout>
  );
}
