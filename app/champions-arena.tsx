import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LockedFeature } from '../src/components/LockedFeature';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout>
      <LockedFeature 
        title="CHAMPIONS ARENA" 
        description="The ultimate proving ground for Demigods and Eternals. Train for the arena."
      />
    </SpartanLayout>
  );
}
