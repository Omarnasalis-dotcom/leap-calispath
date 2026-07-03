import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoundServiceInstance } from '../../lib/SoundService';

export interface SetLogEntry {
  setIndex: number;
  reps: number;
  weight?: number;
}

interface SetRowProps {
  setIndex: number;
  targetReps: number;
  isWeighted?: boolean;
  restSeconds: number;
  theme: any;
  bronzeGold: string;
  completed: boolean;
  onSetComplete: (entry: SetLogEntry) => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  setIndex,
  targetReps,
  isWeighted,
  restSeconds,
  theme,
  bronzeGold,
  completed,
  onSetComplete,
}) => {
  const [reps, setReps] = useState(targetReps);
  const [weight, setWeight] = useState('');
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (restActive && restTimeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setRestTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setRestActive(false);
            SoundServiceInstance.playDigitalBuzzer(2);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [restActive]);

  const formatRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // The SET badge only lights up green once rest has actually finished, not the
  // instant the checkmark is tapped — that's the cue to move on to the next set.
  const isFullyDone = completed && !restActive;

  const handleCheck = () => {
    if (completed) return;
    const parsedWeight = weight ? parseFloat(weight) : undefined;
    onSetComplete({ setIndex, reps, weight: parsedWeight });
    SoundServiceInstance.playBoxingBell();
    if (restSeconds > 0) {
      setRestTimeLeft(restSeconds);
      setRestActive(true);
    }
  };

  // Reps/weight stay editable through the rest period — the set isn't
  // "fully done" until rest finishes (see isFullyDone) — and re-submit the
  // logged entry so a correction made during rest isn't lost.
  const adjustReps = (delta: number) => {
    if (isFullyDone) return;
    const next = Math.max(0, reps + delta);
    setReps(next);
    if (restActive) {
      const parsedWeight = weight ? parseFloat(weight) : undefined;
      onSetComplete({ setIndex, reps: next, weight: parsedWeight });
    }
  };

  const handleWeightChange = (text: string) => {
    setWeight(text);
    if (restActive) {
      const parsedWeight = text ? parseFloat(text) : undefined;
      onSetComplete({ setIndex, reps, weight: parsedWeight });
    }
  };

  return (
    <View style={[styles.row, { borderColor: theme.card.border }]}>
      <View style={[styles.setBadge, { borderColor: isFullyDone ? '#4CAF50' : theme.card.border, backgroundColor: isFullyDone ? 'rgba(76,175,80,0.12)' : 'transparent' }]}>
        <Text style={[styles.setBadgeText, { color: isFullyDone ? '#4CAF50' : theme.text.secondary }]}>
          SET {setIndex}
        </Text>
      </View>

      <View style={styles.stepperGroup}>
        <TouchableOpacity
          style={[styles.stepperBtn, { borderColor: theme.card.border }]}
          disabled={isFullyDone}
          onPress={() => adjustReps(-1)}
        >
          <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.repsValue, { color: theme.text.primary }]}>{reps}</Text>
        <TouchableOpacity
          style={[styles.stepperBtn, { borderColor: theme.card.border }]}
          disabled={isFullyDone}
          onPress={() => adjustReps(1)}
        >
          <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>+</Text>
        </TouchableOpacity>
        <Text style={[styles.repsLabel, { color: theme.text.tertiary }]}>REPS</Text>
      </View>

      {isWeighted && (
        <TextInput
          style={[styles.weightInput, { color: theme.text.primary, borderColor: theme.card.border }]}
          keyboardType="decimal-pad"
          placeholder="KG"
          placeholderTextColor={theme.text.tertiary}
          value={weight}
          editable={!isFullyDone}
          onChangeText={handleWeightChange}
        />
      )}

      {restActive ? (
        <View style={[styles.checkBtn, { borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
          <Text style={[styles.checkBtnLabel, { color: theme.text.primary }]}>REST</Text>
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
              <Text style={[styles.checkBtnLabel, { color: theme.text.primary }]}>START</Text>
              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 9 }}>REST</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
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
  weightInput: {
    width: 50,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    textAlign: 'center',
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
