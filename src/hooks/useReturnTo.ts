import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';

// A progression (real, tier-advancing) trial can be launched from several
// places that have no idea what the Milestone Lane's current week is —
// ProfileScreen's Strength World tier grid and the onboarding tutorial's
// "Begin Trial" CTA, at minimum — so they can't compute the exact
// `w{N}_trial` slot key the journey-embedded trial card uses (see
// MilestoneLaneScreen.tsx's trialSlotKey). Passing this fixed sentinel as
// questSlotKey instead lets MilestoneLaneScreen resolve it against whatever
// IT currently considers "the" trial slot, without every caller needing to
// know or duplicate that computation. Real bug this closes: a trial passed
// from anywhere other than the lane's own card left that card showing
// "open" forever, since nothing ever told the lane a trial was resolved.
export const CURRENT_TRIAL_QUEST_SENTINEL = 'current_trial';

// A trial passed from outside the lane (Strength's tier grid) returns the
// athlete to where they started, not to My Journey, so the lane can't be
// told through ?questDone. It leaves this note instead, and the lane
// resolves its current trial slot the next time it's focused.
const PENDING_TRIAL_DONE_KEY_PREFIX = 'milestone_lane_pending_trial_done_';

export async function markCurrentTrialDone(profileId: string) {
  await AsyncStorage.setItem(`${PENDING_TRIAL_DONE_KEY_PREFIX}${profileId}`, 'true').catch(() => {});
}

/** True once per passed trial: reads and clears the note. */
export async function consumeCurrentTrialDone(profileId: string): Promise<boolean> {
  try {
    const key = `${PENDING_TRIAL_DONE_KEY_PREFIX}${profileId}`;
    if ((await AsyncStorage.getItem(key)) !== 'true') return false;
    await AsyncStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Generalizes the `canGoBack() ? router.back() : router.replace(fallback)`
// defensive pattern already used by ~9 screens' own back/exit handlers (e.g.
// app/trial.tsx's onBack) with one new branch: a screen entered from the
// Milestone Lane / My Journey tab (via a `returnTo=journey` route param)
// returns there instead of following its normal default. Absent that param,
// behavior is identical to the pre-existing pattern — fully backward
// compatible with every call site that doesn't pass it.
export function useReturnTo() {
  const { returnTo, questSlotKey } = useLocalSearchParams<{ returnTo?: string; questSlotKey?: string }>();
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

  // Call this the moment a side quest actually logs something (not just on
  // exit) — auto-navigates straight back to the lane, and if this screen
  // was reached via a specific quest slot, tells MilestoneLaneScreen which
  // one so it can mark that node complete. A no-op when neither param is
  // present (e.g. the screen was reached normally, via a bottom tab).
  const completeQuestAndReturn = () => {
    if (returnTo !== 'journey') return false;
    router.replace(questSlotKey ? { pathname: '/my-journey', params: { questDone: questSlotKey } } : '/my-journey');
    return true;
  };

  return { returnTo, questSlotKey, goBackOrReturnTo, completeQuestAndReturn };
}
