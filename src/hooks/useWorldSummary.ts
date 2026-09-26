import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { WorldSummary, WorldSummaryService, SummaryWorld } from '../services/WorldSummaryService';
import { useMountedRef } from './useMountedRef';

/**
 * Fetches get_world_summary for a world on every focus (the world screens
 * live in a persistent tab navigator), plus an explicit `refresh()` after a
 * log. A failed fetch keeps the last good summary rather than blanking the
 * dashboard; `summary` is null only until the first success.
 */
export function useWorldSummary(world: SummaryWorld, enabled: boolean = true) {
  const [summary, setSummary] = useState<WorldSummary | null>(null);
  const isMounted = useMountedRef();
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const s = await WorldSummaryService.get(world);
      if (isMounted.current) setSummary(s);
    } catch (e) {
      console.error(`[useWorldSummary] ${world}:`, e);
    } finally {
      inFlight.current = false;
    }
  }, [world, enabled, isMounted]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return { summary, refresh };
}
