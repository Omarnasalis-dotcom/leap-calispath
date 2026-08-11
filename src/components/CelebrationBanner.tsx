import React, { useEffect, useRef, useState } from 'react';
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
  Vibration,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useTheme } from '../contexts/ThemeContext';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import { LeapLogo } from './LeapLogo';

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
  headerText?: string;
  showLeapLogo?: boolean;
  accentColor?: string;
  // Gates the vibration + boxing bell — routine results (e.g. an ordinary
  // Beat The Plank run) still get the card/share/save, just without the
  // victory fanfare that's meant for actual wins.
  celebratory?: boolean;
  // Overrides the POWER_QUOTES/STATIC_QUOTES/ENDURANCE_QUOTES auto-pick for
  // callers whose theme doesn't match any of those three worlds.
  quotes?: string[];
}

const POWER_QUOTES = [
  "DEFEAT GRAVITY WITH PURE POWER.",
  "HEAVY WEIGHTS BUILD HEAVY WARRIORS.",
  "POWER IS THE ONLY TRUTH.",
  "LIMITS ARE BORN TO BE BROKEN.",
  "THE BAR WILL ALWAYS BEND TO RESOLVE.",
  "UNLEASH THE WARRIOR WITHIN."
];

const STATIC_QUOTES = [
  "FIND PEACE IN THE HOLD.",
  "DEFY GRAVITY WITH STILLNESS.",
  "STRENGTH IS CONTROL.",
  "HOLD THE LINE.",
  "MIND OVER BODY."
];

const ENDURANCE_QUOTES = [
  "LEAP PAST YOUR LIMITS. ENDURE.",
  "EMBRACE THE BURN.",
  "ONE MORE REP. EVERY TIME.",
  "DIG DEEPER THAN THE PAIN.",
  "OUTLAST THE OPPOSITION."
];

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
  headerText,
  showLeapLogo,
  accentColor,
  celebratory = true,
  quotes,
}: CelebrationProps) {
  const { theme, mode } = useTheme();
  const cardAccent = accentColor || theme.accent;

  const getAccentAlpha = (color: string, alphaHex: string) => {
    if (color.startsWith('#') && color.length === 7) {
      return `${color}${alphaHex}`;
    }
    return color;
  };
  const viewShotRef = useRef<View>(null);
  const slideAnim = useRef(new Animated.Value(height)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const statScale = useRef(new Animated.Value(0.5)).current;
  const logoScale = useRef(new Animated.Value(0)).current;
  const [quote, setQuote] = useState('');

  useEffect(() => {
    if (visible) {
      if (celebratory) {
        Vibration.vibrate([0, 50, 100, 50]);
        SoundService.playBoxingBell();
      }

      // Pick a random quote: an explicit pool wins, otherwise fall back to
      // the header-text-based auto-pick.
      let quotePool = quotes && quotes.length > 0 ? quotes : POWER_QUOTES;
      if (!quotes || quotes.length === 0) {
        if (headerText === 'STATIC WORLD' || title?.includes('STATIC')) {
          quotePool = STATIC_QUOTES;
        } else if (headerText === 'ENDURANCE WORLD' || title?.includes('ENDURANCE')) {
          quotePool = ENDURANCE_QUOTES;
        }
      }
      const randomQuote = quotePool[Math.floor(Math.random() * quotePool.length)];
      setQuote(randomQuote);

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
        Animated.spring(logoScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 6,
        }),
      ]).start();

      Animated.sequence([
        Animated.delay(300),
        Animated.spring(statScale, {
          toValue: 1,
          tension: 120,
          friction: 6,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      slideAnim.setValue(height);
      opacityAnim.setValue(0);
      statScale.setValue(0.5);
      logoScale.setValue(0);
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
      try {
        const uri = await captureRef(viewShotRef, { format: 'png', quality: 0.9 });
        return uri;
      } catch {
        return null;
      }
    }
    
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
      // writeOnly: this screen only ever saves a generated banner — it never
      // reads the gallery. Requesting full access made Android ask for (and the
      // manifest declare) READ_MEDIA_IMAGES/READ_MEDIA_VIDEO, which is what the
      // Play Store rejected under the Photo and Video Permissions policy.
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
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

  const SectionDivider = () => (
    <View style={[styles.sectionDivider, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
  );

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
                borderColor: cardAccent,
                shadowColor: cardAccent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 20,
                elevation: 10,
              }
            ]}
          >
            <Text style={[styles.logoText, { color: cardAccent }]}>{headerText || 'LEAP ARENA'}</Text>
            
            <Animated.View style={{ transform: [{ scale: logoScale }] }}>
              {showLeapLogo ? (
                <View style={{ marginTop: 6, marginBottom: 6 }}>
                  <LeapLogo size={80} animated={true} />
                </View>
              ) : (
                <Text style={styles.emoji}>{emoji}</Text>
              )}
            </Animated.View>

            <SectionDivider />

            <View style={styles.mainInfoSection}>
              <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>
              {subtitle && subtitle.toUpperCase() !== 'NEW PR' ? (
                <View style={[styles.badgeContainer, { borderColor: cardAccent, backgroundColor: getAccentAlpha(cardAccent, '15') }]}>
                  <Text style={[styles.subtitleText, { color: cardAccent }]} numberOfLines={1}>
                    {subtitle.toUpperCase()}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.userNameTag, { borderColor: cardAccent, backgroundColor: getAccentAlpha(cardAccent, '15') }]}>
                <View style={[styles.cornerPrBadge, { backgroundColor: cardAccent }]}>
                  <Text style={styles.cornerPrText}>PR</Text>
                </View>
                <Text style={[styles.userName, { color: theme.text.primary }]} numberOfLines={1}>
                  {userName?.toUpperCase()}
                </Text>
              </View>
            </View>

            <SectionDivider />

            <View style={styles.achievementSection}>
              <Animated.View style={[styles.statRow, { transform: [{ scale: statScale }] }]}>
                {subtitle && subtitle.toUpperCase() === 'NEW PR' ? (
                  <View style={[styles.statBox, { borderColor: cardAccent, backgroundColor: getAccentAlpha(cardAccent, '15') }]}>
                    <Text style={[styles.statBoxText, { color: cardAccent }]}>
                      {subtitle.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.statBox, { borderColor: cardAccent, backgroundColor: getAccentAlpha(cardAccent, '15') }]}>
                  <Text style={[styles.statBoxText, { color: cardAccent }]}>
                    {stat}
                  </Text>
                </View>
              </Animated.View>
              {rank && (
                <Text style={[styles.rankTextSmall, { color: theme.text.secondary }]}>{rank}</Text>
              )}
            </View>

            {leaderboard && leaderboard.length > 0 && (
              <>
                <SectionDivider />
                <View style={styles.leaderboardSection}>
                  <Text style={[styles.leaderboardTitle, { color: theme.text.tertiary }]}>LEADERBOARD</Text>
                  {leaderboard.map((entry, i) => (
                    <View key={i} style={styles.leaderboardRow}>
                      <Text style={[styles.lbRank, { color: cardAccent }]}>#{entry.rank}</Text>
                      <Text style={[styles.lbName, { color: '#EEE' }]} numberOfLines={1}>
                        {entry.name.toUpperCase()}
                      </Text>
                      <Text style={[styles.lbScore, { color: cardAccent }]}>{entry.score}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <SectionDivider />
            
            <Text style={[styles.dateText, { color: '#777' }]}>{today}</Text>
            {quote ? (
              <Text style={[styles.quoteText, { color: theme.text.tertiary, marginTop: 6, marginBottom: 8 }]}>
                "{quote}"
              </Text>
            ) : null}
          </View>

          {/* ACTION BUTTONS */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: cardAccent }]}
              onPress={handleShare}
            >
              <Text style={styles.buttonText}>📸 SHARE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.outlineButton, { borderColor: cardAccent }]}
              onPress={handleSave}
            >
              <Text style={[styles.buttonText, { color: cardAccent }]}>SAVE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
              <Text style={[styles.dismissText, { color: 'rgba(255, 255, 255, 0.6)' }]}>DISMISS</Text>
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
    padding: 24,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
  },
  logoText: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-condensed',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 6,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  quoteText: {
    fontSize: 10,
    fontStyle: 'italic',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 4,
    opacity: 0.8,
    paddingHorizontal: 12,
  },
  sectionDivider: {
    width: '100%',
    height: 1,
    marginVertical: 6,
  },
  mainInfoSection: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  badgeContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 8,
    marginBottom: 8,
  },
  userNameTag: {
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
    position: 'relative',
  },
  cornerPrBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerPrText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '900',
  },
  userName: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  achievementSection: {
    width: '100%',
    alignItems: 'center',
  },
  statValueBig: {
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statBox: {
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  statBoxText: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  rankTextSmall: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  leaderboardSection: {
    width: '100%',
  },
  leaderboardTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 12,
    textAlign: 'center',
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
