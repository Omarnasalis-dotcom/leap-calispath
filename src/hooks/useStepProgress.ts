import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllStepProgress, getStepProgress, onStepSaved, StepProgress } from '../services/StepService';
import { stepCount } from '../lib/trialSteps';

// Last progress per athlete + tier for this app session, so Journey and
// Strength open with it at once and refresh on focus.
const cache = new Map<string, StepProgress>();

// The last progress is also kept on the phone, so the first open after a
// launch shows the steps at once instead of waiting on the network (the
// Strength path card hides its rows until progress is known). The server
// copy replaces it as soon as it arrives.
const STORE_PREFIX = 'step_progress:v1:';
async function readStored<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, value: unknown): void {
  AsyncStorage.setItem(STORE_PREFIX + key, JSON.stringify(value)).catch(() => {});
}

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
  // Set once the server answered for this key: a slower phone read never overwrites it.
  const freshKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || stepCount(tier) === 0) return;
    setFailed(false);
    try {
      const next = await getStepProgress(userId, tier);
      cache.set(`${userId}:${tier}`, next);
      freshKey.current = `${userId}:${tier}`;
      writeStored(`${userId}:${tier}`, next);
      setProgress(next);
    } catch (err) {
      console.warn('Strength step progress failed:', err);
      setFailed(true);
    }
  }, [userId, tier]);

  useFocusEffect(useCallback(() => {
    const k = `${userId}:${tier}`;
    const known = cache.get(k) ?? null;
    setProgress(known);
    if (!known && userId && stepCount(tier) > 0) {
      readStored<StepProgress>(k).then(stored => {
        if (stored && freshKey.current !== k && !cache.has(k)) setProgress(prev => prev ?? stored);
      });
    }
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
      writeStored(`all:${userId}`, next);
      setAll(next);
    } catch (err) {
      console.warn('Strength step progress failed:', err);
    }
  }, [userId]);
  useFocusEffect(useCallback(() => {
    if (userId && !allCache.has(userId)) {
      readStored<Record<number, StepProgress>>(`all:${userId}`).then(stored => {
        if (stored && !allCache.has(userId)) setAll(prev => prev ?? stored);
      });
    }
    refresh();
  }, [refresh, userId]));
  useEffect(() => onStepSaved(() => { refresh(); }), [refresh]);
  return { all, refresh };
}
