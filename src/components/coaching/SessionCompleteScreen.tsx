 import React, { useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LeapLogo } from '../LeapLogo';

interface SessionCompleteScreenProps {
  visible: boolean;
  theme: any;
  bronzeGold: string;
  programName: string;
  dayName: string;
  // Blocks actually marked completed (excludes missed) — this is what
  // "BLOCKS DONE" / "COMPLETION" report, so a skipped block doesn't inflate them.
  blocksCompleted: number;
  blocksTotal: number;
  // Every block has some status (completed or missed) — drives the heading.
  isAddressed: boolean;
  exercisesDone: number;
  totalReps: number;
  bodyweightKg: number | null;
  sessionSeconds: number;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const SessionCompleteScreen: React.FC<SessionCompleteScreenProps> = ({
  visible,
  theme,
  bronzeGold,
  programName,
  dayName,
  blocksCompleted,
  blocksTotal,
  isAddressed,
  exercisesDone,
  totalReps,
  bodyweightKg,
  sessionSeconds,
  onClose,
}) => {
  const cardRef = useRef<View>(null);
  const completionPct = blocksTotal > 0 ? Math.round((blocksCompleted / blocksTotal) * 100) : 0;

  const stats = [
    { value: `${blocksCompleted}/${blocksTotal}`, label: 'BLOCKS DONE' },
    { value: `${completionPct}%`, label: 'COMPLETION' },
    { value: `${exercisesDone}`, label: 'EXERCISES DONE' },
    { value: `${totalReps}`, label: 'TOTAL REPS' },
    { value: formatDuration(sessionSeconds), label: 'DURATION' },
    ...(bodyweightKg !== null ? [{ value: `${bodyweightKg}KG`, label: 'BODYWEIGHT' }] : []),
  ];

  const handleShare = async () => {
    if (Platform.OS === 'web') {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const element = document.getElementById('session-complete-card');
        if (!element) return;
        const canvas = await html2canvas(element, { backgroundColor: null, scale: 2 });
        const dataUrl = canvas.toDataURL('image/png');
        if ((navigator as any).share) {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], 'leap-arena-workout.png', { type: 'image/png' });
          await (navigator as any).share({ files: [file], title: 'LEAP ARENA' });
        } else {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = 'leap-arena-workout.png';
          a.click();
        }
      } catch {
        window.alert('Could not generate the workout card image.');
      }
      return;
    }

    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 0.9 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Sharing not available', 'Sharing is not supported on this platform.');
      }
    } catch {
      Alert.alert('Error', 'Failed to generate the workout card image.');
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
          <View
            ref={cardRef}
            collapsable={false}
            // @ts-ignore — RN Web passes `id` through to the DOM node, used by the web share/save path.
            id="session-complete-card"
            style={{ alignItems: 'center', width: '100%', backgroundColor: theme.card.background }}
          >
            <LeapLogo size={64} animated={false} />
            <Text style={[styles.eyebrow, { color: isAddressed ? '#4CAF50' : bronzeGold }]}>
              {isAddressed ? 'WORKOUT DONE' : 'IN PROGRESS'}
            </Text>
            <Text style={[styles.heading, { color: theme.text.primary }]} numberOfLines={1}>
              {programName || 'YOUR WORKOUT'}
            </Text>
            {!!dayName && (
              <Text style={[styles.dayName, { color: theme.text.secondary }]}>{dayName.toUpperCase()}</Text>
            )}

            <View style={styles.statsGrid}>
              {stats.map(stat => (
                <LinearGradient
                  key={stat.label}
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.statGradientBorder}
                >
                  <View style={[styles.statCard, { backgroundColor: theme.card.background }]}>
                    <Text style={[styles.statValue, { color: theme.text.primary }]}>{stat.value}</Text>
                    <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>{stat.label}</Text>
                  </View>
                </LinearGradient>
              ))}
            </View>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onClose} style={[styles.doneBtn, { borderColor: theme.card.border }]}>
              <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>DONE</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={{ flex: 1 }}>
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.shareBtn}
              >
                <Text style={styles.shareBtnText}>SHARE</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 14,
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 6,
  },
  heading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 22,
    letterSpacing: 1,
    textAlign: 'center',
  },
  dayName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
    width: '100%',
  },
  statGradientBorder: {
    width: '30%',
    minWidth: 96,
    padding: 1.2,
    borderRadius: 9,
  },
  statCard: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 17,
  },
  statLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  doneBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
});
