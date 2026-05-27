import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LockedFeature } from '../src/components/LockedFeature';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout>
      <LockedFeature 
        title="TOURNAMENTS" 
        description="Global synchronized tournaments are being forged. Prepare your strength for the upcoming worldwide events."
      />
    </SpartanLayout>
  );
}
