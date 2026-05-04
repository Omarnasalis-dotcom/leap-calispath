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

const TIER_DESCRIPTIONS: Record<number, { desc: string; difficulty: number }> = {
  0: { desc: 'The starting point of every warrior', difficulty: 1 },
  1: { desc: 'Basic strength foundation established', difficulty: 2 },
  2: { desc: 'Emerging physical capability', difficulty: 3 },
  3: { desc: 'Solid strength base achieved', difficulty: 4 },
  4: { desc: 'Intermediate warrior strength', difficulty: 5 },
  5: { desc: 'Advanced calisthenics mastery', difficulty: 6 },
  6: { desc: 'Elite strength tier unlocked', difficulty: 7 },
  7: { desc: 'Exceptional warrior capacity', difficulty: 8 },
  8: { desc: 'Near-legendary strength attained', difficulty: 9 },
};

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
          {/* Temple Icon */}
          <View style={styles.iconContainer}>
            <View style={[styles.iconGlow, { shadowColor: theme.accent }]} />
            <Text style={styles.templeIcon}>🏛️</Text>
          </View>

          {/* Title Frame */}
          <View style={[styles.titleFrame, { borderColor: theme.accent }]}>
            <Text style={[styles.welcomeTitle, { color: theme.accent }]}>
              WELCOME{profile.display_name ? ` ${profile.display_name.toUpperCase()}` : ''}
            </Text>
          </View>

          <Text style={[styles.helotRank, { color: theme.text.primary }]}>HELOT</Text>
          
          <Text style={[styles.helotDifficulty, { color: theme.text.tertiary }]}>
            Difficulty: Beginner • Tier 0
          </Text>

          {/* Story Card */}
          <View style={[styles.storyCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
            <Text style={[styles.storyQuote, { color: theme.text.secondary }]}>
              "Every Eternity started exactly here."
            </Text>
            <View style={[styles.divider, { backgroundColor: theme.accent }]} />
            <Text style={[styles.storyText, { color: theme.text.tertiary }]}>
              The path does not open with victory. It opens with the first step forward.
            </Text>
          </View>

          {/* CTA */}
          <Text style={[styles.helotCta, { color: theme.text.secondary }]}>
            Your first trial awaits.
          </Text>

          {/* LEAP NOW Button */}
          <TouchableOpacity 
            style={[styles.leapButton, { backgroundColor: theme.accent }]} 
            onPress={onContinue}
          >
            <Text style={styles.leapButtonText}>LEAP NOW</Text>
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
        {/* Rank Seal */}
        <View style={[styles.rankSeal, { borderColor: theme.accent, backgroundColor: theme.background.secondary }]}>
          <Text style={[styles.rankSealText, { color: theme.accent }]}>{tierName[0]}</Text>
        </View>

        {/* Title Frame */}
        <View style={[styles.titleFrame, { borderColor: theme.accent }]}>
          <Text style={[styles.rankFrameTitle, { color: theme.accent }]}>RANK ASSIGNED</Text>
        </View>

        <Text style={[styles.assignedTier, { color: theme.text.primary }]}>{tierName.toUpperCase()}</Text>
        <Text style={[styles.tierLabel, { color: theme.text.secondary }]}>Tier {currentTier}</Text>

        {/* Tier Description & Difficulty */}
        <View style={[styles.tierInfoCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <Text style={[styles.tierDesc, { color: theme.text.secondary }]}>
            {TIER_DESCRIPTIONS[currentTier]?.desc || 'Warrior rank achieved'}
          </Text>
          
          <View style={styles.difficultyRow}>
            <Text style={[styles.difficultyLabel, { color: theme.text.tertiary }]}>DIFFICULTY</Text>
            <View style={[styles.difficultyBar, { backgroundColor: theme.background.secondary }]}>
              <View 
                style={[
                  styles.difficultyFill, 
                  { 
                    backgroundColor: theme.accent, 
                    width: `${(TIER_DESCRIPTIONS[currentTier]?.difficulty || 1) * 11}%` 
                  }
                ]} 
              />
            </View>
            <Text style={[styles.difficultyValue, { color: theme.accent }]}>
              {TIER_DESCRIPTIONS[currentTier]?.difficulty || 1}/9
            </Text>
          </View>
        </View>

        {/* Achievement Card */}
        <View style={[styles.achievementCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <Text style={[styles.achievementText, { color: theme.text.secondary }]}>
            You have proven your strength. The arena welcomes you.
          </Text>
          {currentTier >= 6 && category === 'strength' && (
            <View style={[styles.bonusBadge, { backgroundColor: theme.accent }]}>
              <Text style={styles.bonusText}>POWER WORLD UNLOCKED</Text>
            </View>
          )}
        </View>

        {/* What's Next Section */}
        <View style={[styles.whatsNextCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <Text style={[styles.whatsNextTitle, { color: theme.text.tertiary }]}>WHAT HAPPENS NEXT</Text>
          {currentTier === 8 ? (
            <Text style={[styles.whatsNextBody, { color: theme.text.secondary }]}>
              You have reached the pinnacle. Enter ETERNITY and compete for the top spot.
            </Text>
          ) : currentTier >= 6 && category === 'strength' ? (
            <Text style={[styles.whatsNextBody, { color: theme.text.secondary }]}>
              Power World is now unlocked. Complete trials to climb higher in Strength, or explore Power World.
            </Text>
          ) : (
            <Text style={[styles.whatsNextBody, { color: theme.text.secondary }]}>
              Complete the {tierName} trial to advance to the next tier. Your time will be recorded on the leaderboard.
            </Text>
          )}
          <View style={styles.whatsNextSteps}>
            <Text style={[styles.whatsNextStep, { color: theme.accent }]}>① Start your trial</Text>
            <Text style={[styles.whatsNextStep, { color: theme.accent }]}>② Beat the clock</Text>
            <Text style={[styles.whatsNextStep, { color: theme.accent }]}>③ Claim your rank</Text>
          </View>
        </View>

        {/* LEAP NOW Button */}
        <TouchableOpacity 
          style={[styles.leapButton, { backgroundColor: theme.accent }]} 
          onPress={onContinue}
        >
          <Text style={styles.leapButtonText}>
            {currentTier === 6 && category === 'strength' ? 'LEAP TO POWER WORLD' : 'LEAP NOW'}
          </Text>
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
    width: '100%',
  },
  // Icon
  iconContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  iconGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 12,
  },
  templeIcon: {
    fontSize: 60,
  },
  // Title Frame
  titleFrame: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  rankFrameTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  // Helot Screen
  helotRank: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 6,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  helotDifficulty: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  storyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    marginBottom: 24,
  },
  storyQuote: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    fontStyle: 'italic',
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  divider: {
    height: 1,
    width: 60,
    alignSelf: 'center',
    marginBottom: 16,
  },
  storyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  helotCta: {
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  // Ranked Screen
  rankSeal: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  rankSealText: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  assignedTier: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierLabel: {
    fontSize: 16,
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  tierInfoCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 320,
    marginBottom: 16,
  },
  tierDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  difficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  difficultyLabel: {
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    width: 55,
  },
  difficultyBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  difficultyFill: {
    height: '100%',
    borderRadius: 2,
  },
  difficultyValue: {
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    width: 25,
    textAlign: 'right',
  },
  achievementCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    marginBottom: 24,
    alignItems: 'center',
  },
  achievementText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  bonusBadge: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  bonusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Common Button
  leapButton: {
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 48,
    alignSelf: 'center',
  },
  leapButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  // What's Next
  whatsNextCard: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  whatsNextTitle: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  whatsNextBody: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  whatsNextSteps: {
    gap: 6,
  },
  whatsNextStep: {
    fontSize: 13,
    fontWeight: '700',
  },
});
