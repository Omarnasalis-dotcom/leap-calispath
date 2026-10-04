import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { DayStateEntry } from '../../lib/warriorProgramDays';
import { t } from '../../i18n';

const ACCENT = '#FF5252';

interface SwitchDaySheetProps {
  visible: boolean;
  /** This week's unfinished days, current pick first. */
  days: DayStateEntry[];
  onPick: (day: DayStateEntry) => void;
  onClose: () => void;
}

/**
 * Journey lane's "Switch day" sheet: pick which of this week's unfinished
 * program days to train next. Program cards only -- side quests and the
 * Strength Trial keep their place.
 */
export function SwitchDaySheet({ visible, days, onPick, onClose }: SwitchDaySheetProps) {
  const isLight = useTheme().mode === 'light';
  const styles = isLight ? lightStyles : darkStyles;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('journey.switchDayTitle')}</Text>
          <Text style={styles.sub}>{t('journey.switchDaySub')}</Text>

          <View style={{ gap: 8 }}>
            {days.map((d, i) => {
              const isCurrent = i === 0;
              return (
                <TouchableOpacity
                  key={d.index}
                  style={[styles.row, isCurrent && styles.rowCurrent]}
                  onPress={() => onPick(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                >
                  <View style={[styles.iconWell, isCurrent && styles.iconWellCurrent]}>
                    <MaterialCommunityIcons name="dumbbell" size={17} color={isCurrent ? '#FFFFFF' : styles.muted.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {d.day.name.toUpperCase()}
                    </Text>
                    {d.status === 'in_progress' && (
                      <Text style={styles.meta}>{t('journey.switchDayInProgress', { pct: d.progressPct })}</Text>
                    )}
                  </View>
                  {isCurrent ? (
                    <View style={styles.upNextPill}>
                      <Text style={styles.upNextText}>{t('journey.switchDayUpNext')}</Text>
                    </View>
                  ) : (
                    <MaterialCommunityIcons name="swap-vertical" size={18} color={styles.muted.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>{t('journey.switchDayCancel')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const darkStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 16, letterSpacing: 1.2, textAlign: 'left' },
  sub: { color: 'rgba(255,255,255,0.55)', fontFamily: 'PlusJakartaSans-Regular', fontSize: 12.5, marginTop: 4, marginBottom: 16, textAlign: 'left' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    backgroundColor: '#181818',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowCurrent: { borderColor: 'rgba(255,82,82,0.45)' },
  iconWell: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  iconWellCurrent: { backgroundColor: ACCENT },
  name: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, letterSpacing: 0.4, textAlign: 'left' },
  meta: { color: 'rgba(255,255,255,0.5)', fontFamily: 'PlusJakartaSans-Regular', fontSize: 11.5, marginTop: 2, textAlign: 'left' },
  muted: { color: 'rgba(255,255,255,0.45)' },
  upNextPill: { borderRadius: 999, backgroundColor: 'rgba(255,82,82,0.15)', paddingHorizontal: 10, paddingVertical: 4 },
  upNextText: { color: ACCENT, fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 10, letterSpacing: 1.2 },
  closeBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: 'rgba(255,255,255,0.7)', fontFamily: 'PlusJakartaSans-Bold', fontSize: 12.5, letterSpacing: 1.2 },
});

const lightStyles = StyleSheet.create({
  ...darkStyles,
  sheet: { ...darkStyles.sheet, backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)' },
  handle: { ...darkStyles.handle, backgroundColor: 'rgba(0,0,0,0.15)' },
  title: { ...darkStyles.title, color: '#111111' },
  sub: { ...darkStyles.sub, color: 'rgba(0,0,0,0.55)' },
  row: { ...darkStyles.row, backgroundColor: '#F6F6F6', borderColor: 'rgba(0,0,0,0.08)' },
  iconWell: { ...darkStyles.iconWell, backgroundColor: 'rgba(0,0,0,0.05)' },
  name: { ...darkStyles.name, color: '#111111' },
  meta: { ...darkStyles.meta, color: 'rgba(0,0,0,0.5)' },
  muted: { color: 'rgba(0,0,0,0.45)' },
  closeBtn: { ...darkStyles.closeBtn, borderColor: 'rgba(0,0,0,0.15)' },
  closeText: { ...darkStyles.closeText, color: 'rgba(0,0,0,0.65)' },
});
