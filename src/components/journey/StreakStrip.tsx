import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LeapLoop } from './LeapLoop';
import { WeekDay, dayLetterKey } from '../../lib/journeyPoints';
import { t } from '../../i18n';

// Handoff 7-day strip (right of the Journey top bar), Leap loops for
// flames: the last 7 days, today on the end. The streak counts training
// sessions (owner decision 2026-10-04), so a lit day is a day a program
// card was finished.

const ACCENT = '#FF5A55';

function TodayLoop({ lit, isLight }: { lit: boolean; isLight: boolean }) {
  // Ignite: scale .2 → 1.35 → 1 (.6s) the moment today lights up.
  const scale = useRef(new Animated.Value(1)).current;
  const wasLit = useRef(lit);
  useEffect(() => {
    if (lit && !wasLit.current) {
      scale.setValue(0.2);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.35, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
      ]).start();
    }
    wasLit.current = lit;
  }, [lit, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {lit ? (
        <LeapLoop size={14} dots={false} variant="solid" color="#FF8A3D" spinMs={3000} glow={5} />
      ) : (
        <LeapLoop size={14} dots={false} variant="dashed" color={isLight ? '#B8B8BE' : '#4A4A4E'} />
      )}
    </Animated.View>
  );
}

interface StreakStripProps {
  week: WeekDay[];
  today: string;
  streak: number;
  isLight: boolean;
  onPress: () => void;
}

export function StreakStrip({ week, today, streak, isLight, onPress }: StreakStripProps) {
  const trainedToday = week.some((d) => d.date === today && d.trained);
  const idle = isLight ? '#E2E2E4' : '#2A2A2A';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('journeyPoints.streakLabel', { count: streak })}
      style={styles.wrap}
    >
      <Text style={[styles.label, { color: trainedToday ? '#FF7C78' : '#8A8A8E' }]} numberOfLines={1}>
        {t('journeyPoints.streakLabel', { count: streak })}
      </Text>
      <View style={styles.days}>
        {week.map((d) => {
          const isToday = d.date === today;
          return (
            <View key={d.date} style={styles.day}>
              <View style={styles.loopSlot}>
                {isToday ? (
                  <TodayLoop lit={d.trained} isLight={isLight} />
                ) : d.trained ? (
                  <LeapLoop size={12} dots={false} variant="solid" color={ACCENT} opacity={0.8} />
                ) : (
                  <LeapLoop size={12} dots={false} variant="solid" color={idle} />
                )}
              </View>
              <Text style={[styles.letter, { color: isToday ? (isLight ? '#151515' : '#FFFFFF') : '#5E5E64' }]}>
                {t(`journeyPoints.dayLetter.${dayLetterKey(d.date)}`)}
              </Text>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: 4 },
  label: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 9, letterSpacing: 2 },
  days: { flexDirection: 'row', gap: 3 },
  day: { width: 13, alignItems: 'center', gap: 2 },
  loopSlot: { height: 15, justifyContent: 'center', alignItems: 'center' },
  letter: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 8 },
});
