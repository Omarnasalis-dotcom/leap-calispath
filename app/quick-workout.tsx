import React from 'react';
import { QuickWorkoutScreen } from '../src/screens/QuickWorkoutScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <QuickWorkoutScreen />
    </SpartanLayout>
  );
}
