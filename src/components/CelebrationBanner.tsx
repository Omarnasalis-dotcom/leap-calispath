import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useTheme } from '../contexts/ThemeContext';

const { height } = Dimensions.get('window');

interface CelebrationProps {
  visible: boolean;
  title: string;        // e.g. "TOURNAMENT CHAMPION"
  subtitle: string;     // e.g. "Quick Gauntlet"
  stat: string;         // e.g. "75 GP EARNED" or "NEW BEST: 2:34"
  emoji: string;        // e.g. "🏆" or "🔥"
  userName: string;
  rank?: string;        // e.g. "RANK #1"
  leaderboard?: { name: string; score: string; rank: number }[];
  onDismiss: () => void;
}

export function CelebrationBanner({
  visible,
  title,
  subtitle,
  stat,
  emoji,
  userName,
  rank,
  leaderboard,
  onDismiss,
}: CelebrationProps) {
  const { theme } = useTheme();
  const viewShotRef = useRef<View>(null);
  const slideAnim = useRef(new Animated.Value(height)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, 6000);

      return () => clearTimeout(timer);
    } else {
      slideAnim.setValue(height);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const generateCardImage = async (): Promise<string | null> => {
    if (Platform.OS !== 'web') {
      // Native: use react-native-view-shot
      try {
        const uri = await captureRef(viewShotRef, { format: 'png', quality: 0.9 });
        return uri;
      } catch {
        return null;
      }
    }

    // Web: use html2canvas
    try {
      const html2canvas = (await import('html2canvas')).default;
      const element = document.getElementById('celebration-card');
      if (!element) return null;
      const canvas = await html2canvas(element, { backgroundColor: null, scale: 2 });
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const handleShare = async () => {
    if (Platform.OS === 'web') {
      const dataUrl = await generateCardImage();
      if (dataUrl && navigator.share) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], 'leap-arena.png', { type: 'image/png' });
          await navigator.share({ files: [file], title: 'LEAP ARENA' });
        } catch (e) {
          console.error('Share failed:', e);
          window.alert('Use the SAVE button to download the card, then share it manually.');
        }
      } else {
        window.alert('Use the SAVE button to download the card, then share it manually.');
      }
      return;
    }
    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.9,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Sharing not available', 'Sharing is not supported on this platform.');
      }
    } catch (error) {
      console.error('Error sharing celebration:', error);
      Alert.alert('Error', 'Failed to generate sharing image.');
    }
  };

  const handleSave = async () => {
    if (Platform.OS === 'web') {
      const dataUrl = await generateCardImage();
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'leap-arena-achievement.png';
        a.click();
      }
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need permission to save images to your gallery.');
        return;
      }

      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.9,
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved!', 'Achievement saved to your gallery.');
    } catch (error) {
      console.error('Error saving celebration:', error);
      Alert.alert('Error', 'Failed to save image.');
    }
  };

  if (!visible) return null;

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]} />

        <Animated.View
          style={[
            styles.container,
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          {/* THE CARD TO BE CAPTURED */}
          <View
            ref={viewShotRef as any}
            id="celebration-card"
            style={[
              styles.card,
              {
                backgroundColor: theme.background.primary,
                borderColor: theme.accent,
              }
            ]}
          >
            <Text style={[styles.logoText, { color: theme.accent }]}>LEAP ARENA</Text>

            <Text style={styles.emoji}>{emoji}</Text>

            <View style={[styles.titleDivider, { backgroundColor: theme.accent, opacity: 0.3 }]} />

            {rank && (
              <View style={{ backgroundColor: theme.accent, paddingHorizontal: 16, paddingVertical: 4, borderRadius: 20, marginBottom: 12 }}>
                <Text style={{ color: '#000', fontWeight: '900', fontSize: 12 }}>{rank}</Text>
              </View>
            )}

            <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>

            <Text style={[styles.userName, { color: theme.accent }]}>@{userName}</Text>

            <View style={styles.divider} />

            <Text style={[styles.subtitle, { color: '#AAA' }]}>{subtitle}</Text>
            <Text style={[styles.stat, { color: '#888' }]}>{stat}</Text>

            {/* MINI LEADERBOARD SECTION */}
            {leaderboard && leaderboard.length > 0 && (
              <View style={styles.leaderboardSection}>
                <View style={[styles.miniDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                {leaderboard.map((entry, i) => (
                  <View key={i} style={styles.leaderboardRow}>
                    <Text style={[styles.lbRank, { color: theme.accent }]}>#{entry.rank}</Text>
                    <Text style={[styles.lbName, { color: '#EEE' }]} numberOfLines={1}>
                      {entry.name.toUpperCase()}
                    </Text>
                    <Text style={[styles.lbScore, { color: theme.accent }]}>{entry.score}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.dateText, { color: '#555', marginTop: leaderboard ? 12 : 0 }]}>{today}</Text>
          </View>

          {/* ACTION BUTTONS */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={handleShare}
            >
              <Text style={styles.buttonText}>📸 SHARE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.outlineButton, { borderColor: theme.accent }]}
              onPress={handleSave}
            >
              <Text style={[styles.buttonText, { color: theme.accent }]}>SAVE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
              <Text style={[styles.dismissText, { color: theme.text.secondary }]}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  container: {
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    padding: 32,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoText: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-condensed',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 20,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  titleDivider: {
    width: '100%',
    height: 1,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  userName: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 20,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  stat: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
  },
  leaderboardSection: {
    width: '100%',
    marginTop: 8,
  },
  miniDivider: {
    width: '100%',
    height: 1,
    marginBottom: 16,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  lbRank: {
    fontSize: 12,
    fontWeight: '900',
    width: 24,
  },
  lbName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  lbScore: {
    fontSize: 12,
    fontWeight: '900',
  },
  dateText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  dismissButton: {
    marginTop: 8,
    padding: 12,
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
