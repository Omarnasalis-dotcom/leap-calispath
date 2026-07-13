import React from 'react';
import { CompleteProfileScreen } from '../src/screens/CompleteProfileScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout>
      <CompleteProfileScreen />
    </SpartanLayout>
  );
}
