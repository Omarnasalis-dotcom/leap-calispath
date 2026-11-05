import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { blockTimerSeconds, BlockTimerKind, LiveBlockTimer } from '../../hooks/useBlockTimer';
import { t } from '../../i18n';

const label = (kind: BlockTimerKind) =>
  kind === 'rest' ? t('blocks.resting') : kind === 'hold' ? t('blocks.holding') : kind === 'amrap' ? 'AMRAP' : 'FOR TIME';

/** The running timer on a closed block's card. Ticks by itself, so the card
 * and the workout screen don't re-render every second. */
export function BlockTimerChip({ timer, color, background, textColor }: {
  timer: LiveBlockTimer;
  color: string;
  background: string;
  textColor: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timer]);

  const s = blockTimerSeconds(timer, now);
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <MaterialCommunityIcons name="timer-outline" size={13} color={color} />
      <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>{label(timer.kind)}</Text>
      <Text style={[styles.time, { color: textColor }]}>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: 13,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  label: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1 },
  time: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
});
