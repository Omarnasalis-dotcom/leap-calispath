import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Modal, ScrollView, Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TIER_NAMES } from '../types';
import { LeapLogo } from '../components/LeapLogo';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingTutorialProps {
  visible: boolean;
  strengthTier: number;
  onBeginTrial: () => void;
  onSkip: () => void;
  onTakeTour?: () => void;
  // Lets the caller reopen this modal directly at the "first objective"
  // step (e.g. right after the spotlight tour finishes) instead of always
  // starting from the beginning.
  initialStep?: number;
}

function getUnlockMessage(tier: number): string {
  if (tier >= 6) return 'You have unlocked STATIC WORLD and POWER WORLD.';
  if (tier >= 1) return 'You have unlocked STATIC WORLD.';
  return 'You start with 1-MINUTE MAX. Conquer it to unlock the worlds above.';
}

function getTierAccentColor(tier: number): string {
  if (tier <= 2) return '#B0BEC5';
  if (tier <= 5) return '#FF7043';
  if (tier <= 8) return '#D32F2F';
  return '#FFD700';
}

const WORLDS = [
  { icon: '⏱️', name: '1-Minute Max', short: '1MM', unlock: 'Unlocked at Tier 0', desc: 'Build your endurance and master the basics. Every warrior starts here.', unlockedAt: 0 },
  { icon: '🧊', name: 'Static World', short: 'STATICS', unlock: 'Unlocked at Tier 1', desc: 'Hold and control your body through handstands, levers, and planche progressions.', unlockedAt: 1 },
  { icon: '⚡', name: 'Power World', short: 'POWER', unlock: 'Unlocked at Tier 6', desc: 'Lift heavy. Prove your strength through weighted calisthenics and maximum output.', unlockedAt: 6 },
];

export function OnboardingTutorialScreen({ visible, strengthTier, onBeginTrial, onSkip, onTakeTour, initialStep = 0 }: OnboardingTutorialProps) {
  const { theme } = useTheme();
  const [step, setStep] = useState(initialStep);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const accentColor = getTierAccentColor(strengthTier);
  const tierName = TIER_NAMES[strengthTier] ?? 'Helot';
  const nextTier = Math.min(strengthTier + 1, 9);

  const insets = useSafeAreaInsets();

  // This component stays mounted across show/hide (visible toggles), so the
  // initial useState(initialStep) only applies once — reset explicitly
  // whenever it's reopened, so a caller can reopen it directly at a later
  // step (e.g. the "first objective" step right after the tour finishes).
  useEffect(() => {
    if (visible) setStep(initialStep);
  }, [visible, initialStep]);

  useEffect(() => {
    if (!visible) return;
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.92);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [visible, step]);

  useEffect(() => {
    if (!visible || step !== 0) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, step]);

  useEffect(() => {
    if (!visible || step !== 3) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.04, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, step]);

  function goNext() { if (step < 3) setStep(step + 1); }
  function goBack() { if (step > 0) setStep(step - 1); }

  const renderStep0 = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <Animated.View style={{ opacity: glowAnim, marginBottom: 4 }}>
        <LeapLogo size={72} animated={true} />
      </Animated.View>
      <Text style={[styles.completeLabel, { color: theme.text.tertiary }]}>ASSESSMENT COMPLETE</Text>
      <Text style={[styles.tierNumber, { color: accentColor }]}>TIER {strengthTier}</Text>
      <Text style={[styles.tierName, { color: theme.text.primary }]}>{tierName.toUpperCase()}</Text>
      <View style={[styles.divider, { backgroundColor: accentColor }]} />
      <Text style={[styles.unlockMessage, { color: theme.text.secondary }]}>{getUnlockMessage(strengthTier)}</Text>
      <Text style={[styles.subNote, { color: theme.text.tertiary }]}>Your journey begins now, warrior.</Text>
    </Animated.View>
  );

  const renderStep1 = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <Text style={[styles.stepTitle, { color: theme.text.primary }]}>THE THREE WORLDS</Text>
      <Text style={[styles.stepSubtitle, { color: theme.text.secondary }]}>Conquer all three to become the world's most well-rounded athlete.</Text>
      <View style={styles.worldsList}>
        {WORLDS.map((world) => {
          const isUnlocked = strengthTier >= world.unlockedAt;
          return (
            <View key={world.short} style={[styles.worldCard, { backgroundColor: theme.card.background, borderColor: isUnlocked ? accentColor : theme.card.border, opacity: isUnlocked ? 1 : 0.45 }]}>
              <View style={styles.worldCardLeft}><Text style={styles.worldIcon}>{world.icon}</Text></View>
              <View style={styles.worldCardRight}>
                <View style={styles.worldCardHeader}>
                  <Text style={[styles.worldName, { color: theme.text.primary }]}>{world.name}</Text>
                  {isUnlocked
                    ? <View style={[styles.unlockBadge, { backgroundColor: accentColor }]}><Text style={styles.unlockBadgeText}>UNLOCKED</Text></View>
                    : <View style={[styles.lockBadge, { borderColor: theme.card.border }]}><Text style={[styles.lockBadgeText, { color: theme.text.tertiary }]}>{world.unlock}</Text></View>
                  }
                </View>
                <Text style={[styles.worldDesc, { color: theme.text.secondary }]}>{world.desc}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={[styles.leaderboardNote, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <Text style={[styles.leaderboardNoteText, { color: theme.text.secondary }]}>
          Points from all three worlds feed into the <Text style={{ color: accentColor, fontWeight: '700' }}>Global Well-Rounded Leaderboard</Text>.
        </Text>
      </View>
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <Text style={[styles.stepTitle, { color: theme.text.primary }]}>SEE HOW IT WORKS</Text>
      <Text style={[styles.stepSubtitle, { color: theme.text.secondary }]}>
        A quick, hands-on walkthrough of your profile, tiers, workout program, leaderboards, and every world — about a minute, and you can skip it anytime.
      </Text>
      {onTakeTour && (
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: accentColor, marginTop: 12 }]}
          onPress={onTakeTour}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaButtonText}>TAKE THE TOUR</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.skipButton} onPress={goNext}>
        <Text style={[styles.skipButtonText, { color: theme.text.tertiary }]}>Skip — Continue</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderStep3 = () => {
    const isMaxTier = strengthTier === 9;
    return (
      <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Text style={[styles.stepTitle, { color: theme.text.primary }]}>
          {isMaxTier ? 'APEX WARRIOR' : 'YOUR FIRST OBJECTIVE'}
        </Text>
        <View style={[styles.objectiveCard, { backgroundColor: theme.card.background, borderColor: accentColor }]}>
          <Text style={[styles.objectiveLabel, { color: theme.text.tertiary }]}>
            {isMaxTier ? 'MAXIMUM RANK REACHED' : 'NEXT RANK'}
          </Text>
          <Text style={[styles.objectiveTier, { color: accentColor }]}>TIER {strengthTier}</Text>
          <Text style={[styles.objectiveTierName, { color: theme.text.primary }]}>
            {(TIER_NAMES[strengthTier] ?? 'Apex').toUpperCase()}
          </Text>
          <View style={[styles.divider, { backgroundColor: theme.card.border, marginVertical: 12 }]} />
          <Text style={[styles.objectiveDesc, { color: theme.text.secondary }]}>
            {isMaxTier
              ? 'You have achieved the ultimate strength tier. There are no higher ranks to unlock. Explore the arena and dominate the leaderboards!'
              : `To level up, you must pass the Trial for Tier ${nextTier}. Complete the workout within the time limit. No shortcuts.`}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: accentColor }]}
            onPress={isMaxTier ? onSkip : onBeginTrial}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaButtonText}>
              {isMaxTier ? 'EXPLORE DASHBOARD' : 'BEGIN FIRST TRIAL'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
        {!isMaxTier && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={[styles.skipButtonText, { color: theme.text.tertiary }]}>Skip — Take me to the Dashboard</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  const renderDots = () => (
    <View style={styles.dotsRow}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i === step ? accentColor : theme.card.border, width: i === step ? 20 : 6 }]} />
      ))}
    </View>
  );

  return (
    <GlobalErrorBoundary>
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.background.secondary, paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
            <View style={styles.headerRow}>
              {renderDots()}
              <TouchableOpacity onPress={onSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[styles.closeX, { color: theme.text.tertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {step === 0 && renderStep0()}
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
            </ScrollView>
            {step < 2 && (
              <View style={styles.navRow}>
                {step > 0
                  ? <TouchableOpacity style={styles.backBtn} onPress={goBack}><Text style={[styles.backBtnText, { color: theme.text.secondary }]}>Back</Text></TouchableOpacity>
                  : <View style={{ flex: 1 }} />
                }
                <TouchableOpacity style={[styles.nextBtn, { backgroundColor: accentColor }]} onPress={goNext}>
                  <Text style={styles.nextBtnText}>{step === 0 ? 'Explore the Worlds' : 'Continue'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_HEIGHT * 0.78, paddingTop: 14, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 28 : 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  closeX: { fontSize: 18, fontWeight: '300' },
  scrollContent: { paddingBottom: 12 },
  stepContainer: { alignItems: 'center', paddingTop: 4 },
  glowRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, marginBottom: 24, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 20, elevation: 10 },
  completeLabel: { fontSize: 11, letterSpacing: 4, fontWeight: '600', marginBottom: 8 },
  tierNumber: { fontSize: 40, fontWeight: '900', letterSpacing: 2, lineHeight: 44 },
  tierName: { fontSize: 22, fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
  divider: { height: 1, width: 60, borderRadius: 1, marginBottom: 12 },
  unlockMessage: { fontSize: 15, textAlign: 'center', lineHeight: 22, paddingHorizontal: 12, marginBottom: 10 },
  subNote: { fontSize: 12, letterSpacing: 1.5, textAlign: 'center', marginBottom: 8 },
  stepTitle: { fontSize: 20, fontWeight: '800', letterSpacing: 3, textAlign: 'center', marginBottom: 8 },
  stepSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 8 },
  worldsList: { width: '100%', gap: 10, marginBottom: 16 },
  worldCard: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  worldCardLeft: { justifyContent: 'center', alignItems: 'center', width: 36 },
  worldIcon: { fontSize: 24 },
  worldCardRight: { flex: 1 },
  worldCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 6 },
  worldName: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  unlockBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  unlockBadgeText: { fontSize: 9, fontWeight: '800', color: '#000', letterSpacing: 1 },
  lockBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  lockBadgeText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  worldDesc: { fontSize: 12, lineHeight: 18 },
  leaderboardNote: { borderRadius: 10, borderWidth: 1, padding: 12, width: '100%' },
  leaderboardNoteText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  objectiveCard: { width: '100%', borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 24, marginTop: 12 },
  objectiveLabel: { fontSize: 10, letterSpacing: 3, fontWeight: '600', marginBottom: 6 },
  objectiveTier: { fontSize: 42, fontWeight: '900', letterSpacing: 2, lineHeight: 46 },
  objectiveTierName: { fontSize: 22, fontWeight: '700', letterSpacing: 3 },
  objectiveDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  ctaButton: { width: '100%', paddingVertical: 18, borderRadius: 12, alignItems: 'center', marginBottom: 14 },
  ctaButtonText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  skipButton: { paddingVertical: 10, alignItems: 'center' },
  skipButtonText: { fontSize: 13 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12 },
  backBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  backBtnText: { fontSize: 14, fontWeight: '600' },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  nextBtnText: { color: '#000', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});
