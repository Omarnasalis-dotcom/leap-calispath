import React, { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArenaWorkoutScreen } from '../src/screens/ArenaWorkoutScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { ArenaPhase, ArenaService } from '../src/services/ArenaService';
import { View, ActivityIndicator } from 'react-native';

export default function Route() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams();
  const [phase, setPhase] = useState<ArenaPhase | null>(null);

  useEffect(() => {
    if (sessionId) {
      ArenaService.getStrengthArenaPhases().then(phases => {
        const found = phases.find(p => p.id === sessionId);
        setPhase(found || null);
      });
    }
  }, [sessionId]);

  if (!phase) {
    return (
      <SpartanLayout>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#D32F2F" />
        </View>
      </SpartanLayout>
    );
  }

  return (
    <SpartanLayout>
      <ArenaWorkoutScreen 
        onComplete={() => router.back()} 
        onClose={() => router.back()} 
        phase={phase} 
      />
    </SpartanLayout>
  );
}
