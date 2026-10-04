import React from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LeapLoop } from './LeapLoop';
import { JourneyPointsSummary, PointsEntry, dayLetterKey } from '../../lib/journeyPoints';
import { t, isArabic } from '../../i18n';

// Handoff Points History sheet (opened from the counter or the streak
// strip): the total, streak + best streak, this week's bars and the ledger
// of the last few days with points.

const ACCENT = '#FF5A55';
const BAR_MAX = 52;

function formatTotal(n: number) {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function entryLabel(e: PointsEntry): string {
  const n = Number(e.label) || 0;
  switch (e.source) {
    case 'program_day':
      return e.label ?? t('journeyPoints.history.programDay');
    case 'side_quest':
      return t('journeyPoints.history.sideQuest');
    case 'trial':
      return t('journeyPoints.history.trial');
    case 'task_book':
      return t('journeyPoints.history.book', { count: n });
    case 'task_run':
      return t('journeyPoints.history.run', { count: n });
    case 'task_meal':
      return t('journeyPoints.history.meal');
    case 'perfect_day':
      return t('journeyPoints.perfectDay');
    case 'streak':
      return t('journeyPoints.fx.streakTitle', { count: n });
  }
}

/** "TODAY", "YESTERDAY", else a short date. Dates are local YYYY-MM-DD. */
function dayHeading(date: string, today: string): string {
  if (date === today) return t('journeyPoints.history.today');
  const d = new Date(`${date}T12:00:00`);
  const y = new Date(`${today}T12:00:00`);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t('journeyPoints.history.yesterday');
  return d.toLocaleDateString(isArabic ? 'ar' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

interface PointsHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  summary: JourneyPointsSummary;
  isLight: boolean;
}

export function PointsHistorySheet({ visible, onClose, summary, isLight }: PointsHistorySheetProps) {
  const s = isLight ? light : dark;
  const weekPts = summary.week.reduce((n, d) => n + d.points, 0);
  const max = Math.max(1, ...summary.week.map((d) => d.points));

  // Ledger grouped by date, newest first; today always shown (maybe empty).
  const dates = Array.from(new Set([summary.today, ...summary.recent.map((e) => e.date)])).sort((a, b) => (a < b ? 1 : -1));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, s.sheet]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, s.handle]} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>{t('journeyPoints.points')}</Text>
            <View style={styles.headRow}>
              <Text style={[styles.total, s.ink]}>{formatTotal(summary.total)}</Text>
              <View style={styles.streakCol}>
                <View style={styles.streakRow}>
                  <LeapLoop
                    size={16}
                    variant={summary.trained_today ? 'lit' : 'solid'}
                    color={isLight ? '#C9C9CE' : '#3A3A3C'}
                    dots={false}
                    strokeWidth={2}
                    spinMs={summary.trained_today ? 3000 : 0}
                  />
                  <Text style={[styles.streakText, s.ink]}>{t('journeyPoints.fx.streakTitle', { count: summary.streak })}</Text>
                </View>
                <Text style={styles.best}>{t('journeyPoints.history.best', { count: summary.best_streak })}</Text>
              </View>
            </View>

            <View style={[styles.weekCard, s.card]}>
              <View style={styles.weekHead}>
                <Text style={styles.weekLabel}>{t('journeyPoints.history.thisWeek')}</Text>
                <Text style={[styles.weekPts, s.ink]}>{t('journeyPoints.history.pts', { count: weekPts })}</Text>
              </View>
              <View style={styles.bars}>
                {summary.week.map((d) => (
                  <View key={d.date} style={styles.barCol}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(3, (d.points / max) * BAR_MAX),
                          backgroundColor: d.date === summary.today ? ACCENT : isLight ? '#D8D8DC' : '#3A3A3C',
                        },
                      ]}
                    />
                    <Text style={styles.barDay}>{t(`journeyPoints.dayLetter.${dayLetterKey(d.date)}`)}</Text>
                  </View>
                ))}
              </View>
            </View>

            {dates.map((date) => {
              const entries = summary.recent.filter((e) => e.date === date);
              const dayPts = entries.reduce((n, e) => n + e.points, 0);
              return (
                <View key={date}>
                  <Text style={styles.dayHeading}>
                    {dayHeading(date, summary.today)} · {dayPts}
                  </Text>
                  {entries.length === 0 ? (
                    <Text style={styles.empty}>{t('journeyPoints.history.emptyToday')}</Text>
                  ) : (
                    entries.map((e, i) => (
                      <View key={`${e.source}-${i}`} style={[styles.entry, i < entries.length - 1 && s.entryDivider]}>
                        <Text style={[styles.entryLabel, s.ink]} numberOfLines={1}>
                          {entryLabel(e)}
                        </Text>
                        <Text style={styles.entryPts}>+{e.points}</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: Dimensions.get('window').height * 0.82,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  handle: { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  eyebrow: { color: ACCENT, fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 13, letterSpacing: 3.6, textAlign: 'left' },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  total: { fontFamily: 'BebasNeue-Regular', fontSize: 60, lineHeight: 60 },
  streakCol: { alignItems: 'flex-end', paddingBottom: 4 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakText: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 15 },
  best: { color: '#8A8A8E', fontFamily: 'PlusJakartaSans-Regular', fontSize: 12, marginTop: 2 },
  weekCard: { marginTop: 22, padding: 14, borderRadius: 18 },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between' },
  weekLabel: { color: '#8A8A8E', fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13 },
  weekPts: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 13 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 70, marginTop: 12 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' },
  bar: { width: '100%', borderRadius: 5 },
  barDay: { color: '#6A6A6E', fontFamily: 'PlusJakartaSans-Bold', fontSize: 10 },
  dayHeading: {
    marginTop: 22,
    color: '#8A8A8E',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 12,
    letterSpacing: 2.4,
    textAlign: 'left',
  },
  empty: { paddingVertical: 12, color: '#5E6068', fontFamily: 'PlusJakartaSans-Regular', fontSize: 14, textAlign: 'left' },
  entry: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, gap: 12 },
  entryLabel: { flex: 1, fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14, textAlign: 'left' },
  entryPts: { color: '#FF7C78', fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 14 },
});

const dark = StyleSheet.create({
  sheet: { backgroundColor: '#131313', borderColor: 'rgba(255,255,255,0.08)' },
  handle: { backgroundColor: '#3A3A3C' },
  ink: { color: '#FFFFFF' },
  card: { backgroundColor: '#1A1A1A' },
  entryDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
});

const light = StyleSheet.create({
  sheet: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)' },
  handle: { backgroundColor: '#D8D8DC' },
  ink: { color: '#151515' },
  card: { backgroundColor: '#F6F6F7' },
  entryDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
});
