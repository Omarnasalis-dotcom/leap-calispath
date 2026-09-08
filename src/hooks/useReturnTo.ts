import { useLocalSearchParams, useRouter } from 'expo-router';

// Generalizes the `canGoBack() ? router.back() : router.replace(fallback)`
// defensive pattern already used by ~9 screens' own back/exit handlers (e.g.
// app/trial.tsx's onBack) with one new branch: a screen entered from the
// Milestone Lane / My Journey tab (via a `returnTo=journey` route param)
// returns there instead of following its normal default. Absent that param,
// behavior is identical to the pre-existing pattern — fully backward
// compatible with every call site that doesn't pass it.
export function useReturnTo() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const router = useRouter();

  const goBackOrReturnTo = (fallback: string) => {
    if (returnTo === 'journey') {
      router.replace('/my-journey');
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  };

  return { returnTo, goBackOrReturnTo };
}
