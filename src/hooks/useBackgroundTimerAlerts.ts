import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** One moment a running timer will reach, as seconds from now. */
export interface TimerAlert {
  inSeconds: number;
  title: string;
  body: string;
  /** Where tapping it goes (see the notification handler in app/_layout.tsx). */
  data?: Record<string, string>;
}

/** Marks timer alerts so the foreground handler (app/_layout.tsx) can keep
 * them silent while the app is open — the timer's own sounds cover that. */
export const TIMER_ALERT_DATA = { timerAlert: true } as const;

// iOS keeps at most 64 pending local notifications per app.
const MAX_ALERTS = 48;

/** Workout block timers that come back after the app is closed (see
 * workoutInlineState) — each schedules its alert under a fixed id. */
export type ResumableBlockTimer = 'amrap' | 'fortime' | 'ladder';
const RESUMABLE_BLOCK_TIMERS: ResumableBlockTimer[] = ['amrap', 'fortime', 'ladder'];

/** The fixed notification id of a block's AMRAP / For Time / ladder alert. */
export const blockTimerAlertId = (blockId: string | number, kind: ResumableBlockTimer) =>
  `block-timer:${blockId}:${kind}`;

/** Cancels a block's AMRAP / For Time / ladder alert, including one
 * scheduled before the app was closed (called when the block is logged). */
export function cancelBlockTimerAlerts(blockId: string | number) {
  if (Platform.OS === 'web') return;
  RESUMABLE_BLOCK_TIMERS.forEach(kind =>
    Notifications.cancelScheduledNotificationAsync(blockTimerAlertId(blockId, kind)).catch(() => {})
  );
}

/**
 * Timers only tick while the app is in the foreground. When the app leaves
 * the foreground this schedules a local notification for every moment the
 * running timer(s) will reach (`getAlerts`, read at that moment — return []
 * when nothing is running), and cancels them all when the app comes back,
 * where the timer catches up and its own sounds take over. Also cancelled on
 * unmount.
 *
 * `alertId` (a timer with at most one alert that comes back after the app
 * is closed): its alert is scheduled under that fixed id. A killed app can't
 * cancel what it scheduled, so the reopened app's timer cancels it by id
 * when it mounts and schedules its own — never two alerts, and never one
 * at an end time the athlete has since reset.
 */
export function useBackgroundTimerAlerts(getAlerts: () => TimerAlert[], alertId?: string) {
  const getRef = useRef(getAlerts);
  getRef.current = getAlerts;
  const alertIdRef = useRef(alertId);
  alertIdRef.current = alertId;
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // This timer is on screen now: an alert left from before the app was
    // closed is replaced by this one's own (scheduled on leaving the app).
    if (alertIdRef.current) {
      Notifications.cancelScheduledNotificationAsync(alertIdRef.current).catch(() => {});
    }

    const cancelAll = () => {
      const ids = idsRef.current;
      idsRef.current = [];
      ids.forEach(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}));
    };

    const scheduleAll = async () => {
      cancelAll();
      let alerts: TimerAlert[] = [];
      try {
        alerts = getRef.current();
      } catch {
        return;
      }
      const fixedId = alertIdRef.current;
      for (const [i, a] of alerts.filter(x => x.inSeconds >= 1).slice(0, MAX_ALERTS).entries()) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            ...(fixedId ? { identifier: i === 0 ? fixedId : `${fixedId}:${i}` } : {}),
            content: { title: a.title, body: a.body, sound: true, data: { ...TIMER_ALERT_DATA, ...a.data } },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: Math.round(a.inSeconds),
            },
          });
          // Back in the foreground before scheduling finished: drop it.
          if (AppState.currentState === 'active') {
            Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
          } else {
            idsRef.current.push(id);
          }
        } catch {
          // No permission or scheduling failed: the timer still catches up.
        }
      }
    };

    // Scheduled as soon as the app leaves the foreground (iOS passes
    // through 'inactive' first, and may suspend JS shortly after reaching
    // 'background'); cancelled on return.
    let wasActive = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        wasActive = true;
        cancelAll();
      } else if (wasActive) {
        wasActive = false;
        scheduleAll();
      }
    });
    return () => {
      sub.remove();
      cancelAll();
    };
  }, []);
}
