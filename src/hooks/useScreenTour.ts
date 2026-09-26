import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';
import { useMountedRef } from './useMountedRef';
import { TourId } from '../types/tutorial';

// Tours only auto-start for users who finished onboarding this recently.
// Keyed off onboarding_completed_at (not assessed_at): onboarding runs Goals
// & Equipment + program building after the assessment. The window also
// keeps tours from firing for legacy members, whose onboarding_completed_at
// was backfilled to their old assessed_at.
const TOUR_AUTO_START_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// 'main' keeps the key the original Profile tour used, so anyone who
// already saw it isn't shown it again.
function seenKey(tourId: TourId, profileId: string) {
  return tourId === 'main' ? `seen_profile_tutorial_${profileId}` : `seen_tour_${tourId}_${profileId}`;
}

/**
 * Auto-starts `tourId` the first time its screen is focused (for recently
 * onboarded users), and returns `replay` for the screen's help button.
 * `ready` should be false until the screen's tour targets have rendered
 * (e.g. while its data is still loading).
 */
export function useScreenTour(tourId: TourId, ready: boolean) {
  const { profile } = useAuth();
  const tutorial = useTutorial();
  const mountedRef = useMountedRef();
  const attemptedRef = useRef(false);

  // Tab screens stay mounted in the background, so mount alone doesn't mean
  // "the user is looking at this" — without this a background tab could
  // start its tour on top of whatever screen is actually showing.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  useEffect(() => {
    // Never interrupt another tour — try again once it finishes.
    if (!ready || !focused || tutorial.active || attemptedRef.current) return;
    if (!profile?.id || !profile.onboarding_completed_at) return;
    if (Date.now() - new Date(profile.onboarding_completed_at).getTime() > TOUR_AUTO_START_WINDOW_MS) return;
    attemptedRef.current = true;
    const key = seenKey(tourId, profile.id);
    (async () => {
      try {
        if ((await AsyncStorage.getItem(key)) === 'true') return;
        // Marked seen up front so skipping partway (or backgrounding the
        // app mid-tour) never re-triggers it; the help button replays it.
        await AsyncStorage.setItem(key, 'true');
        if (mountedRef.current) tutorial.start(tourId);
      } catch (e) {
        console.warn(`[useScreenTour] Failed to read tour storage (${tourId}):`, e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focused, tutorial.active, profile?.id, profile?.onboarding_completed_at, tourId]);

  const { start } = tutorial;
  const replay = useCallback(() => start(tourId), [start, tourId]);
  return { replay };
}
