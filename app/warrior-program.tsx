import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { WarriorProgramScreen } from '../src/screens/coaching/WarriorProgramScreen';
import { useReturnTo } from '../src/hooks/useReturnTo';

export default function WarriorProgramRoute() {
  const { user } = useAuth();
  const { returnTo, goBackOrReturnTo } = useReturnTo();
  const { startDay } = useLocalSearchParams<{ startDay?: string }>();
  const router = useRouter();

  if (!user) return null;

  return (
    <WarriorProgramScreen
      warriorId={user.id}
      onClose={() => goBackOrReturnTo('/')}
      autoStartDayIndex={startDay !== undefined ? Number(startDay) : undefined}
      // "Done" after finishing a workout started from the Journey lane
      // returns there, same as closing the whole screen would -- otherwise
      // it just drops back to this screen's own day list, unchanged.
      onSessionDone={returnTo === 'journey' ? () => router.replace('/my-journey') : undefined}
    />
  );
}
