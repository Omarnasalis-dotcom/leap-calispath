import React from 'react';
import { MilestoneLaneScreen } from '../src/screens/MilestoneLaneScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout>
      <MilestoneLaneScreen mode="onboarding" />
    </SpartanLayout>
  );
}
