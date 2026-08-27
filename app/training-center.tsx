import React from 'react';
import { TrainingCenterScreen } from '../src/screens/TrainingCenterScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <TrainingCenterScreen />
    </SpartanLayout>
  );
}
