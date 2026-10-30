import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { t } from '../../i18n';
import { LastTimeLog, LastTimeResult } from '../../lib/lastTimeLog';
import { Feel } from '../../lib/performance';

// The (!) beside an exercise name and the panel it opens: what the athlete
// did the last time this exercise was logged (src/lib/lastTimeLog.ts).
// Shared by the exercise row and every inline logger (rounds, ladder,
// AMRAP, For Time), which replace the row while a block is open.

const FEELS: Feel[] = ['hard', 'ok', 'good', 'strong', 'beast'];

export const LastTimeButton: React.FC<{ open: boolean; onPress: () => void; theme: any; solidCardBg?: string }> = ({ open, onPress, theme, solidCardBg }) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={t('blocks.lastTimeShow')}
    accessibilityState={{ expanded: open }}
    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    style={[styles.lastBtn, { borderColor: theme.accentText, backgroundColor: open ? theme.accentText : 'transparent' }]}
  >
    <Text style={[styles.lastBtnText, { color: open ? solidCardBg ?? theme.card.background : theme.accentText }]}>!</Text>
  </TouchableOpacity>
);

const resultText = (r: LastTimeResult) =>
  r.kind === 'finished' ? t('blocks.lastTimeFinished', { time: r.value })
  : r.kind === 'completed' ? t('blocks.lastTimeRounds', { value: r.value })
  : r.kind === 'ladder' ? t('blocks.lastTimeLadder', { value: r.value })
  : t('blocks.lastTimeWeight', { kg: r.value });

export const LastTimePanel: React.FC<{ log: LastTimeLog; theme: any; title?: string }> = ({ log, theme, title }) => {
  const allPlanned = log.sets.length > 0 && log.sets.every(s => s.planned);
  const summary = [
    log.rpe != null ? t('blocks.lastTimeRpe', { rpe: log.rpe }) : null,
    FEELS.includes(log.feel as Feel) ? t(`logModal.feel_${log.feel as Feel}`) : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={[styles.lastPanel, { borderColor: theme.card.border, borderStartColor: theme.accentText }]}>
      {title ? <Text style={[styles.lastTitle, { color: theme.text.primary }]} numberOfLines={1}>{title.toUpperCase()}</Text> : null}
      <Text style={[styles.lastHeader, { color: theme.accentText }]} numberOfLines={1}>
        {t('blocks.lastTimeHeader', { week: log.weekNumber, day: log.dayName })}
      </Text>
      {log.notDone ? (
        <Text style={[styles.lastLine, { color: theme.text.secondary }]}>{t('blocks.lastTimeNotDone')}</Text>
      ) : log.sets.map(s => {
        const parts = [
          s.hold != null ? t('blocks.lastTimeHold', { seconds: s.hold }) : s.reps != null ? t('blocks.lastTimeReps', { reps: s.reps }) : null,
          (s.weight ?? 0) > 0 ? `${s.weight} ${t('blocks.kg')}` : null,
          s.planned && !allPlanned ? t('blocks.lastTimeAsPlanned') : null,
        ].filter(Boolean).join(' · ');
        return (
          <View key={s.setIndex} style={styles.lastSetRow}>
            <Text style={[styles.lastSetLabel, { color: theme.text.tertiary }]}>{t('blocks.lastTimeSet', { n: s.setIndex })}</Text>
            <Text style={[styles.lastLine, { color: theme.text.primary }]}>{parts}</Text>
          </View>
        );
      })}
      {allPlanned ? <Text style={[styles.lastLine, { color: theme.text.tertiary }]}>{t('blocks.lastTimeAsPlanned')}</Text> : null}
      {log.results.map((r, i) => (
        <Text key={i} style={[styles.lastLine, { color: theme.text.secondary }]}>{resultText(r)}</Text>
      ))}
      {summary ? <Text style={[styles.lastLine, { color: theme.text.secondary }]}>{summary}</Text> : null}
      {log.note ? <Text style={[styles.lastNote, { color: theme.text.secondary }]}>“{log.note}”</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  lastBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },
  lastBtnText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 12,
    lineHeight: 14,
  },
  lastPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 3,
  },
  lastTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  lastHeader: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  lastSetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  lastSetLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    minWidth: 44,
  },
  lastLine: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
  },
  lastNote: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
