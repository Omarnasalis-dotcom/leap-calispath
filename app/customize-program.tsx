import React from 'react';
import { CustomizeProgramScreen } from '../src/screens/CustomizeProgramScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <CustomizeProgramScreen />
    </SpartanLayout>
  );
}
