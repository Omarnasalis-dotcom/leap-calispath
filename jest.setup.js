// Jest doesn't load .env files the way Expo's bundler does, so modules that
// import src/lib/supabase.ts need these set before any test file runs.
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

// useSafeAreaInsets() throws outside a real SafeAreaProvider — no test in
// this suite rendered a consumer of it until QuickWorkoutTimerModal, which
// surfaced this needing a global mock rather than a one-off per test file
// (any future component using it would hit the same failure). This is the
// library's own official test mock, not a hand-rolled one.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
