import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoundServiceInstance } from '../../lib/SoundService';
import { t } from '../../i18n';
import { useBackgroundTimerAlerts } from '../../hooks/useBackgroundTimerAlerts';
import { useAnchoredCountdown } from '../../hooks/useAnchoredTimer';
import { parseKg } from '../../lib/parseKg';
import { WeightStepper } from './WeightStepper';

export interface CircuitExercise {
  id: string | number;
  name: string;
  targetReps: number;
  youtube_url?: string;
  /** Weighted exercise: the round gets a kg entry for it. */
  isWeighted?: boolean;
  /** Its weight in the previous round: where + starts from an empty box. */
  suggestedWeight?: number;
}

interface CircuitRoundCardProps {
  roundNumber: number;
  totalRounds: number;
  exercises: CircuitExercise[];
  restSeconds: number;
  theme: any;
  bronzeGold: string;
  isLocked: boolean;
  completed: boolean;
  onRoundComplete: (entries: { exerciseId: string | number; reps: number; weight?: number }[]) => void;
  activeVideoExerciseId?: string | number | null;
  onToggleVideo?: (exerciseId: string | number, url: string) => void;
  // Reports whether this round currently holds unsaved progress (a running
  // rest timer, or reps edited away from the target defaults) — the parent
  // block card uses this to decide whether collapsing needs a confirm.
  onActiveChange?: (roundNumber: number, active: boolean) => void;
}

export const CircuitRoundCard: React.FC<CircuitRoundCardProps> = ({
  roundNumber,
  totalRounds,
  exercises,
  restSeconds,
  theme,
  bronzeGold,
  isLocked,
  completed,
  onRoundComplete,
  activeVideoExerciseId,
  onToggleVideo,
  onActiveChange,
}) => {
  const [repsByExercise, setRepsByExercise] = useState<Record<string | number, number>>(
    () => Object.fromEntries(exercises.map(ex => [ex.id, ex.targetReps]))
  );
  // kg typed per weighted exercise this round ('' = none).
  const [kgByExercise, setKgByExercise] = useState<Record<string | number, string>>({});

  const entriesFor = (reps: Record<string | number, number>, kg: Record<string | number, string>) =>
    exercises.map(ex => ({
      exerciseId: ex.id,
      reps: reps[ex.id] ?? 0,
      weight: ex.isWeighted ? parseKg(kg[ex.id] ?? '') : undefined,
    }));
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const intervalRef = useRef<any>(null);

  // Counted from its end time, so rest keeps going while the app is in the
  // background (see useAnchoredCountdown).
  useAnchoredCountdown(restActive, restTimeLeft, setRestTimeLeft, () => {
    setRestActive(false);
    SoundServiceInstance.playDigitalBuzzer(2);
  });

  useEffect(() => {
    if (completed) {
      onActiveChange?.(roundNumber, false);
      return;
    }
    const repsEdited = exercises.some(ex => (repsByExercise[ex.id] ?? 0) !== ex.targetReps);
    onActiveChange?.(roundNumber, restActive || repsEdited);
  }, [restActive, repsByExercise, completed]);

  // Rest over while the app is in the background: notify.
  useBackgroundTimerAlerts(() =>
    restActive && restTimeLeft > 0
      ? [{ inSeconds: restTimeLeft, title: t('timerAlerts.restOver'), body: t('timerAlerts.restOverBody') }]
      : []
  );

  const formatRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Reps and kg stay editable after the round is done (until the block is
  // logged): a correction re-saves the round.
  const adjustReps = (exerciseId: string | number, delta: number) => {
    const next = { ...repsByExercise, [exerciseId]: Math.max(0, (repsByExercise[exerciseId] ?? 0) + delta) };
    setRepsByExercise(next);
    if (completed) onRoundComplete(entriesFor(next, kgByExercise));
  };

  const setKg = (exerciseId: string | number, text: string) => {
    const next = { ...kgByExercise, [exerciseId]: text };
    setKgByExercise(next);
    if (completed) onRoundComplete(entriesFor(repsByExercise, next));
  };

  const handleCompleteRound = () => {
    if (completed || isLocked) return;
    onRoundComplete(entriesFor(repsByExercise, kgByExercise));
    SoundServiceInstance.playBoxingBell();
    if (restSeconds > 0 && roundNumber < totalRounds) {
      setRestTimeLeft(restSeconds);
      setRestActive(true);
    }
  };

  return (
    <View style={[styles.card, { borderColor: completed ? '#4CAF50' : theme.card.border, opacity: isLocked ? 0.5 : 1 }]}>
      <View style={styles.header}>
        <Text style={[styles.roundLabel, { color: completed ? '#4CAF50' : theme.text.primary }]}>
          {t('timers.roundOf', { round: roundNumber, total: totalRounds })}
        </Text>
        {isLocked && <Text style={{ fontSize: 12 }}>🔒</Text>}
      </View>

      {exercises.map(ex => (
        <View key={ex.id} style={[styles.exerciseBlock, { borderColor: theme.card.border }]}>
        <View style={styles.exerciseRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <Text style={[styles.exName, { color: theme.text.primary, marginRight: ex.youtube_url ? 0 : 8 }]} numberOfLines={1}>{ex.name.toUpperCase()}</Text>
            {ex.youtube_url && onToggleVideo ? (
              <TouchableOpacity
                onPress={() => onToggleVideo(ex.id, ex.youtube_url!)}
                style={[styles.demoBtn, { backgroundColor: activeVideoExerciseId === ex.id ? 'rgba(255,82,82,0.12)' : 'transparent', borderColor: theme.card.border }]}
              >
                <Text style={{ color: '#FF5252', fontSize: 9 }}>{activeVideoExerciseId === ex.id ? '✕' : '▶'}</Text>
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.primary }}>
                  {activeVideoExerciseId === ex.id ? t('timers.close') : t('timers.watch')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.stepperGroup}>
            <TouchableOpacity
              style={[styles.stepperBtn, { borderColor: theme.card.border }]}
              disabled={isLocked}
              accessibilityRole="button"
              accessibilityLabel={`${ex.name} ${t('blocks.reps')} −`}
              onPress={() => adjustReps(ex.id, -1)}
            >
              <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.repsValue, { color: theme.text.primary }]}>{repsByExercise[ex.id] ?? 0}</Text>
            <TouchableOpacity
              style={[styles.stepperBtn, { borderColor: theme.card.border }]}
              disabled={isLocked}
              accessibilityRole="button"
              accessibilityLabel={`${ex.name} ${t('blocks.reps')} +`}
              onPress={() => adjustReps(ex.id, 1)}
            >
              <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
          {ex.isWeighted && !isLocked && (
            <WeightStepper
              value={kgByExercise[ex.id] ?? ''}
              onChange={text => setKg(ex.id, text)}
              suggested={ex.suggestedWeight}
              theme={theme}
              accent={bronzeGold}
            />
          )}
        </View>
      ))}

      {restActive ? (
        <View style={[styles.actionBtn, { marginTop: 4, borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
          <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16 }}>
            {t('timers.restingTime', { time: formatRest(restTimeLeft) })}
          </Text>
        </View>
      ) : completed ? (
        <View style={[styles.actionBtn, { marginTop: 4, borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.1)' }]}>
          <Text style={{ color: '#4CAF50', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
            {t('timers.roundDone')}
          </Text>
        </View>
      ) : (
        <TouchableOpacity disabled={isLocked} onPress={handleCompleteRound}>
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.actionBtnGradientBorder, { opacity: isLocked ? 0.5 : 1 }]}
          >
            <View style={[styles.actionBtn, { borderWidth: 0, backgroundColor: theme.card.background }]}>
              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
                {t('timers.completeRoundRest')}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roundLabel: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 1,
  },
  exerciseBlock: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    flexShrink: 1,
    marginRight: 8,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 3,
    paddingHorizontal: 8,
    gap: 4,
    marginRight: 8,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 16,
    fontFamily: 'BarlowCondensed-Bold',
  },
  repsValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    minWidth: 24,
    textAlign: 'center',
  },
  actionBtnGradientBorder: {
    padding: 1.2,
    borderRadius: 7,
    marginTop: 4,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
