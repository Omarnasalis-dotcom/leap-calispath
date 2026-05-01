import React from 'react';
import { useRouter } from 'expo-router';
import { SpartanLayout } from './_layout';
import { ProfileScreen } from '../src/screens/ProfileScreen';

export default function Profile() {
  const router = useRouter();

  return (
    <SpartanLayout>
      <ProfileScreen
        onStartTrial={() => router.push('/trial')}
        onViewLeaderboards={() => router.push('/leaderboard')}
      />
    </SpartanLayout>
  );
}
