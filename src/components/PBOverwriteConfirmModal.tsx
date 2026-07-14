import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LeapLogo } from './LeapLogo';

interface PBOverwriteConfirmModalProps {
  visible: boolean;
  theme: any;
  accentColor: string;
  movementName: string;
  unitLabel: string;
  currentBest: number;
  attemptValue: number;
  saving?: boolean;
  onKeepBest: () => void;
  onSaveAnyway: () => void;
}

// Shown whenever a submitted score/time/weight is not better than the
// user's existing best — used by Static, Power, and 1MM alike so the choice
// (and its consequences) reads the same way everywhere instead of the
// submission just silently being discarded.
//
// Deliberately NOT a <Modal>: this is always rendered as the last child
// inside an already-open log modal (StaticWorkoutLogModal, PowerWorldScreen's
// inline log modal, OneMinMaxTimerModal), and a second simultaneously-open
// native <Modal> on iOS is a known freeze in this codebase (see the
// "iOS multiple overlapping modals bug" comments on CelebrationBanner call
// sites) — a plain absolute-fill overlay avoids that entirely.
export function PBOverwriteConfirmModal({
  visible,
  theme,
  accentColor,
  movementName,
  unitLabel,
  currentBest,
  attemptValue,
  saving = false,
  onKeepBest,
  onSaveAnyway,
}: PBOverwriteConfirmModalProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: theme.background.primary, borderColor: `${accentColor}40` }]}>
        <View style={[styles.iconCircle, { backgroundColor: `${accentColor}20` }]}>
          <MaterialCommunityIcons name="alert-decagram-outline" size={26} color={accentColor} />
        </View>

        <Text style={[styles.title, { color: theme.text.primary }]}>BELOW YOUR PERSONAL BEST</Text>
        <Text style={[styles.subtitle, { color: theme.text.secondary }]} numberOfLines={2}>
          {movementName.toUpperCase()}
        </Text>

        <View style={styles.compareRow}>
          <View style={[styles.compareBox, { borderColor: theme.card.border }]}>
            <Text style={[styles.compareLabel, { color: theme.text.tertiary }]}>YOUR BEST</Text>
            <Text style={[styles.compareValue, { color: theme.text.primary }]}>{currentBest}{unitLabel}</Text>
          </View>
          <View style={[styles.compareBox, { borderColor: accentColor, backgroundColor: `${accentColor}12` }]}>
            <Text style={[styles.compareLabel, { color: accentColor }]}>THIS ATTEMPT</Text>
            <Text style={[styles.compareValue, { color: accentColor }]}>{attemptValue}{unitLabel}</Text>
          </View>
        </View>

        <Text style={[styles.warning, { color: theme.text.secondary }]}>
          Saving this anyway will replace your current best with this lower value.
        </Text>

        <TouchableOpacity
          style={[styles.keepBtn, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}
          onPress={onKeepBest}
          disabled={saving}
        >
          <Text style={[styles.keepBtnText, { color: theme.text.primary }]}>KEEP MY CURRENT BEST</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.overwriteBtn, { borderColor: accentColor }]}
          onPress={onSaveAnyway}
          disabled={saving}
        >
          {saving ? <LeapLogo size={28} animated /> : (
            <Text style={[styles.overwriteBtnText, { color: accentColor }]}>SAVE ANYWAY</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 50, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, borderWidth: 1, alignItems: 'center' },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  subtitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 6, textAlign: 'center' },
  compareRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 20 },
  compareBox: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  compareLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 6 },
  compareValue: { fontSize: 22, fontWeight: '900' },
  warning: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 18, marginBottom: 20, paddingHorizontal: 4 },
  keepBtn: { width: '100%', paddingVertical: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 10 },
  keepBtnText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  overwriteBtn: { width: '100%', paddingVertical: 16, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  overwriteBtnText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
