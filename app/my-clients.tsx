import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MyClientsScreen } from '../src/screens/coaching/MyClientsScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';
import { useAuth } from '../src/contexts/AuthContext';

export default function Route() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  // Falls back to the logged-in coach's own id when not passed explicitly
  // (e.g. arriving here from a push notification deep link, which has no
  // route params) — every in-app nav path already passes coachId={user.id}
  // anyway, this just makes that the default instead of a hard requirement.
  const coachId = (params.coachId as string) || user?.id;

  return (
    <SpartanLayout>
      <MyClientsScreen
        coachId={coachId}
        isAdmin={params.isAdmin === 'true'}
      />
    </SpartanLayout>
  );
}
