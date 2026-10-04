import { useCallback, useEffect, useRef, useState } from 'react';
import {
  JourneyPointsSummary,
  JourneyTask,
  PointsEntry,
  logJourneyTask,
  syncJourneyPoints,
  undoJourneyTask,
} from '../lib/journeyPoints';

// Last summary per user for this app session, so the Journey top bar shows
// real numbers instantly on every remount while a fresh sync runs.
let summaryCache: { userId: string; summary: JourneyPointsSummary } | null = null;

interface Options {
  userId: string | undefined;
  /** Whether today's program card has a side quest attached (Perfect day rule). */
  dayHasQuest: boolean;
  /** Called with whatever a call newly awarded, for the reward FX. */
  onAwards?: (awards: PointsEntry[], summary: JourneyPointsSummary) => void;
}

export function useJourneyPoints({ userId, dayHasQuest, onAwards }: Options) {
  const [summary, setSummary] = useState<JourneyPointsSummary | null>(() =>
    summaryCache && summaryCache.userId === userId ? summaryCache.summary : null
  );
  const [busyTask, setBusyTask] = useState<JourneyTask | null>(null);
  const onAwardsRef = useRef(onAwards);
  onAwardsRef.current = onAwards;
  const dayHasQuestRef = useRef(dayHasQuest);
  dayHasQuestRef.current = dayHasQuest;
  // What the last call told the server about today's card (Perfect day).
  const sentDayHasQuestRef = useRef<boolean | null>(null);
  // Calls can overlap (a focus sync and a tick); a response from a call
  // started before the one last applied is older data -- never let it
  // overwrite the newer summary.
  const startedSeq = useRef(0);
  const appliedSeq = useRef(0);
  const begin = () => {
    sentDayHasQuestRef.current = dayHasQuestRef.current;
    return ++startedSeq.current;
  };

  const apply = useCallback(
    (next: JourneyPointsSummary, seq: number) => {
      if (!userId || seq < appliedSeq.current) return;
      appliedSeq.current = seq;
      summaryCache = { userId, summary: next };
      setSummary(next);
      if (next.new_awards.length > 0) onAwardsRef.current?.(next.new_awards, next);
    },
    [userId]
  );

  /** Catch up on anything owed. Safe to call on every focus/load. */
  const refresh = useCallback(async () => {
    if (!userId) return;
    const seq = begin();
    try {
      apply(await syncJourneyPoints(dayHasQuestRef.current), seq);
    } catch (err) {
      // Points are a bonus layer -- never break the Journey over them.
      console.warn('Journey points sync failed:', err);
    }
  }, [userId, apply]);

  const logTask = useCallback(
    async (task: JourneyTask, amount: number | null) => {
      if (!userId || busyTask) return false;
      setBusyTask(task);
      const seq = begin();
      try {
        apply(await logJourneyTask(task, amount, dayHasQuestRef.current), seq);
        return true;
      } catch (err) {
        console.warn('Journey task log failed:', err);
        return false;
      } finally {
        setBusyTask(null);
      }
    },
    [userId, busyTask, apply]
  );

  const undoTask = useCallback(
    async (task: JourneyTask) => {
      if (!userId || busyTask) return false;
      setBusyTask(task);
      const seq = begin();
      try {
        apply(await undoJourneyTask(task), seq);
        return true;
      } catch (err) {
        console.warn('Journey task undo failed:', err);
        return false;
      } finally {
        setBusyTask(null);
      }
    },
    [userId, busyTask, apply]
  );

  // The lane can learn today's card only after the first sync went out
  // (cold start). If the answer changed, ask again so Perfect day is right.
  useEffect(() => {
    if (sentDayHasQuestRef.current !== null && sentDayHasQuestRef.current !== dayHasQuest) refresh();
  }, [dayHasQuest, refresh]);

  return { summary, refresh, logTask, undoTask, busyTask };
}
