import { useSyncExternalStore } from 'react';
import { Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { t } from '../i18n';

/**
 * The side countdown lives at the app root (SideRestHost in app/_layout.tsx),
 * not in the workout screen, so a rest keeps going on every screen
 * (owner, 2026-11-06). The workout screen, while open, handles the end itself.
 */
export interface SideRest {
  id: number;
  seconds: number;
  endsAt: number;
  /** The block tapping "Rest over" goes back to. */
  blockId?: string | number;
}

let rest: SideRest | null = null;
let nextId = 1;
let endedHandler: (() => void) | null = null;
const listeners = new Set<() => void>();

const publish = (value: SideRest | null) => {
  rest = value;
  listeners.forEach(fn => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

export const useSideRest = () => useSyncExternalStore(subscribe, () => rest, () => rest);

/** Starts it, replacing one already running. */
export function startSideRest(seconds: number, blockId?: string | number) {
  publish({ id: nextId++, seconds, endsAt: Date.now() + seconds * 1000, blockId });
}

/** The notification's route: the workout, opened on the block. `at` makes each
 * rest a new request, as the same block can come back. */
export function restOverRoute(rest: Pick<SideRest, 'blockId' | 'endsAt'>): Record<string, string> | undefined {
  return rest.blockId == null
    ? undefined
    : { screen: 'warrior-program', openBlock: String(rest.blockId), at: String(rest.endsAt) };
}

export function stopSideRest() {
  publish(null);
}

/** The workout screen's own ending, while it's open (banner to the next block). */
export function setSideRestEndedHandler(handler: (() => void) | null) {
  endedHandler = handler;
}

/** Past this, the phone's own notification already said so while the app was away. */
const LATE_MS = 2000;

export function sideRestEnded() {
  const ended = rest;
  const late = !!ended && Date.now() - ended.endsAt > LATE_MS;
  publish(null);
  Vibration.vibrate([0, 500, 200, 500]);
  if (endedHandler) {
    endedHandler();
  } else if (!late) {
    // Elsewhere in the app there's no workout banner: an ordinary notification
    // shows there. Not a timer alert: those stay silent while the app is open.
    Notifications.scheduleNotificationAsync({
      content: {
        title: t('timerAlerts.restOver'),
        body: t('timerAlerts.restOverBody'),
        sound: true,
        data: ended ? restOverRoute(ended) : undefined,
      },
      trigger: null,
    }).catch(() => {});
  }
}
