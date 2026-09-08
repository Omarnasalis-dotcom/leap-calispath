import { useAuth } from '../src/contexts/AuthContext';
import { WarriorProgramScreen } from '../src/screens/coaching/WarriorProgramScreen';
import { useReturnTo } from '../src/hooks/useReturnTo';

export default function WarriorProgramRoute() {
  const { user } = useAuth();
  const { goBackOrReturnTo } = useReturnTo();

  if (!user) return null;

  return (
    <WarriorProgramScreen
      warriorId={user.id}
      onClose={() => goBackOrReturnTo('/')}
    />
  );
}
