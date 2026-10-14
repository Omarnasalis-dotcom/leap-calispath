import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BURST_LAND_MS } from '../components/journey/RewardFx';
import { achievementFor } from '../lib/journeyAchievements';
import { CelebrationData, celebrationFrom } from '../lib/journeyCelebration';
import { JourneyPointsSummary, markAchievementCelebrated } from '../lib/journeyPoints';

// Levels closed this app session, so a summary that still lists them as
// pending (until the server answers) never replays them.
const shownThisSession = new Set<string>();

/**
 * Decides when to show the achievement celebration on Journey: when the
 * summary has an uncelebrated level, after the +points reward FX has landed
 * (a different animation system: they never overlap), only while Journey is
 * the focused screen and no other Journey sheet is open (two modals at once
 * misbehave on iOS). Marks it celebrated after the card closes, once the
 * screen is idle.
 */
export function useAchievementCelebration(
  userId: string | undefined,
  summary: JourneyPointsSummary | null,
  onCelebrated: () => void,
  /** Another Journey sheet is open: wait until it closes. */
  blocked: boolean,
) {
  const [data, setData] = useState<CelebrationData | null>(null);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    if (!userId || !summary || data || blocked || !focused) return;
    const next = celebrationFrom(summary.achievement, summary.new_awards, lvl => achievementFor(lvl)?.threshold ?? 0);
    if (!next || shownThisSession.has(`${userId}:${next.level}`)) return;
    const wait = summary.new_awards.length > 0 ? BURST_LAND_MS + 700 : 600;
    timer.current = setTimeout(() => setData(next), wait);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [userId, summary, data, blocked, focused]);

  const close = useCallback(() => {
    if (!data || !userId) return;
    const level = data.level;
    shownThisSession.add(`${userId}:${level}`);
    setData(null);
    InteractionManager.runAfterInteractions(() => {
      markAchievementCelebrated(level)
        .then(onCelebrated)
        .catch(err => console.warn('Mark achievement celebrated failed:', err));
    });
  }, [data, userId, onCelebrated]);

  return { data, close };
}
