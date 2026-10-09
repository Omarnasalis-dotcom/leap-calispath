import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoundServiceInstance } from '../../lib/SoundService';
import { t } from '../../i18n';
import { parseKg } from '../../lib/parseKg';
import { WeightStepper } from './WeightStepper';
import { useBackgroundTimerAlerts } from '../../hooks/useBackgroundTimerAlerts';

export interface SetLogEntry {
  setIndex: number;
  reps: number;
  weight?: number;
  /** Hold exercises: seconds held (reps is then 0). */
  hold?: number;
}

interface SetRowProps {
  setIndex: number;
  targetReps: number;
  /** Planned hold (s): the row counts seconds instead of reps. */
  holdSeconds?: number;
  isWeighted?: boolean;
  restSeconds: number;
  theme: any;
  bronzeGold: string;
  completed: boolean;
  /** Last set of the block: no rest after it, the block is done. */
  isLastSet?: boolean;
  /** Weight of the previous set: where the kg + starts from an empty box. */
  suggestedWeight?: number;
  onSetComplete: (entry: SetLogEntry) => void;
  // Reps/kg edits on a set that hasn't been ticked yet, so a typed weight
  // still gets saved when the block is logged without tapping ✓.
  onSetDraft?: (entry: SetLogEntry) => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  setIndex,
  targetReps,
  holdSeconds,
  isWeighted,
  restSeconds,
  theme,
  bronzeGold,
  completed,
  isLastSet,
  suggestedWeight,
  onSetComplete,
  onSetDraft,
}) => {
  // Hold exercises count seconds (starting at the planned hold), everything
  // else counts reps; entries carry the value in the matching field.
  const isHold = !!holdSeconds && holdSeconds > 0;
  const [reps, setReps] = useState(isHold ? holdSeconds! : targetReps);
  const entry = (value: number, weightText: string): SetLogEntry =>
    isHold
      ? { setIndex, reps: 0, hold: value, weight: parseKg(weightText) }
      : { setIndex, reps: value, weight: parseKg(weightText) };
  const [weight, setWeight] = useState('');
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const intervalRef = useRef<any>(null);
  // Wall-clock anchor for the rest countdown. JS timers are suspended while
  // the app is backgrounded, so a pure `prev - 1` tick silently loses the
  // whole suspended duration and the displayed rest time under-counts. Same
  // approach as ArenaWorkoutScreen's trial timer.
  const restEndTimeRef = useRef<number | null>(null);

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
          SoundServiceInstance.playDigitalBuzzer(2);
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
          SoundServiceInstance.playDigitalBuzzer(2);
        }
      }
    });
    return () => sub.remove();
  }, [restActive]);

  // Rest over while the app is in the background: notify.
  useBackgroundTimerAlerts(() =>
    restActive && restEndTimeRef.current !== null
      ? [{ inSeconds: (restEndTimeRef.current - Date.now()) / 1000, title: t('timerAlerts.restOver'), body: t('timerAlerts.restOverBody') }]
      : []
  );

  const formatRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // The SET badge only lights up green once rest has actually finished, not the
  // instant the checkmark is tapped — that's the cue to move on to the next set.
  const isFullyDone = completed && !restActive;

  const handleCheck = () => {
    if (completed) return;
    onSetComplete(entry(reps, weight));
    SoundServiceInstance.playBoxingBell();
    // No rest after the block's last set: 3 sets = 2 rests.
    if (restSeconds > 0 && !isLastSet) {
      setRestTimeLeft(restSeconds);
      setRestActive(true);
    }
  };

  // Reps/weight stay editable after the set is done (during rest and after
  // it) until the block is logged: a correction re-saves the logged set.
  const save = (value: number, weightText: string) => {
    if (completed) onSetComplete(entry(value, weightText));
    else onSetDraft?.(entry(value, weightText));
  };

  const adjustReps = (delta: number) => {
    const next = Math.max(0, reps + delta);
    setReps(next);
    save(next, weight);
  };

  const handleWeightChange = (text: string) => {
    setWeight(text);
    save(reps, text);
  };


  return (
    <View style={[styles.card, { borderColor: theme.card.border }]}>
    <View style={styles.row}>
      <View style={[styles.setBadge, { borderColor: isFullyDone ? '#4CAF50' : theme.card.border, backgroundColor: isFullyDone ? 'rgba(76,175,80,0.12)' : 'transparent' }]}>
        <Text style={[styles.setBadgeText, { color: isFullyDone ? '#4CAF50' : theme.text.secondary }]}>
          SET {setIndex}
        </Text>
      </View>

      <View style={styles.stepperGroup}>
        <TouchableOpacity
          style={[styles.stepperBtn, { borderColor: theme.card.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('blocks.reps')} −`}
          onPress={() => adjustReps(-1)}
        >
          <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.repsValue, { color: theme.text.primary }]}>{reps}</Text>
        <TouchableOpacity
          style={[styles.stepperBtn, { borderColor: theme.card.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('blocks.reps')} +`}
          onPress={() => adjustReps(1)}
        >
          <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>+</Text>
        </TouchableOpacity>
        <Text style={[styles.repsLabel, { color: theme.text.tertiary }]}>{isHold ? t('blocks.sec') : t('blocks.reps')}</Text>
      </View>


      {restActive ? (
        <View style={[styles.checkBtn, { borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
          <Text style={[styles.checkBtnLabel, { color: theme.text.primary }]}>{t('blocks.rest')}</Text>
          <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 13 }}>{formatRest(restTimeLeft)}</Text>
        </View>
      ) : isFullyDone ? (
        <View style={[styles.checkBtn, { borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.1)' }]}>
          <Text style={{ color: '#4CAF50', fontSize: 16, fontWeight: 'bold' }}>✓</Text>
        </View>
      ) : (
        <TouchableOpacity onPress={handleCheck}>
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.checkBtnGradientBorder}
          >
            <View style={[styles.checkBtn, { borderWidth: 0, backgroundColor: theme.card.background }]}>
              <Text style={[styles.checkBtnLabel, { color: theme.text.primary }]}>{t('blocks.start')}</Text>
              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 9 }}>{t('blocks.rest')}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
      {isWeighted && (
        // Own line with − / + so it reads as something to fill in.
        <WeightStepper value={weight} onChange={handleWeightChange} suggested={suggestedWeight} theme={theme} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  setBadgeText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
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
  repsLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  checkBtnGradientBorder: {
    padding: 1.2,
    borderRadius: 7,
  },
  checkBtn: {
    width: 52,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  checkBtnLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8,
    letterSpacing: 0.5,
  },
});
