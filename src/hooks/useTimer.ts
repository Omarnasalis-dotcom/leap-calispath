import { useState, useEffect, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

export interface UseTimerResult {
  seconds: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  setSeconds: (s: number) => void;
}

export function useTimer(initialSeconds: number = 0, mode: 'up' | 'down' = 'up'): UseTimerResult {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const notificationIdRef = useRef<string | null>(null);

  const start = async () => {
    if (isRunning) return;
    setIsRunning(true);
    let elapsed = 0;
    // If we're resuming, we need to adjust the start time
    if (mode === 'up') {
      startTimeRef.current = Date.now() - (seconds * 1000);
    } else {
      // For countdown, we track how many seconds have *already* elapsed
      elapsed = initialSeconds - seconds;
      startTimeRef.current = Date.now() - (elapsed * 1000);
    }

    if (mode === 'down' && Platform.OS !== 'web') {
      try {
        const remaining = initialSeconds - elapsed;
        if (remaining > 0) {
          const identifier = await Notifications.scheduleNotificationAsync({
            content: {
              title: "Time's up!",
              body: "Your rest period is over. Let's get back to work!",
              sound: true,
            },
            trigger: { 
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, 
              seconds: remaining 
            },
          });
          notificationIdRef.current = identifier;
        }
      } catch (e) {
        console.log('Failed to schedule notification', e);
      }
    }
  };

  const stop = async () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;

    if (notificationIdRef.current && Platform.OS !== 'web') {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
        notificationIdRef.current = null;
      } catch (e) {
        console.log('Failed to cancel notification', e);
      }
    }
  };

  const reset = () => {
    stop();
    setSeconds(initialSeconds);
    startTimeRef.current = null;
  };

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          const delta = Math.floor((Date.now() - startTimeRef.current) / 1000);
          if (mode === 'up') {
            setSeconds(delta);
          } else {
            const remaining = initialSeconds - delta;
            if (remaining <= 0) {
              setSeconds(0);
              stop();
            } else {
              setSeconds(remaining);
            }
          }
        }
      }, 500);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, mode, initialSeconds]);

  // Handle visibility changes for web/mobile backgrounding
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && isRunning && startTimeRef.current !== null) {
          const delta = Math.floor((Date.now() - startTimeRef.current) / 1000);
          if (mode === 'up') {
            setSeconds(delta);
          } else {
            const remaining = initialSeconds - delta;
            setSeconds(remaining > 0 ? remaining : 0);
            if (remaining <= 0) stop();
          }
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, [isRunning, mode, initialSeconds]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isRunning && startTimeRef.current !== null) {
        const delta = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (mode === 'up') {
          setSeconds(delta);
        } else {
          const remaining = initialSeconds - delta;
          setSeconds(remaining > 0 ? remaining : 0);
          if (remaining <= 0) stop();
        }
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isRunning, mode, initialSeconds]);

  return { seconds, isRunning, start, stop, reset, setSeconds };
}
