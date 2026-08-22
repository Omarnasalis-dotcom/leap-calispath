import React from 'react';
import { useRouter } from 'expo-router';
import { CoachScreen } from '../src/screens/CoachScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();

  return (
    <SpartanLayout hideToggle>
      <CoachScreen onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </SpartanLayout>
  );
}
