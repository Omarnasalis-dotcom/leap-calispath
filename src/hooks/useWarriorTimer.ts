import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Alert, AppStateStatus } from 'react-native';
import { SoundServiceInstance } from '../lib/SoundService';

export interface ProgramBlockParams {
  id: string | number;
  metadata?: any;
}

interface UseWarriorTimerProps {
  onAmrapComplete: (blockId: string | number) => void;
}

export function useWarriorTimer({ onAmrapComplete }: UseWarriorTimerProps) {
  const [activeTimerBlockId, setActiveTimerBlockId] = useState<string | number | null>(null);
  const [timerType, setTimerType] = useState<'amrap' | 'fortime' | 'rest' | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerModalVisible, setTimerModalVisible] = useState<boolean>(false);
  const [timerPrepCountdown, setTimerPrepCountdown] = useState<number | null>(null);

  const [currentRound, setCurrentRound] = useState<number>(1);
  const [totalRounds, setTotalRounds] = useState<number>(1);
  const [restSeconds, setRestSeconds] = useState<number>(0);

  const lastTickRef = useRef<number | null>(null);
  const appState = useRef(AppState.currentState);

  // Background state syncing logic
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground, calculate delta
        if (timerRunning && lastTickRef.current) {
          const now = Date.now();
          const deltaSecs = Math.floor((now - lastTickRef.current) / 1000);
          
          if (deltaSecs > 0) {
            if (timerType === 'amrap' || timerType === 'rest') {
              setTimeLeft(prev => {
                const newTime = prev - deltaSecs;
                if (newTime <= 0) {
                  setTimerRunning(false);
                  if (timerType === 'rest') {
                    SoundServiceInstance.playDigitalBuzzer(4);
                    if (currentRound < totalRounds) {
                      setTimeout(() => setTimeLeft(restSeconds), 100);
                    }
                  } else {
                    SoundServiceInstance.playDigitalBuzzer();
                    if (timerType === 'amrap' && activeTimerBlockId) {
                      onAmrapComplete(activeTimerBlockId);
                    }
                  }
                  return 0;
                }
                return newTime;
              });
            } else if (timerType === 'fortime') {
              setElapsedTime(prev => prev + deltaSecs);
            }
          }
          lastTickRef.current = now;
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // App went to background
        lastTickRef.current = Date.now();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [timerRunning, timerType, activeTimerBlockId, onAmrapComplete]);

  // Prep Countdown Effect
  useEffect(() => {
    let interval: any = null;
    if (timerPrepCountdown !== null && timerPrepCountdown > 0) {
      SoundServiceInstance.playTick();
      interval = setInterval(() => {
        setTimerPrepCountdown(prev => {
          if (prev && prev <= 1) {
            clearInterval(interval);
            SoundServiceInstance.playBoxingBell();
            setTimerPrepCountdown(null);
            setTimerRunning(true);
            lastTickRef.current = Date.now(); // Initialize active timer sync
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
    } else if (timerPrepCountdown === 0) {
      setTimerPrepCountdown(null);
      setTimerRunning(true);
      lastTickRef.current = Date.now();
    }
    return () => clearInterval(interval);
  }, [timerPrepCountdown]);

  // Active Timer Tick
  useEffect(() => {
    let interval: any = null;
    if (timerRunning) {
      lastTickRef.current = Date.now();
      interval = setInterval(() => {
        lastTickRef.current = Date.now();
        if (timerType === 'amrap' || timerType === 'rest') {
          setTimeLeft(prev => {
            if (prev <= 1) {
              setTimerRunning(false);
              clearInterval(interval);
              if (timerType === 'rest') {
                SoundServiceInstance.playDigitalBuzzer(4);
                if (currentRound < totalRounds) {
                  setTimeout(() => setTimeLeft(restSeconds), 100);
                }
              } else {
                SoundServiceInstance.playDigitalBuzzer();
                if (timerType === 'amrap' && activeTimerBlockId) {
                  onAmrapComplete(activeTimerBlockId);
                }
              }
              return 0;
            }
            return prev - 1;
          });
        } else if (timerType === 'fortime') {
          setElapsedTime(prev => prev + 1);
        }
      }, 1000);
    } else {
      clearInterval(interval);
      lastTickRef.current = null;
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerType, activeTimerBlockId, onAmrapComplete]);

  const startTimerForBlock = useCallback((block: ProgramBlockParams) => {
    setActiveTimerBlockId(block.id);
    const metaType = block.metadata?.timing_system || block.metadata?.type;
    const structure = block.metadata?.structure || block.metadata?.type;
    
    let tr = 1;
    if (block.metadata?.rounds) {
      tr = parseInt(String(block.metadata.rounds), 10);
      if (isNaN(tr) || tr < 1) tr = 1;
    }
    setTotalRounds(tr);
    setCurrentRound(0); // Starts at 0, meaning hasn't finished round 1 yet
    
    if (metaType === 'amrap') {
      setTimerType('amrap');
      const min = parseInt(String(block.metadata?.time_cap_min || block.metadata?.timer_seconds || '10'), 10);
      setTimeLeft(min * 60);
      setTimerRunning(false);
      setTimerPrepCountdown(5);
      setTimerModalVisible(true);
    } else if (metaType === 'fortime') {
      setTimerType('fortime');
      setElapsedTime(0);
      setTimerRunning(false);
      setTimerPrepCountdown(5);
      setTimerModalVisible(true);
    } else if (structure === 'superset' || structure === 'circuit' || structure === 'ladder') {
      setTimerType('rest');
      const restSec = parseInt(String(block.metadata?.rest_after_round || '90'), 10);
      setRestSeconds(restSec);
      setTimeLeft(restSec);
      setTimerRunning(false);
      setTimerPrepCountdown(null); // Wait for user to click START REST
      setTimerModalVisible(true);
    }
  }, []);

  const handleStartRest = useCallback(() => {
    if (timeLeft === restSeconds) {
      setCurrentRound(prev => prev + 1);
    }
    setTimerRunning(true);
  }, [timeLeft, restSeconds]);

  const formatTimerString = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }, []);

  return {
    activeTimerBlockId,
    timerType,
    timeLeft,
    timerRunning,
    setTimerRunning,
    elapsedTime,
    timerModalVisible,
    setTimerModalVisible,
    timerPrepCountdown,
    startTimerForBlock,
    formatTimerString,
    currentRound,
    totalRounds,
    handleStartRest,
    restSeconds
  };
}
