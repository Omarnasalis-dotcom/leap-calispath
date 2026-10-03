import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlockConceptParser } from '../../lib/BlockConceptParser';
import { SoundServiceInstance } from '../../lib/SoundService';
import { t } from '../../i18n';
import { useBackgroundTimerAlerts, TimerAlert } from '../../hooks/useBackgroundTimerAlerts';

/** Get-ready countdown before a hold timer starts. */
const HOLD_READY_SECONDS = 5;

export interface ExerciseDetail {
  id: string | number;
  name: string;
  youtube_url: string;
  sets: string | number;
  reps: string;
  rest_seconds: string | number;
  hold_seconds?: string | number;
  is_weighted?: boolean;
  notes: string;
}

interface WarriorExerciseRowProps {
  exercise: ExerciseDetail;
  theme: any;
  solidCardBg: string;
  bronzeGold: string;
  blockMetadata?: any;
  onToggleVideo: (exerciseId: string | number, url: string) => void;
  isVideoActive?: boolean;
  hideSetControls?: boolean;
}

export const WarriorExerciseRow: React.FC<WarriorExerciseRowProps> = ({
  exercise,
  theme,
  solidCardBg,
  bronzeGold,
  blockMetadata,
  onToggleVideo,
  isVideoActive,
  hideSetControls,
}) => {
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [restCompleted, setRestCompleted] = useState(false);
  const intervalRef = useRef<any>(null);
  // Wall-clock anchor for the rest countdown. JS timers are suspended while
  // the app is backgrounded, so a pure `prev - 1` tick silently loses the
  // whole suspended duration and the displayed rest time under-counts. Same
  // approach as ArenaWorkoutScreen's trial timer.
  const restEndTimeRef = useRef<number | null>(null);

  const restSecs = parseInt(String(exercise.rest_seconds || '0'), 10);

  const startRest = () => {
    if (restSecs <= 0) return;
    setRestCompleted(false);
    setRestActive(true);
    setRestTimeLeft(restSecs);
    SoundServiceInstance.playBoxingBell();
  };

  const cancelRest = () => {
    clearInterval(intervalRef.current);
    restEndTimeRef.current = null;
    setRestActive(false);
    setRestTimeLeft(0);
  };

  useEffect(() => {
    if (restActive && restTimeLeft > 0) {
      if (restEndTimeRef.current === null) {
        restEndTimeRef.current = Date.now() + restTimeLeft * 1000;
      }
      intervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((restEndTimeRef.current! - Date.now()) / 1000));
        setRestTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(intervalRef.current);
          setRestActive(false);
          setRestCompleted(true);
          SoundServiceInstance.playDigitalBuzzer(3);
        }
      }, 1000);
    } else {
      restEndTimeRef.current = null;
    }
    return () => clearInterval(intervalRef.current);
  }, [restActive]);

  // Recompute the moment the app returns to the foreground, so the displayed
  // time is correct immediately rather than after the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && restActive && restEndTimeRef.current !== null) {
        const remaining = Math.max(0, Math.round((restEndTimeRef.current - Date.now()) / 1000));
        setRestTimeLeft(remaining);
        if (remaining <= 0) {
          setRestActive(false);
          setRestCompleted(true);
          SoundServiceInstance.playDigitalBuzzer(3);
        }
      }
    });
    return () => sub.remove();
  }, [restActive]);

  // Hold timer on the HOLD badge (straight sets): tap → 5 s get-ready
  // countdown → the planned hold counting down → buzzer. Tap again to stop.
  // Same wall-clock anchoring as the rest timer.
  const holdSecs = parseInt(String(exercise.hold_seconds || '0'), 10) || 0;
  const [holdPhase, setHoldPhase] = useState<'idle' | 'ready' | 'holding' | 'done'>('idle');
  const [holdLeft, setHoldLeft] = useState(0);
  const holdEndRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<any>(null);

  // Phase/seconds mirrored in refs so the interval reads them without
  // side effects inside state updaters.
  const holdPhaseRef = useRef<'idle' | 'ready' | 'holding' | 'done'>('idle');
  const holdLeftRef = useRef(0);
  const setPhase = (p: 'idle' | 'ready' | 'holding' | 'done') => {
    holdPhaseRef.current = p;
    setHoldPhase(p);
  };
  const setLeft = (n: number) => {
    holdLeftRef.current = n;
    setHoldLeft(n);
  };

  const stopHold = () => {
    clearInterval(holdIntervalRef.current);
    holdEndRef.current = null;
    setPhase('idle');
    setLeft(0);
  };

  const startHold = () => {
    if (holdSecs <= 0) return;
    holdEndRef.current = Date.now() + HOLD_READY_SECONDS * 1000;
    setLeft(HOLD_READY_SECONDS);
    setPhase('ready');
    SoundServiceInstance.playTick();
  };

  const tickHold = () => {
    if (holdEndRef.current === null) return;
    const remaining = Math.max(0, Math.ceil((holdEndRef.current - Date.now()) / 1000));
    if (holdPhaseRef.current === 'ready') {
      if (remaining <= 0) {
        // The hold starts when the get-ready ended (maybe while the app was
        // in the background), not when this tick ran.
        holdEndRef.current = holdEndRef.current + holdSecs * 1000;
        setPhase('holding');
        SoundServiceInstance.playBoxingBell();
        tickHold();
        return;
      } else if (remaining !== holdLeftRef.current) {
        setLeft(remaining);
        SoundServiceInstance.playTick();
      }
    } else if (holdPhaseRef.current === 'holding') {
      if (remaining !== holdLeftRef.current) setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(holdIntervalRef.current);
        holdEndRef.current = null;
        setPhase('done');
        SoundServiceInstance.playDigitalBuzzer(3);
      }
    }
  };

  const holdRunning = holdPhase === 'ready' || holdPhase === 'holding';
  useEffect(() => {
    if (!holdRunning) return;
    clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = setInterval(tickHold, 250);
    return () => clearInterval(holdIntervalRef.current);
  }, [holdRunning]);

  // Catch up straight away when the app returns to the foreground.
  useEffect(() => {
    if (!holdRunning) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tickHold();
    });
    return () => sub.remove();
  }, [holdRunning]);

  // Rest over / hold done while the app is in the background.
  useBackgroundTimerAlerts(() => {
    const now = Date.now();
    const alerts: TimerAlert[] = [];
    if (restActive && restEndTimeRef.current !== null) {
      alerts.push({ inSeconds: (restEndTimeRef.current - now) / 1000, title: t('timerAlerts.restOver'), body: t('timerAlerts.restOverBody') });
    }
    if (holdEndRef.current !== null && holdPhaseRef.current === 'ready') {
      const startIn = (holdEndRef.current - now) / 1000;
      alerts.push({ inSeconds: startIn + holdSecs, title: t('timerAlerts.holdDone'), body: t('timerAlerts.holdDoneBody') });
    } else if (holdEndRef.current !== null && holdPhaseRef.current === 'holding') {
      alerts.push({ inSeconds: (holdEndRef.current - now) / 1000, title: t('timerAlerts.holdDone'), body: t('timerAlerts.holdDoneBody') });
    }
    return alerts;
  });

  const formatRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={[styles.exerciseRow, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
      <View style={[styles.exInfoRow, { justifyContent: 'flex-start' }]}>
        <Text style={[styles.exTitle, { color: theme.text.primary, flex: 1 }]} numberOfLines={1}>
          {exercise.name.toUpperCase()} {exercise.is_weighted && <Text style={{ color: theme.accent, fontSize: 13 }}>{t('blocks.weighted')}</Text>}
        </Text>

        {exercise.youtube_url ? (
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 12, padding: 1.2, marginLeft: 8 }}
          >
            <TouchableOpacity
              onPress={() => onToggleVideo(exercise.id, exercise.youtube_url)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isVideoActive ? 'rgba(255,82,82,0.12)' : solidCardBg,
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 11,
                gap: 4
              }}
            >
              <Text style={{ color: '#FF5252', fontSize: 9 }}>{isVideoActive ? '✕' : '▶'}</Text>
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.primary }}>
                {isVideoActive ? t('blocks.close') : t('blocks.watch')}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : null}
      </View>

      {/* Sets / Reps / Rest Badges Row */}
      <View style={styles.exDetailsRow}>
        {(blockMetadata?.timing_system === 'amrap' || blockMetadata?.timing_system === 'fortime' || blockMetadata?.type === 'amrap' || blockMetadata?.type === 'fortime') ? (
          <View style={[styles.detailBadge, { borderColor: theme.card.border, flex: 1, alignItems: 'flex-start' }]}>
            <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>{t('blocks.repsPerRound')}</Text>
            <Text style={[styles.detailValue, { color: theme.text.primary, fontSize: 13, marginTop: 2 }]}>{exercise.reps}</Text>
          </View>
        ) : blockMetadata?.timing_system === 'tabata' ? (
          <View style={[styles.detailBadge, { borderColor: '#FF5252', flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,82,82,0.05)' }]}>
            <Text style={[styles.detailLabel, { color: '#FF5252' }]}>{t('blocks.tabataInterval')}</Text>
            <Text style={[styles.detailValue, { color: '#FF5252', fontSize: 13, marginTop: 2 }]}>
              {t('blocks.tabataWorkRest', { work: blockMetadata.tabata_work_seconds || '20', rest: blockMetadata.tabata_rest_seconds || '10' })}
            </Text>
          </View>
        ) : (blockMetadata?.structure === 'superset' || blockMetadata?.structure === 'circuit' || blockMetadata?.type === 'superset' || blockMetadata?.type === 'circuit') ? (
          <>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>{t('blocks.reps')}</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.reps}</Text>
            </View>
            {exercise.hold_seconds && parseInt(String(exercise.hold_seconds)) > 0 && (
              <View style={[styles.detailBadge, { borderColor: '#7E57C2', backgroundColor: 'rgba(126,87,194,0.08)' }]}>
                <Text style={[styles.detailLabel, { color: '#7E57C2' }]}>{t('blocks.hold')}</Text>
                <Text style={[styles.detailValue, { color: '#7E57C2' }]}>{t('units.sec', { value: exercise.hold_seconds })}</Text>
              </View>
            )}
          </>
        ) : (!blockMetadata || (!blockMetadata.type && !blockMetadata.structure) || blockMetadata.type === 'single' || blockMetadata.structure === 'single') ? (
          <>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>{t('blocks.sets')}</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.sets}</Text>
            </View>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>{t('blocks.reps')}</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.reps}</Text>
            </View>
            {holdSecs > 0 && (() => {
              const color = holdPhase === 'holding' ? '#FF7043' : holdPhase === 'done' ? '#4CAF50' : '#7E57C2';
              const bg = holdPhase === 'holding' ? 'rgba(255,112,67,0.1)' : holdPhase === 'done' ? 'rgba(76,175,80,0.1)' : 'rgba(126,87,194,0.08)';
              return (
                <TouchableOpacity
                  onPress={holdRunning ? stopHold : startHold}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('blocks.hold')} ${t('units.sec', { value: holdSecs })}`}
                  style={[styles.detailBadge, { borderColor: color, backgroundColor: bg, minWidth: 64 }]}
                >
                  <Text style={[styles.detailLabel, { color }]}>
                    {holdPhase === 'ready' ? t('blocks.holdReady') : holdPhase === 'holding' ? t('blocks.holding') : holdPhase === 'done' ? t('blocks.holdDone') : t('blocks.hold')}
                  </Text>
                  {holdRunning ? (
                    <Text style={[styles.detailValue, { color, fontSize: 16 }]}>
                      {holdPhase === 'ready' ? holdLeft : formatRest(holdLeft)}
                    </Text>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={[styles.detailValue, { color }]}>{t('units.sec', { value: holdSecs })}</Text>
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name={holdPhase === 'done' ? 'restart' : 'timer-outline'} size={11} color="#FFFFFF" />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })()}
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>{t('blocks.rest')}</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{t('units.sec', { value: exercise.rest_seconds })}</Text>
            </View>
            {!hideSetControls && restSecs > 0 && (
              <TouchableOpacity
                onPress={restActive ? cancelRest : startRest}
                style={[styles.detailBadge, {
                  borderColor: restActive ? '#FF7043' : restCompleted ? '#4CAF50' : '#7E57C2',
                  backgroundColor: restActive ? 'rgba(255,112,67,0.1)' : restCompleted ? 'rgba(76,175,80,0.1)' : 'rgba(126,87,194,0.1)',
                  minWidth: 56,
                }]}
              >
                <Text style={[styles.detailLabel, { color: restActive ? '#FF7043' : restCompleted ? '#4CAF50' : '#7E57C2' }]}>
                  {restActive ? t('blocks.resting') : restCompleted ? t('blocks.restDone') : t('blocks.startRest')}
                </Text>
                <Text style={[styles.detailValue, { color: restActive ? '#FF7043' : restCompleted ? '#4CAF50' : '#7E57C2', fontSize: restActive ? 16 : 11 }]}>
                  {restActive ? formatRest(restTimeLeft) : restCompleted ? t('blocks.nextSet') : '▶'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : blockMetadata?.structure === 'ladder' ? (
          <View style={[styles.detailBadge, { borderColor: bronzeGold, flex: 1, alignItems: 'flex-start', backgroundColor: 'rgba(200,160,64,0.05)' }]}>
            <Text style={[styles.detailLabel, { color: bronzeGold }]}>{t('blocks.ladderSequence')}</Text>
            <Text style={[styles.detailValue, { color: theme.text.primary, fontSize: 13, marginTop: 2 }]}>
              {BlockConceptParser.getLadderSequence(blockMetadata || {})}
            </Text>
          </View>
        ) : (
          <View style={[styles.detailBadge, { borderColor: theme.card.border, flex: 1, alignItems: 'flex-start' }]}>
            <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>{t('blocks.targetDetails')}</Text>
            <Text style={[styles.detailValue, { color: theme.text.primary, fontSize: 13, marginTop: 2 }]}>{exercise.reps || t('blocks.asAssigned')}</Text>
          </View>
        )}
      </View>

      {exercise.notes ? (
        <Text style={[styles.exNotes, { color: theme.text.secondary }]}>
          NOTE: {exercise.notes}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  exerciseRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
  },
  exInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 0.6,
    flex: 1,
  },
  exDetailsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  detailBadge: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.008)',
  },
  detailLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 7,
    letterSpacing: 0.8,
    marginBottom: 2,
    opacity: 0.7,
  },
  detailValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  exNotes: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    marginTop: 8,
    opacity: 0.75,
  },
});
