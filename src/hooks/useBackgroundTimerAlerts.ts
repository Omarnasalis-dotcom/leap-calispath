import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** One moment a running timer will reach, as seconds from now. */
export interface TimerAlert {
  inSeconds: number;
  title: string;
  body: string;
}

/** Marks timer alerts so the foreground handler (app/_layout.tsx) can keep
 * them silent while the app is open — the timer's own sounds cover that. */
export const TIMER_ALERT_DATA = { timerAlert: true } as const;

// iOS keeps at most 64 pending local notifications per app.
const MAX_ALERTS = 48;

/**
 * Timers only tick while the app is in the foreground. When the app goes to
 * the background this schedules a local notification for every moment the
 * running timer(s) will reach (`getAlerts`, read at that moment — return []
 * when nothing is running), and cancels them all when the app comes back,
 * where the timer catches up and its own sounds take over. Also cancelled on
 * unmount.
 */
export function useBackgroundTimerAlerts(getAlerts: () => TimerAlert[]) {
  const getRef = useRef(getAlerts);
  getRef.current = getAlerts;
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

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
      for (const a of alerts.filter(x => x.inSeconds >= 1).slice(0, MAX_ALERTS)) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: { title: a.title, body: a.body, sound: true, data: TIMER_ALERT_DATA },
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

    const sub = AppState.addEventListener('change', next => {
      if (next === 'background') scheduleAll();
      else if (next === 'active') cancelAll();
    });
    return () => {
      sub.remove();
      cancelAll();
    };
  }, []);
}
