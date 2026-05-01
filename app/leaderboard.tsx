import React from 'react';
import { useRouter } from 'expo-router';
import { SpartanLayout } from './_layout';
import { LeaderboardScreen } from '../src/screens/LeaderboardScreen';

export default function Leaderboard() {
  const router = useRouter();

  return (
    <SpartanLayout>
      <LeaderboardScreen
        onClose={() => router.back()}
        onPracticeTier={(tier: number) => router.push('/trial')}
        onStartEternal={() => router.push('/trial')}
      />
    </SpartanLayout>
  );
}
