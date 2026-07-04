import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { OneMinMaxScreen } from '../src/screens/OneMinMaxScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const params = useLocalSearchParams();

  return (
    <SpartanLayout>
      <OneMinMaxScreen
        {...params}
      />
    </SpartanLayout>
  );
}
