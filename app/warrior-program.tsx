import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { WarriorProgramScreen } from '../src/screens/coaching/WarriorProgramScreen';

export default function WarriorProgramRoute() {
  const router = useRouter();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <WarriorProgramScreen
      warriorId={user.id}
      onClose={() => router.back()}
    />
  );
}
