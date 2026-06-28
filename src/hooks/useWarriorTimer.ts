import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Alert, AppStateStatus } from 'react-native';
import { SoundServiceInstance } from '../lib/SoundService';

export interface ProgramBlockParams {
  id: string | number;
  metadata?: any;
}

interface UseWarriorTimerProps {
  onAmrapComplete: (blockId: string | number) => void;
  onForTimeComplete: (blockId: string | number, elapsedSeconds: number) => void;
}

export function useWarriorTimer({ onAmrapComplete, onForTimeComplete }: UseWarriorTimerProps) {
  const [activeTimerBlockId, setActiveTimerBlockId] = useState<string | number | null>(null);
  const [timerType, setTimerType] = useState<'amrap' | 'fortime' | 'rest' | 'tabata' | null>(null);
  const [tabataPhase, setTabataPhase] = useState<'work' | 'rest'>('work');
  const [tabataWorkSecs, setTabataWorkSecs] = useState(20);
  const [tabataRestSecs, setTabataRestSecs] = useState(10);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerModalVisible, setTimerModalVisible] = useState<boolean>(false);
  const [timerPrepCountdown, setTimerPrepCountdown] = useState<number | null>(null);

  const [currentRound, setCurrentRound] = useState<number>(1);
  const [totalRounds, setTotalRounds] = useState<number>(1);
  const [restSeconds, setRestSeconds] = useState<number>(0);
  const [timeCapSecs, setTimeCapSecs] = useState<number>(0);

  // Timer completions are detected inside setState updaters (the tick
  // effects below), which run during this hook's own render — calling
  // onAmrapComplete/onForTimeComplete directly from there would update the
  // parent component's state while this one is still rendering. Recording
  // the completion as local state and firing the actual callback from an
  // effect defers it until after render commits, which is safe.
  const [completionEvent, setCompletionEvent] = useState<
    | { type: 'amrap'; blockId: string | number }
    | { type: 'fortime'; blockId: string | number; elapsedSeconds: number }
    | null
  >(null);

  const lastTickRef = useRef<number | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!completionEvent) return;
    if (completionEvent.type === 'amrap') {
      onAmrapComplete(completionEvent.blockId);
    } else {
      onForTimeComplete(completionEvent.blockId, completionEvent.elapsedSeconds);
    }
    setCompletionEvent(null);
  }, [completionEvent, onAmrapComplete, onForTimeComplete]);

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
                      setCompletionEvent({ type: 'amrap', blockId: activeTimerBlockId });
                    }
                  }
                  return 0;
                }
                return newTime;
              });
            } else if (timerType === 'fortime') {
              setElapsedTime(prev => {
                const nextTime = prev + deltaSecs;
                if (timeCapSecs > 0 && nextTime >= timeCapSecs) {
                  setTimerRunning(false);
                  SoundServiceInstance.playDigitalBuzzer();
                  if (activeTimerBlockId) {
                    setCompletionEvent({ type: 'fortime', blockId: activeTimerBlockId, elapsedSeconds: timeCapSecs });
                  }
                  return timeCapSecs;
                }
                return nextTime;
              });
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
  }, [timerRunning, timerType, activeTimerBlockId, onAmrapComplete, onForTimeComplete, timeCapSecs]);

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
                  setCompletionEvent({ type: 'amrap', blockId: activeTimerBlockId });
                }
              }
              return 0;
            }
            return prev - 1;
          });
        } else if (timerType === 'fortime') {
          setElapsedTime(prev => {
            const nextTime = prev + 1;
            if (timeCapSecs > 0 && nextTime >= timeCapSecs) {
              setTimerRunning(false);
              clearInterval(interval);
              SoundServiceInstance.playDigitalBuzzer();
              if (activeTimerBlockId) {
                setCompletionEvent({ type: 'fortime', blockId: activeTimerBlockId, elapsedSeconds: timeCapSecs });
              }
              return timeCapSecs;
            }
            return nextTime;
          });
        } else if (timerType === 'tabata') {
          setTimeLeft(prev => {
            if (prev <= 1) {
              setTabataPhase(currentPhase => {
                if (currentPhase === 'work') {
                  SoundServiceInstance.playDigitalBuzzer(2);
                  setCurrentRound(r => r);
                  setTimeLeft(tabataRestSecs);
                  return 'rest';
                } else {
                  setCurrentRound(r => {
                    const nextRound = r + 1;
                    if (nextRound > totalRounds) {
                      setTimerRunning(false);
                      clearInterval(interval);
                      SoundServiceInstance.playDigitalBuzzer(4);
                      if (activeTimerBlockId) setCompletionEvent({ type: 'amrap', blockId: activeTimerBlockId });
                      return r;
                    }
                    SoundServiceInstance.playBoxingBell();
                    setTimeLeft(tabataWorkSecs);
                    return nextRound;
                  });
                  return 'work';
                }
              });
              return 0;
            }
            return prev - 1;
          });
        }
      }, 1000);
    } else {
      clearInterval(interval);
      lastTickRef.current = null;
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerType, activeTimerBlockId, onAmrapComplete, onForTimeComplete, timeCapSecs]);

  // Cleanup when modal closes
  useEffect(() => {
    if (!timerModalVisible) {
      setTimerPrepCountdown(null);
      setTimerRunning(false);
    }
  }, [timerModalVisible]);

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
      const capMin = parseInt(String(block.metadata?.time_cap_min || '15'), 10);
      setTimeCapSecs(capMin * 60);
      setTimerRunning(false);
      setTimerPrepCountdown(5);
      setTimerModalVisible(true);
    } else if (metaType === 'tabata') {
      setTimerType('tabata');
      const workSec = parseInt(String(block.metadata?.tabata_work_seconds || '20'), 10);
      const restSec = parseInt(String(block.metadata?.tabata_rest_seconds || '10'), 10);
      const tabRounds = parseInt(String(block.metadata?.tabata_rounds || '8'), 10);
      setTabataWorkSecs(workSec);
      setTabataRestSecs(restSec);
      setTotalRounds(tabRounds);
      setCurrentRound(1);
      setTabataPhase('work');
      setTimeLeft(workSec);
      setTimerRunning(false);
      setTimerPrepCountdown(5);
      setTimerModalVisible(true);
    } else if (structure === 'superset' || structure === 'circuit' || structure === 'ladder' || structure === 'single') {
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
    restSeconds,
    tabataPhase,
    tabataWorkSecs,
    tabataRestSecs
  };
}
