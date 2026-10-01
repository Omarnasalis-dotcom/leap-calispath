import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TC_COLORS, TCPalette } from '../../../constants/trainingCenterTokens';
import { useTheme } from '../../contexts/ThemeContext';
import { PastProgram } from '../../lib/pastPrograms';
import { t, isArabic } from '../../i18n';

interface PastProgramsSheetProps {
  visible: boolean;
  onClose: () => void;
  programs: PastProgram[];
  /** Program whose restore is in flight — every row is disabled meanwhile. */
  restoringId: string | null;
  onRestore: (program: PastProgram) => void;
}

function formatMeta(program: PastProgram): string {
  const started = new Date(program.assigned_at).toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${t('trainingCenter.startedOn', { date: started })} · ${t('trainingCenter.pastSessions', { count: program.sessions_done })}`;
}

/**
 * Training Center's restore sheet, opened from the hero card's restore
 * button: the warrior's most recent previous programs, each one tap from
 * being active again.
 */
export function PastProgramsSheet({ visible, onClose, programs, restoringId, onRestore }: PastProgramsSheetProps) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = getStyles(c);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('trainingCenter.pastPrograms')}</Text>
          <Text style={styles.sub}>{t('trainingCenter.pastProgramsSub')}</Text>

          <View style={{ gap: 8 }}>
            {programs.map((program) => (
              <View key={program.id} style={styles.row}>
                <View style={styles.iconWell}>
                  <MaterialCommunityIcons name={program.is_ai_coach ? 'robot-outline' : 'layers-outline'} size={18} color={c.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{program.name.toUpperCase()}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{formatMeta(program)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.restoreBtn, restoringId != null && { opacity: 0.5 }]}
                  onPress={() => onRestore(program)}
                  disabled={restoringId != null}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('trainingCenter.restore')} ${program.name}`}
                >
                  <Text style={styles.restoreText}>
                    {restoringId === program.id ? t('trainingCenter.restoring') : t('trainingCenter.restore')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>{t('trainingCenter.close')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const getStyles = (c: TCPalette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.screenBg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: c.border,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 16 },
  title: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 17, letterSpacing: 1.7, textAlign: 'left' },
  sub: { color: c.textMuted, fontFamily: 'Barlow-Regular', fontSize: 12.5, marginTop: 4, marginBottom: 16, textAlign: 'left' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.cardFlat,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  iconWell: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.iconWell, alignItems: 'center', justifyContent: 'center' },
  name: { color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 0.6, textAlign: 'left' },
  meta: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 1.2, marginTop: 3, textAlign: 'left' },
  restoreBtn: { borderWidth: 1, borderColor: c.coral, borderRadius: 10, paddingHorizontal: 12, height: 32, alignItems: 'center', justifyContent: 'center' },
  restoreText: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 1.4 },
  closeBtn: { marginTop: 16, height: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: c.textSecondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.6 },
});
