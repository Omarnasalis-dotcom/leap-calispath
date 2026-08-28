import React from 'react';
import { ProgramTemplatesScreen } from '../src/screens/ProgramTemplatesScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <ProgramTemplatesScreen />
    </SpartanLayout>
  );
}
