import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoundServiceInstance } from '../../lib/SoundService';

interface LadderRungPickerProps {
  theme: any;
  bronzeGold: string;
  sequence: number[];
  onChange: (summary: string) => void;
  // Optional inline mode: when restSeconds/onFinalize are provided, this
  // renders its own rest timer + "LOG BLOCK" button so it can be embedded
  // directly in the block card instead of only inside the log modal.
  restSeconds?: number;
  onFinalize?: (summary: string) => void;
  // Label shown in the timer square — 'REST' for a manual rest-between-rungs
  // timer, 'AMRAP' when this ladder is time-boxed by an AMRAP cap, or
  // 'FOR TIME' when it counts up toward a cap instead of down.
  timerLabel?: 'REST' | 'AMRAP' | 'FOR TIME';
  // Count up from 0 (FOR TIME) instead of counting down from restSeconds
  // (REST / AMRAP). Auto-stops at restSeconds if provided as a cap.
  countUp?: boolean;
  // Ladders are structurally single-exercise, so the demo video applies to
  // the whole block rather than a per-row list like the other structures.
  exerciseName?: string;
  youtubeUrl?: string;
  isVideoActive?: boolean;
  onToggleVideo?: (url: string) => void;
}

export const LadderRungPicker: React.FC<LadderRungPickerProps> = ({
  theme,
  bronzeGold,
  sequence,
  onChange,
  restSeconds,
  onFinalize,
  timerLabel = 'REST',
  countUp = false,
  exerciseName,
  youtubeUrl,
  isVideoActive,
  onToggleVideo,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [extraReps, setExtraReps] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  // Which rung the plain REST-mode ladder is currently on — auto-advances each
  // time a rest period finishes naturally, so the warrior doesn't have to
  // manually tap through the sequence rung by rung.
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const intervalRef = useRef<any>(null);
  const isInline = !!onFinalize;
  // Continuous single-attempt timers (AMRAP cap or FOR TIME stopwatch) support
  // tap-to-reset since there's one timer for the whole ladder; plain REST
  // (repeatable between rungs) intentionally doesn't need that affordance.
  const supportsTapReset = countUp || timerLabel === 'AMRAP';
  // Only plain REST-between-rungs ladders auto-progress round by round — AMRAP
  // and FOR TIME ladders run one continuous timer for the whole attempt instead.
  const isRestMode = !countUp && timerLabel === 'REST';
  const isLastRound = currentRoundIndex === sequence.length - 1;

  useEffect(() => {
    if (restActive) {
      intervalRef.current = setInterval(() => {
        setRestTimeLeft(prev => {
          if (countUp) {
            const next = prev + 1;
            if (restSeconds && restSeconds > 0 && next >= restSeconds) {
              clearInterval(intervalRef.current);
              setRestActive(false);
              SoundServiceInstance.playDigitalBuzzer(2);
              return restSeconds;
            }
            return next;
          }
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setRestActive(false);
            SoundServiceInstance.playDigitalBuzzer(2);
            if (isRestMode) {
              setCurrentRoundIndex(idx => {
                const nextIdx = Math.min(sequence.length - 1, idx + 1);
                setSelectedIndex(nextIdx);
                setExtraReps(0);
                return nextIdx;
              });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [restActive]);

  const formatRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleTimerTap = () => {
    if (!supportsTapReset) return;
    Alert.alert(
      `${timerLabel} TIMER`,
      'Do you want to reset the timer or continue?',
      [
        { text: 'CONTINUE', style: 'cancel' },
        {
          text: 'RESET',
          style: 'destructive',
          onPress: () => {
            clearInterval(intervalRef.current);
            setRestActive(false);
            setRestTimeLeft(countUp ? 0 : (restSeconds || 0));
          },
        },
      ]
    );
  };

  const buildSummary = (index: number, extra: number) => {
    const rungValue = sequence[index];
    let summary = extra > 0
      ? `Reached rung of ${rungValue} reps, plus ${extra} extra reps`
      : `Reached rung of ${rungValue} reps`;

    // FOR TIME ladders: append how long it took, or that the cap ran out first —
    // submitting before the cap is a finish time, hitting the cap means "how far did you get."
    if (countUp) {
      const capped = !!restSeconds && restTimeLeft >= restSeconds;
      summary += capped
        ? ` (time cap reached at ${formatRest(restTimeLeft)})`
        : ` in ${formatRest(restTimeLeft)}`;
    }

    return summary;
  };

  const emit = (index: number, extra: number) => {
    onChange(buildSummary(index, extra));
  };

  const handleStartRest = () => {
    if (!restSeconds || restSeconds <= 0) return;
    if (isRestMode) {
      setSelectedIndex(currentRoundIndex);
      setExtraReps(0);
    }
    setRestTimeLeft(countUp ? 0 : restSeconds);
    setRestActive(true);
    SoundServiceInstance.playBoxingBell();
  };

  const handleFinishLastRound = () => {
    setSelectedIndex(currentRoundIndex);
    setExtraReps(0);
  };

  const handleFinalize = () => {
    if (selectedIndex === null || !onFinalize) return;
    onFinalize(buildSummary(selectedIndex, extraReps));
  };

  const handleSelectRung = (index: number) => {
    setSelectedIndex(index);
    setExtraReps(0);
    if (isRestMode) setCurrentRoundIndex(index);
    emit(index, 0);
  };

  const adjustExtra = (delta: number) => {
    if (selectedIndex === null) return;
    const next = Math.max(0, extraReps + delta);
    setExtraReps(next);
    emit(selectedIndex, next);
  };

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardGradientBorder}
      >
        <View style={[styles.card, { backgroundColor: theme.card.background }]}>
          {exerciseName ? (
            <View style={styles.exerciseNameRow}>
              <Text style={[styles.exerciseNameText, { color: theme.text.primary, flex: 1, marginRight: youtubeUrl ? 0 : 8 }]} numberOfLines={1}>{exerciseName.toUpperCase()}</Text>
              {youtubeUrl && onToggleVideo ? (
                <TouchableOpacity
                  onPress={() => onToggleVideo(youtubeUrl)}
                  style={[styles.demoBtn, { backgroundColor: isVideoActive ? 'rgba(255,82,82,0.12)' : 'transparent', borderColor: theme.card.border }]}
                >
                  <Text style={{ color: '#FF5252', fontSize: 9 }}>{isVideoActive ? '✕' : '▶'}</Text>
                  <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.primary }}>
                    {isVideoActive ? 'CLOSE' : 'WATCH'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <View style={styles.sequenceBadge}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sequenceLabel, { color: bronzeGold }]}>LADDER SEQUENCE</Text>
              <Text style={[styles.sequenceValue, { color: theme.text.primary }]}>
                {sequence.join(', ')} REPS
              </Text>
            </View>

            {isInline && isRestMode && !!restSeconds && restSeconds > 0 && (
              <View style={[styles.roundBox, { borderColor: theme.card.border }]}>
                <Text style={[styles.timerSquareLabel, { color: theme.text.primary }]}>ROUND {currentRoundIndex + 1}</Text>
                <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14 }}>
                  {sequence[currentRoundIndex]}
                </Text>
              </View>
            )}

            {isInline && !!restSeconds && restSeconds > 0 && (
              restActive ? (
                <TouchableOpacity
                  disabled={!supportsTapReset}
                  onPress={handleTimerTap}
                  style={[styles.timerSquare, { borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.03)' }]}
                >
                  <Text style={[styles.timerSquareLabel, { color: theme.text.primary }]}>{timerLabel}</Text>
                  <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14 }}>
                    {formatRest(restTimeLeft)}
                  </Text>
                </TouchableOpacity>
              ) : isRestMode && isLastRound ? (
                // Last rung has nothing left to rest before — no more timer needed,
                // just confirm it's selected so the warrior can log the block.
                <TouchableOpacity onPress={handleFinishLastRound}>
                  <LinearGradient
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.timerSquareGradientBorder}
                  >
                    <View style={[styles.timerSquare, { borderWidth: 0, backgroundColor: theme.card.background }]}>
                      <Text style={[styles.timerSquareLabel, { color: theme.text.primary }]}>LAST ROUND</Text>
                      <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14 }}>
                        FINISH
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleStartRest}>
                  <LinearGradient
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.timerSquareGradientBorder}
                  >
                    <View style={[styles.timerSquare, { borderWidth: 0, backgroundColor: theme.card.background }]}>
                      <Text style={[styles.timerSquareLabel, { color: theme.text.primary }]}>START TIME</Text>
                      <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14 }}>
                        {countUp ? '0:00' : formatRest(restSeconds)}
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )
            )}
          </View>

          <Text style={[styles.reachedLabel, { color: theme.text.tertiary }]}>HOW FAR DID YOU REACH?</Text>

          <View style={styles.rungRow}>
            {sequence.map((val, index) => {
              const isSelected = index === selectedIndex;
              const isPastSelected = selectedIndex !== null && index < selectedIndex;
              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleSelectRung(index)}
                  style={[
                    styles.rungBtn,
                    {
                      borderColor: isSelected ? bronzeGold : isPastSelected ? '#4CAF50' : theme.card.border,
                      backgroundColor: isSelected ? 'rgba(200,160,64,0.15)' : isPastSelected ? 'rgba(76,175,80,0.08)' : 'transparent',
                    },
                  ]}
                >
                  <Text style={{
                    fontFamily: 'BarlowCondensed-ExtraBold',
                    fontSize: 11,
                    color: isSelected ? bronzeGold : isPastSelected ? '#4CAF50' : theme.text.secondary,
                  }}>
                    {val}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedIndex !== null && (
            <View style={styles.extraRow}>
              <Text style={[styles.extraLabel, { color: theme.text.secondary }]}>EXTRA REPS IN THAT ROUND</Text>
              <View style={styles.stepperGroup}>
                <TouchableOpacity style={[styles.stepperBtn, { borderColor: theme.card.border }]} onPress={() => adjustExtra(-1)}>
                  <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.extraValue, { color: theme.text.primary }]}>{extraReps}</Text>
                <TouchableOpacity style={[styles.stepperBtn, { borderColor: theme.card.border }]} onPress={() => adjustExtra(1)}>
                  <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </LinearGradient>

      {isInline && (
        <TouchableOpacity disabled={selectedIndex === null} onPress={handleFinalize}>
          {selectedIndex !== null ? (
            <LinearGradient
              colors={['#7E57C2', '#FF5252', '#FF7043']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionBtn}
            >
              <Text style={{ color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
                LOG BLOCK
              </Text>
            </LinearGradient>
          ) : (
            <View style={[styles.actionBtn, { borderWidth: 1, borderColor: theme.card.border }]}>
              <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
                LOG BLOCK
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardGradientBorder: {
    padding: 1.2,
    borderRadius: 9,
  },
  card: {
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  exerciseNameText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 14,
    flexShrink: 1,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 3,
    paddingHorizontal: 8,
    gap: 4,
  },
  sequenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sequenceLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  sequenceValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 14,
    marginTop: 2,
  },
  timerSquareGradientBorder: {
    padding: 1.2,
    borderRadius: 7,
  },
  timerSquare: {
    width: 90,
    height: 54,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  roundBox: {
    width: 64,
    height: 54,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timerSquareLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  reachedLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  rungRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rungBtn: {
    minWidth: 38,
    flexGrow: 1,
    flexBasis: '17%',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: 'center',
  },
  extraRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  extraLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    flex: 1,
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
  extraValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    minWidth: 20,
    textAlign: 'center',
  },
  actionBtn: {
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
