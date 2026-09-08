import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { RankUpReveal } from '../components/trial/RankUpReveal';

// Design tokens per assets/design_handoff_milestone_lane — with the color/font
// corrections noted in the plan: the handoff's coral (#FC5454) and Oswald
// don't match the real app (RankUpReveal's #FF5252 / PlusJakartaSans+
// BarlowCondensed do), so those are substituted here.
const ACCENT = '#FF5252';
const ACCENT_DIM = 'rgba(255, 82, 82, 0.22)';
const NODE_SIZE = 64;

type NodeState = 'locked' | 'active' | 'complete';

interface MilestoneLaneScreenProps {
  mode: 'onboarding' | 'journey';
}

function usePulse(enabled: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, value]);
  return value;
}

function NodeCircle({ state, number }: { state: NodeState; number: number }) {
  const pulse = usePulse(state === 'active');
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  if (state === 'complete') {
    return (
      <View style={[styles.nodeCircle, { backgroundColor: ACCENT }]}>
        <MaterialCommunityIcons name="check" size={26} color="#FFFFFF" />
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={styles.nodeCircleWrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.nodeGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        />
        <View style={[styles.nodeCircle, { borderWidth: 3, borderColor: ACCENT }]}>
          <Text style={styles.nodeNumberActive}>{number}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.nodeCircle, { borderWidth: 2, borderColor: ACCENT_DIM }]}>
      <MaterialCommunityIcons name="lock-outline" size={18} color="rgba(255,255,255,0.3)" />
    </View>
  );
}

function Connector({ complete }: { complete: boolean }) {
  return (
    <View
      style={[
        styles.connector,
        complete
          ? { backgroundColor: ACCENT, borderWidth: 0 }
          : { backgroundColor: 'transparent', borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed' },
      ]}
    />
  );
}

function NodeRow({
  number,
  state,
  title,
  desc,
  ctaLabel,
  onPressCta,
  isLast,
  children,
}: {
  number: number;
  state: NodeState;
  title: string;
  desc: string;
  ctaLabel?: string;
  onPressCta?: () => void;
  isLast: boolean;
  children?: React.ReactNode;
}) {
  const pulse = usePulse(state === 'active');
  const labelOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
  const dim = state === 'locked';

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <NodeCircle state={state} number={number} />
        {!isLast && <Connector complete={state === 'complete'} />}
      </View>
      <View style={styles.rowRight}>
        {state === 'active' && (
          <Animated.Text style={[styles.youAreHere, { opacity: labelOpacity }]}>YOU ARE HERE</Animated.Text>
        )}
        <Text
          style={[
            styles.nodeTitle,
            { color: dim ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)' },
            state === 'complete' && styles.nodeTitleComplete,
          ]}
        >
          {title}
        </Text>
        <Text style={[styles.nodeDesc, { color: dim ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.45)' }]}>{desc}</Text>
        {state === 'active' && ctaLabel && onPressCta && (
          <TouchableOpacity style={styles.ctaPill} onPress={onPressCta}>
            <Text style={styles.ctaPillText}>{ctaLabel}</Text>
          </TouchableOpacity>
        )}
        {state === 'active' && children}
      </View>
    </View>
  );
}

function GhostNode() {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.ghostCircle} />
      </View>
      <View style={[styles.rowRight, { justifyContent: 'center' }]}>
        <Text style={styles.ghostLabel}>YOUR JOURNEY CONTINUES</Text>
      </View>
    </View>
  );
}

const GOAL_LABELS: Record<string, string> = {
  strength: 'Build Strength',
  muscle: 'Build Muscle',
  weight_loss: 'Lose Weight',
  endurance: 'Improve Endurance',
  general_fitness: 'General Fitness',
};

function ProgramChoiceCard({ icon, title, desc, onPress }: { icon: string; title: string; desc: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.choiceCard} onPress={onPress}>
      <View style={styles.choiceIconWrap}>
        <MaterialCommunityIcons name={icon as any} size={22} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDesc}>{desc}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.2)" />
    </TouchableOpacity>
  );
}

const REVEAL_SHOWN_KEY_PREFIX = 'milestone_lane_reveal_shown_';

export function MilestoneLaneScreen({ mode }: MilestoneLaneScreenProps) {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const { theme } = useTheme();
  const [showReveal, setShowReveal] = useState(false);
  const revealCheckedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  // The tier-reveal celebration fires exactly once per assessment result —
  // AsyncStorage remembers the assessed_at timestamp it was last shown for,
  // so re-focusing this screen (e.g. after Goals & Equipment) doesn't replay it.
  useEffect(() => {
    if (!profile?.assessed_at || !profile?.id) return;
    let cancelled = false;
    const key = `${REVEAL_SHOWN_KEY_PREFIX}${profile.id}`;
    AsyncStorage.getItem(key)
      .then((shownFor) => {
        if (cancelled) return;
        if (shownFor !== profile.assessed_at) {
          setShowReveal(true);
        }
        revealCheckedRef.current = true;
      })
      .catch(() => {
        revealCheckedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.assessed_at, profile?.id]);

  const dismissReveal = useCallback(() => {
    if (profile?.id && profile?.assessed_at) {
      AsyncStorage.setItem(`${REVEAL_SHOWN_KEY_PREFIX}${profile.id}`, profile.assessed_at).catch(() => {});
    }
    setShowReveal(false);
  }, [profile?.id, profile?.assessed_at]);

  if (showReveal && profile?.assessed_at) {
    return (
      <RankUpReveal
        tier={profile.strength_tier}
        trialName="Assessment"
        timeSeconds={0}
        onContinue={dismissReveal}
      />
    );
  }

  const milestone1State: NodeState = profile?.assessed_at ? 'complete' : 'active';
  const milestone2State: NodeState = profile?.primary_goal ? 'complete' : profile?.assessed_at ? 'active' : 'locked';
  const milestone3State: NodeState = profile?.assessed_at && profile?.primary_goal ? 'active' : 'locked';

  const goalLabel = profile?.primary_goal ? GOAL_LABELS[profile.primary_goal] ?? profile.primary_goal : null;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.header}>MY JOURNEY</Text>

      <View style={styles.lane}>
        <NodeRow
          number={1}
          state={milestone1State}
          title="01 ASSESSMENT"
          desc={milestone1State === 'complete' ? 'Starting tier set.' : 'Find your starting tier.'}
          ctaLabel="START"
          onPressCta={() => router.push('/assessment-gate')}
          isLast={false}
        />
        <NodeRow
          number={2}
          state={milestone2State}
          title="02 GOALS & EQUIPMENT"
          desc={
            milestone2State === 'complete'
              ? goalLabel ?? 'Saved.'
              : milestone2State === 'active'
              ? 'Tell us your goal and equipment.'
              : 'Unlocks after your assessment.'
          }
          ctaLabel="START"
          onPressCta={() => router.push('/goals-equipment')}
          isLast={false}
        />
        <NodeRow
          number={3}
          state={milestone3State}
          title="03 BUILD YOUR PROGRAM"
          desc={
            milestone3State === 'active'
              ? 'Choose how you want to train. This is where onboarding ends.'
              : 'Unlocks after your goals.'
          }
          isLast
        >
          <View style={styles.choiceStack}>
            <ProgramChoiceCard
              icon="creation"
              title="AI COACH"
              desc="A day-by-day plan that adapts as you progress."
              onPress={() => router.push('/coach')}
            />
            <ProgramChoiceCard
              icon="tune-vertical"
              title="CUSTOMIZE PROGRAM"
              desc="Pick your focus, frequency and equipment."
              onPress={() => router.push('/customize-program')}
            />
            <ProgramChoiceCard
              icon="view-grid-outline"
              title="READY TEMPLATE"
              desc="Start an expert-built program today."
              onPress={() => router.push('/program-templates')}
            />
          </View>
        </NodeRow>

        <GhostNode />

        {mode === 'journey' && (
          <Text style={styles.journeyComingSoon}>
            Daily workouts, side quests and weekly trials are landing here soon.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingTop: 24,
    paddingBottom: 60,
    paddingHorizontal: 24,
  },
  header: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 11,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 28,
  },
  lane: {
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  rowLeft: {
    alignItems: 'center',
    width: NODE_SIZE,
  },
  rowRight: {
    flex: 1,
    paddingTop: 6,
    paddingBottom: 34,
  },
  nodeCircleWrap: {
    width: NODE_SIZE,
    height: NODE_SIZE,
  },
  nodeGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: (NODE_SIZE + 12) / 2,
    backgroundColor: 'rgba(255,82,82,0.35)',
  },
  nodeCircle: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeNumberActive: {
    color: ACCENT,
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 22,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 34,
    marginTop: 4,
  },
  youAreHere: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  nodeTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  nodeTitleComplete: {
    textDecorationLine: 'line-through',
    textDecorationColor: 'rgba(255,255,255,0.25)',
  },
  nodeDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 17,
  },
  ctaPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  ctaPillText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  ghostCircle: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
  },
  ghostLabel: {
    color: 'rgba(255,255,255,0.2)',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 2,
  },
  journeyComingSoon: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'Barlow-Regular',
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  choiceStack: {
    marginTop: 12,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  choiceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,82,82,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 13,
    letterSpacing: 1,
  },
  choiceDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
});
