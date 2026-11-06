import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { CoachUsage, parseCoachUsage } from '../lib/coachUsage';

/** Past this, the next visit or return to the app refreshes it instead. */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
/** Lands just after the server's own reset. */
const AFTER_RESET_MS = 2000;

async function fetchCoachUsage(): Promise<CoachUsage | null> {
  try {
    const { data, error } = await supabase.rpc('get_ai_coach_usage', { p_platform: Platform.OS });
    return error ? null : parseCoachUsage(data);
  } catch {
    return null;
  }
}

/**
 * Messages and budget left, while the chat is open. Reads only, and never
 * waits on or holds up a message: it refreshes on opening, once a reply has
 * finished (`busy` turning false), on returning to the app and at the reset.
 * Null hides the line, so a failed read changes nothing else.
 */
export function useCoachUsage(enabled: boolean, busy: boolean): CoachUsage | null {
  const [usage, setUsage] = useState<CoachUsage | null>(null);
  const latest = useRef(0);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const refresh = useRef(async () => {
    const id = ++latest.current;
    const next = await fetchCoachUsage();
    if (id !== latest.current) return;
    // The same numbers keep the same object, so nothing re-renders.
    setUsage(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }).current;

  useEffect(() => () => { latest.current++; }, []);

  useEffect(() => {
    if (enabled && !busy) refresh();
  }, [enabled, busy, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && !busyRef.current) refresh();
    });
    return () => sub.remove();
  }, [enabled, refresh]);

  const resetsAt = usage?.resetsAt;
  useEffect(() => {
    if (!enabled || !resetsAt) return;
    const wait = Date.parse(resetsAt) + AFTER_RESET_MS - Date.now();
    // A date already passed would otherwise refresh in a loop.
    if (wait <= 0 || wait > MAX_TIMER_MS) return;
    const timer = setTimeout(refresh, wait);
    return () => clearTimeout(timer);
  }, [enabled, resetsAt, refresh]);

  return usage;
}
