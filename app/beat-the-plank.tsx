import React from 'react';
import { useRouter } from 'expo-router';
import { BeatTheLadderScreen } from '../src/screens/BeatTheLadderScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();

  return (
    <SpartanLayout hideToggle>
      <BeatTheLadderScreen
        onExit={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/');
          }
        }}
      />
    </SpartanLayout>
  );
}
