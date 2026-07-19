import React from 'react';
import { useRouter } from 'expo-router';
import { GuessTheSkillScreen } from '../src/screens/GuessTheSkillScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();

  return (
    <SpartanLayout hideToggle>
      <GuessTheSkillScreen
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
