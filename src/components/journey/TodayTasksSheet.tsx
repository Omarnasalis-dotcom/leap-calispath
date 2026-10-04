import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { JourneyPointsSummary, JourneyTask, questPaidToday, todaySegments } from '../../lib/journeyPoints';
import { t, isRTL } from '../../i18n';

// Handoff "Today's Tasks" sheet (opened from the medallion): today's
// points, the extras' daily cap bar, the program card and side quest
// (auto, tap → jump to them on the path), the three extras (tap an open one
// → the "+" tray, tap a ticked one → undo) and Perfect day.

const ACCENT = '#FF5A55';

interface TodayTasksSheetProps {
  visible: boolean;
  onClose: () => void;
  summary: JourneyPointsSummary;
  /** Today's program card name, or null when there's no program. */
  cardName: string | null;
  /** Side quest attached to today's card (title), or null if none. */
  questTitle: string | null;
  /** That quest's slot key ("w2_s1"), or null if none. */
  questSlotKey: string | null;
  questSkipped: boolean;
  isLight: boolean;
  busyTask: JourneyTask | null;
  onGoToCard: () => void;
  onGoToQuest: () => void;
  /** Open the "+" tray at this task (book/run picker). */
  onOpenTask: (task: 'book' | 'run') => void;
  onLog: (task: JourneyTask, amount: number | null) => void;
  onUndo: (task: JourneyTask) => void;
}

function Check({ on }: { on: boolean }) {
  return (
    <View style={[styles.check, on ? styles.checkOn : styles.checkOff]}>
      {on && <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />}
    </View>
  );
}

export function TodayTasksSheet({
  visible,
  onClose,
  summary,
  cardName,
  questTitle,
  questSlotKey,
  questSkipped,
  isLight,
  busyTask,
  onGoToCard,
  onGoToQuest,
  onOpenTask,
  onLog,
  onUndo,
}: TodayTasksSheetProps) {
  const s = isLight ? light : dark;
  const v = summary.values;
  const todayEntries = summary.recent.filter((e) => e.date === summary.today);
  const todayPts = todayEntries.reduce((sum, e) => sum + e.points, 0);
  const honorPts = todayEntries
    .filter((e) => e.source === 'task_book' || e.source === 'task_run' || e.source === 'task_meal')
    .reduce((sum, e) => sum + e.points, 0);
  const cap = v.honor_daily_cap ?? 60;
  const questDone = questPaidToday(summary, questSlotKey);
  const tick = (task: JourneyTask) => summary.tasks_today.find((x) => x.task === task);

  // Same segments as the medallion, so "N tasks to go" always matches it.
  const left = todaySegments(summary, questSlotKey).filter((f) => !f).length;
  const perfect = todayEntries.some((e) => e.source === 'perfect_day');

  const chevron = (
    <MaterialCommunityIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={22} color="#6A6A6E" />
  );

  const taskRow = (task: JourneyTask, label: string, sub: string) => {
    const tk = tick(task);
    // No program → no workout to pay extras out against, and no "+" row.
    const enabled = cardName !== null;
    return (
      <TouchableOpacity
        key={task}
        style={[styles.row, s.row, !enabled && styles.rowDisabled]}
        activeOpacity={0.8}
        disabled={busyTask !== null || !enabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!tk }}
        onPress={() => {
          if (tk) onUndo(task);
          else if (task === 'meal') onLog('meal', null);
          else onOpenTask(task);
        }}
      >
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, s.ink]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Text style={[styles.rowPts, { color: ACCENT }]}>+{v[`task_${task}`] ?? 0}</Text>
        <Check on={!!tk} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, s.sheet]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, s.handle]} />
          <View style={styles.header}>
            <Text style={styles.title}>{t('journeyPoints.todaysTasks')}</Text>
            <Text style={[styles.todayPts, s.ink]}>
              {todayPts} <Text style={styles.todayPtsUnit}>{t('journeyPoints.ptsToday')}</Text>
            </Text>
          </View>

          <View style={styles.capRow}>
            <View style={[styles.capTrack, s.capTrack]}>
              <View style={[styles.capFill, { width: `${Math.min(100, (honorPts / Math.max(cap, 1)) * 100)}%` }]} />
            </View>
            <Text style={styles.capLabel}>{t('journeyPoints.bonusCap', { pts: honorPts, cap })}</Text>
          </View>

          <View style={styles.rows}>
            {cardName !== null && (
              <TouchableOpacity style={[styles.row, s.row]} activeOpacity={0.8} onPress={onGoToCard} accessibilityRole="button">
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, s.ink]} numberOfLines={1}>
                    {t('journeyPoints.programCardRow', { name: cardName })}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {t('journeyPoints.autoWhenLogged')}
                  </Text>
                </View>
                <Text style={[styles.rowPts, { color: ACCENT }]}>+{v.program_day ?? 0}</Text>
                {summary.trained_today ? <Check on /> : chevron}
              </TouchableOpacity>
            )}
            {questTitle !== null && (
              <TouchableOpacity style={[styles.row, s.row]} activeOpacity={0.8} onPress={onGoToQuest} accessibilityRole="button">
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, s.ink]} numberOfLines={1}>
                    {t('journeyPoints.sideQuestRow', { name: questTitle })}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {questSkipped ? t('journey.skipped') : t('journeyPoints.autoWhenCompleted')}
                  </Text>
                </View>
                <Text style={[styles.rowPts, { color: ACCENT }]}>+{v.side_quest ?? 0}</Text>
                {questDone ? <Check on /> : chevron}
              </TouchableOpacity>
            )}
            {taskRow(
              'book',
              tick('book') ? t('journeyPoints.bookDoneRow', { count: tick('book')!.amount ?? 0 }) : t('journeyPoints.task.book'),
              t('journeyPoints.bookSub')
            )}
            {taskRow(
              'run',
              tick('run') ? t('journeyPoints.runDoneRow', { count: tick('run')!.amount ?? 0 }) : t('journeyPoints.task.run'),
              t('journeyPoints.runSub')
            )}
            {taskRow('meal', t('journeyPoints.mealRow'), t('journeyPoints.mealSub'))}
          </View>

          <View style={[styles.perfect, perfect ? styles.perfectOn : s.perfectOff]}>
            <MaterialCommunityIcons name="star" size={18} color={ACCENT} />
            <View style={styles.rowText}>
              <Text style={[styles.perfectLabel, s.ink]}>{t('journeyPoints.perfectDay')}</Text>
              <Text style={styles.rowSub}>
                {perfect ? t('journeyPoints.perfectEarned') : t('journeyPoints.tasksToGo', { count: left })}
              </Text>
            </View>
            <Text style={[styles.rowPts, { color: '#FF7C78' }]}>+{v.perfect_day ?? 0}</Text>
          </View>

          <Text style={styles.footer}>
            {t('journeyPoints.footer')}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
  },
  handle: { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { color: ACCENT, fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 13, letterSpacing: 3.6 },
  todayPts: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 14 },
  todayPtsUnit: { color: '#8A8A8E', fontFamily: 'PlusJakartaSans-SemiBold' },
  capRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  capTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  capFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 4 },
  capLabel: { color: '#8A8A8E', fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 12 },
  rows: { gap: 8, marginTop: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, borderRadius: 16 },
  rowText: { flex: 1, minWidth: 0 },
  rowDisabled: { opacity: 0.45 },
  rowLabel: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, textAlign: 'left' },
  rowSub: { color: '#8A8A8E', fontFamily: 'PlusJakartaSans-Regular', fontSize: 12, textAlign: 'left' },
  rowPts: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 13 },
  check: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: ACCENT },
  checkOff: { borderWidth: 1.5, borderColor: '#48484A' },
  perfect: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  perfectOn: { borderColor: ACCENT, backgroundColor: 'rgba(255,90,85,0.1)' },
  perfectLabel: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, textAlign: 'left' },
  footer: { marginTop: 12, color: '#5E6068', fontFamily: 'PlusJakartaSans-Regular', fontSize: 12, textAlign: 'center' },
});

const dark = StyleSheet.create({
  sheet: { backgroundColor: '#131313', borderColor: 'rgba(255,255,255,0.08)' },
  handle: { backgroundColor: '#3A3A3C' },
  ink: { color: '#FFFFFF' },
  capTrack: { backgroundColor: '#262626' },
  row: { backgroundColor: '#1A1A1A' },
  perfectOff: { borderColor: '#3A3A3C' },
});

const light = StyleSheet.create({
  sheet: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)' },
  handle: { backgroundColor: '#D8D8DC' },
  ink: { color: '#151515' },
  capTrack: { backgroundColor: '#EDEDEF' },
  row: { backgroundColor: '#F6F6F7' },
  perfectOff: { borderColor: '#D8D8DC' },
});
