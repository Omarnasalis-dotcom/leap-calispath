import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getAllStepProgress, getStepProgress, onStepSaved, StepProgress } from '../services/StepService';
import { stepCount } from '../lib/trialSteps';

// Last progress per athlete + tier for this app session, so Journey and
// Strength open with it at once and refresh on focus.
const cache = new Map<string, StepProgress>();

/**
 * The athlete's finished Strength Trial Steps for their tier (Journey's trial
 * checkpoint and the Strength tab). null until loaded; failures keep the
 * last value, and `failed` says the last load failed. Tiers without steps
 * never query.
 */
export function useStepProgress(userId: string | undefined, tier: number) {
  const key = `${userId}:${tier}`;
  const [progress, setProgress] = useState<StepProgress | null>(() => cache.get(key) ?? null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId || stepCount(tier) === 0) return;
    setFailed(false);
    try {
      const next = await getStepProgress(userId, tier);
      cache.set(`${userId}:${tier}`, next);
      setProgress(next);
    } catch (err) {
      console.warn('Strength step progress failed:', err);
      setFailed(true);
    }
  }, [userId, tier]);

  useFocusEffect(useCallback(() => {
    setProgress(cache.get(`${userId}:${tier}`) ?? null);
    refresh();
  }, [refresh, userId, tier]));
  useEffect(() => onStepSaved(() => { refresh(); }), [refresh]);

  return { progress, failed, refresh };
}

const allCache = new Map<string, Record<number, StepProgress>>();

/** Finished steps for every tier (Strength tab), refreshed on focus. */
export function useAllStepProgress(userId: string | undefined) {
  const [all, setAll] = useState<Record<number, StepProgress> | null>(() => (userId ? allCache.get(userId) ?? null : null));
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await getAllStepProgress(userId);
      allCache.set(userId, next);
      setAll(next);
    } catch (err) {
      console.warn('Strength step progress failed:', err);
    }
  }, [userId]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => onStepSaved(() => { refresh(); }), [refresh]);
  return { all, refresh };
}
