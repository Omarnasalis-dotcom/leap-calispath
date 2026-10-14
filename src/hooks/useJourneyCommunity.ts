import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { CommunityBoard, getCommunityBoard } from '../lib/journeyPoints';

// One board per app session, refreshed at most once a minute on focus, so
// opening Journey repeatedly doesn't refetch.
const STALE_MS = 60_000;
let cache: { userId: string; board: CommunityBoard; at: number } | null = null;

/**
 * The caller's community board (journey achievements, step 3): the entry row
 * needs the community name and this week's rank; the sheet (step 8) reuses
 * the same data. Failures leave the last board in place.
 */
export function useJourneyCommunity(userId: string | undefined) {
  const [board, setBoard] = useState<CommunityBoard | null>(() =>
    cache && cache.userId === userId ? cache.board : null
  );
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (!userId) return;
    if (!force && cache && cache.userId === userId && Date.now() - cache.at < STALE_MS) {
      setBoard(cache.board);
      return;
    }
    try {
      const next = await getCommunityBoard();
      cache = { userId, board: next, at: Date.now() };
      setBoard(next);
      setFailed(false);
    } catch (err) {
      console.warn('Journey community board failed:', err);
      setFailed(true);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const you = board?.rows.find(r => r.is_you) ?? null;
  return { board, you, failed, refresh };
}
