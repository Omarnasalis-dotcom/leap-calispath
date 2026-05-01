import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { TIER_NAMES, Profile } from '../types';

interface RankRevealScreenProps {
  profile: Profile;
  onContinue: () => void;
  category?: 'strength' | 'power';
}

export function RankRevealScreen({ profile, onContinue, category = 'strength' }: RankRevealScreenProps) {
  const { theme } = useTheme();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  const currentTier = category === 'strength' ? profile.strength_tier : profile.power_tier || 0;
  const isHelot = currentTier === 0;
  const tierName = TIER_NAMES[currentTier] || 'Helot';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (isHelot) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View style={[styles.seal, { borderColor: theme.accent, backgroundColor: theme.background.secondary }]}>
            <Text style={[styles.sealText, { color: theme.accent }]}>{tierName[0]}</Text>
          </View>

          <Text style={[styles.helotTitle, { color: theme.accent }]}>HELOT.</Text>

          <Text style={[styles.helotPoem, { color: theme.text.secondary }]}>
            Every Eternity{'\n'}
            started exactly here.
          </Text>

          <Text style={[styles.helotPoemSubtle, { color: theme.text.tertiary }]}>
            The path does not open{'\n'}
            with victory.{'\n'}
            It opens with the{'\n'}
            first step forward.
          </Text>

          <Text style={[styles.helotCta, { color: theme.text.secondary }]}>Your first trial awaits.</Text>

          <TouchableOpacity style={[styles.beginButton, { backgroundColor: theme.accent }]} onPress={onContinue}>
            <Text style={styles.beginButtonText}>BEGIN THE AGOGE</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={[styles.seal, { borderColor: theme.accent, backgroundColor: theme.background.secondary }]}>
          <Text style={[styles.sealText, { color: theme.accent }]}>{tierName[0]}</Text>
        </View>

        <View style={styles.rankHeader}>
          <View style={[styles.rankDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.rankLabel, { color: theme.text.tertiary }]}>YOUR RANK</Text>
        </View>
        <Text style={[styles.tierName, { color: theme.accent }]}>{tierName.toUpperCase()}</Text>
        <Text style={[styles.tierNumber, { color: theme.text.secondary }]}>Tier {currentTier}</Text>

        {currentTier >= 6 && category === 'strength' && (
          <Text style={[styles.strategosHint, { color: theme.accent }]}>
            The Power World awaits, Platinum-Heart.
          </Text>
        )}

        <TouchableOpacity style={[styles.continueButton, { backgroundColor: theme.accent }]} onPress={onContinue}>
          <Text style={styles.continueButtonText}>CONTINUE</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 24,
  },
  seal: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  sealText: {
    fontSize: 56,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  helotTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  helotPoem: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  helotPoemSubtle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  helotCta: {
    fontSize: 16,
    marginBottom: 32,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  beginButton: {
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  beginButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  rankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rankDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  rankLabel: {
    fontSize: 14,
    letterSpacing: 4,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  tierName: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierNumber: {
    fontSize: 18,
    marginBottom: 32,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  strategosHint: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 32,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  continueButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
});
