import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PowerWorldScreen } from '../src/screens/PowerWorldScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const params = useLocalSearchParams();
  
  return (
    <SpartanLayout noBottomInset>
      <PowerWorldScreen
        {...params}
      />
    </SpartanLayout>
  );
}
