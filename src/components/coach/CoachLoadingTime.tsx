import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import { t } from '../../i18n';

const WORD_MS = 3000;
const TICK_MS = 500;

/** 12s, then 1:05 from a minute on. */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return t('coach.elapsedSeconds', { seconds });
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Whole seconds since `since`. Ticks in the component using it, so the chat
 * itself doesn't re-render every second while a reply is on its way. */
function useElapsedSeconds(since: number): number {
  const read = () => Math.max(0, Math.floor((Date.now() - since) / 1000));
  const [seconds, setSeconds] = useState(read);
  useEffect(() => {
    setSeconds(read());
    const id = setInterval(() => setSeconds(read()), TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since]);
  return seconds;
}

/** Hidden from screen readers, or they'd read out every second. */
function ElapsedText({ seconds, style }: { seconds: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.time, style]}
    >
      {formatElapsed(seconds)}
    </Text>
  );
}

export function CoachElapsed({ since, style }: { since: number; style?: StyleProp<TextStyle> }) {
  return <ElapsedText seconds={useElapsedSeconds(since)} style={style} />;
}

/** Before the first real step arrives: Thinking and Building in turn, with the wait. */
export function CoachLoadingLabel({ since, color }: { since: number; color: string }) {
  const seconds = useElapsedSeconds(since);
  const thinking = Math.floor((seconds * 1000) / WORD_MS) % 2 === 0;
  return (
    <View style={styles.row}>
      <Text style={[styles.word, { color }]}>{t(thinking ? 'coach.thinking' : 'coach.building')}</Text>
      <ElapsedText seconds={seconds} style={{ color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginStart: 8 },
  word: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, minWidth: 68 },
  time: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
