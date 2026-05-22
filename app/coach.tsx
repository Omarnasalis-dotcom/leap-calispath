import { useRouter } from 'expo-router';
import { CoachScreen } from '../src/screens/CoachScreen';

export default function CoachRoute() {
  const router = useRouter();

  return (
    <CoachScreen onBack={() => router.back()} />
  );
}
