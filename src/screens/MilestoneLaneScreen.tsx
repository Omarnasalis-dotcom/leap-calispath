import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { RankUpReveal } from '../components/trial/RankUpReveal';
import { supabase } from '../lib/supabase';
import { groupRawBlocksIntoDays, deriveDayStates, deriveNextDayIndex, RawProgramBlockRow, DayStateEntry } from '../lib/warriorProgramDays';
import { ProgramDay, ProgramBlock } from '../types/warriorProgram';
import { BottomTabBar } from '../components/profile/BottomTabBar';

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

function DayNode({ number, status, title, isNext, isLast, onPress }: {
  number: number;
  status: 'clean' | 'in_progress' | 'done';
  title: string;
  isNext: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  // Days are never hard-locked (see deriveDayStates' own comment in
  // warriorProgramDays.ts) — every day stays tappable regardless of visual
  // state, "next" is emphasis only, not a gate. So unlike the mandatory
  // milestone nodes above, every DayNode is pressable.
  const state: NodeState = status === 'done' ? 'complete' : isNext ? 'active' : 'locked';
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <NodeRow
        number={number}
        state={state}
        title={title}
        desc={status === 'done' ? 'Completed.' : isNext ? 'Up next in your program.' : 'Tap to jump in any time.'}
        ctaLabel={isNext ? 'START' : undefined}
        onPressCta={isNext ? onPress : undefined}
        isLast={isLast}
      />
    </TouchableOpacity>
  );
}

function SideQuestChip({ icon, label, unlockHint, locked, onPress }: {
  icon: string;
  label: string;
  unlockHint?: string;
  locked?: boolean;
  onPress: () => void;
}) {
  if (locked) {
    return (
      <View style={[styles.sideQuestChip, styles.sideQuestChipLocked]}>
        <MaterialCommunityIcons name="lock-outline" size={14} color="rgba(255,255,255,0.3)" />
        <Text style={styles.sideQuestChipTextLocked}>{unlockHint || label}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.sideQuestChip} onPress={onPress}>
      <MaterialCommunityIcons name={icon as any} size={16} color={ACCENT} />
      <Text style={styles.sideQuestChipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const REVEAL_SHOWN_KEY_PREFIX = 'milestone_lane_reveal_shown_';

interface JourneyProgramData {
  warriorProgramId: string;
  programName: string;
  currentWeek: number;
  hasNextWeek: boolean;
  days: DayStateEntry[];
  nextDayIndex: number | null;
}

export function MilestoneLaneScreen({ mode }: MilestoneLaneScreenProps) {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const { theme } = useTheme();
  const [showReveal, setShowReveal] = useState(false);
  const revealCheckedRef = useRef(false);
  const [journeyData, setJourneyData] = useState<JourneyProgramData | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(mode === 'journey');

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  // "My Journey" mode's Day-N section: the same real completion data
  // WarriorProgramScreen itself derives (program_blocks grouped into days,
  // status sourced from a real workout_logs join), not a separate tracker —
  // consistent with how every other milestone state here is derived rather
  // than stored.
  const loadJourneyProgram = useCallback(async () => {
    if (mode !== 'journey' || !profile?.id) return;
    setJourneyLoading(true);
    try {
      const { data: program } = await supabase
        .from('warrior_programs')
        .select('id, template_id, current_week, program_templates:template_id ( name )')
        .eq('warrior_id', profile.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!program) {
        setJourneyData(null);
        return;
      }

      // No week_number filter in the query itself — program_blocks.week_number
      // isn't reliably non-null across every creation path (template picks
      // copy it raw via SQL with no normalization; WarriorProgramScreen and
      // ClientProgramWriter both defensively treat it as `week_number || 1`
      // in JS rather than trusting the column). A `.eq('week_number', 1)`
      // filter would silently match zero rows for any block whose real value
      // is null — fetch everything for the template and filter client-side
      // with the same fallback instead.
      const [{ data: blocks, error: blocksError }, { data: logs, error: logsError }] = await Promise.all([
        supabase
          .from('program_blocks')
          .select('id, name, week_number, order_index')
          .eq('template_id', (program as any).template_id)
          .order('order_index', { ascending: true }),
        supabase
          .from('workout_logs')
          .select('block_id')
          .eq('warrior_program_id', (program as any).id),
      ]);
      if (blocksError) throw blocksError;
      if (logsError) throw logsError;

      const rawCurrentWeek = (program as any).current_week || 1;
      const currentWeekBlocks = (blocks ?? []).filter((b: any) => (b.week_number || 1) === rawCurrentWeek);

      const loggedBlockIds = new Set((logs ?? []).map((l: any) => String(l.block_id)));
      const rawBlocks: RawProgramBlockRow[] = currentWeekBlocks.map((b: any) => ({
        id: b.id,
        name: b.name,
        week_number: b.week_number,
      }));
      const grouped = groupRawBlocksIntoDays(rawBlocks);
      const blockById = new Map(currentWeekBlocks.map((b: any) => [String(b.id), b]));
      const days: ProgramDay[] = grouped.map((g) => ({
        name: g.dayName,
        blocks: g.blockIds.map((id): ProgramBlock => ({
          id,
          name: blockById.get(String(id))?.name ?? '',
          notes: '',
          exercises: [],
          completedStatus: loggedBlockIds.has(String(id)) ? 'completed' : 'none',
        })),
      }));

      const templateRel = (program as any).program_templates;
      const programName = Array.isArray(templateRel) ? templateRel[0]?.name : templateRel?.name;
      const hasNextWeek = (blocks ?? []).some((b: any) => (b.week_number || 1) === rawCurrentWeek + 1);

      setJourneyData({
        warriorProgramId: (program as any).id,
        programName: programName || 'Your Program',
        currentWeek: rawCurrentWeek,
        hasNextWeek,
        days: deriveDayStates(days),
        nextDayIndex: deriveNextDayIndex(days),
      });
    } catch (err) {
      console.error('Failed to load journey program:', err);
      setJourneyData(null);
    } finally {
      setJourneyLoading(false);
    }
  }, [mode, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadJourneyProgram();
    }, [loadJourneyProgram])
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

  // The one warrior-driven write of current_week in the app — everywhere
  // else it only ever moves via coach/AI-coach week management (append/
  // archive). Scoped to a plain guarded UPDATE (RLS already allows
  // warrior_id = auth.uid()) rather than a new RPC; only fires on this one
  // explicit "I'm ready to move on" tap, never automatically.
  const [advancingWeek, setAdvancingWeek] = useState(false);
  const handleContinueProgram = useCallback(async () => {
    if (!journeyData?.hasNextWeek) {
      router.push({ pathname: '/warrior-program', params: { returnTo: 'journey' } });
      return;
    }
    setAdvancingWeek(true);
    const { error } = await supabase
      .from('warrior_programs')
      .update({ current_week: journeyData.currentWeek + 1 })
      .eq('id', journeyData.warriorProgramId);
    setAdvancingWeek(false);
    if (error) {
      console.error('Failed to advance to next week:', error);
    }
    router.push({ pathname: '/warrior-program', params: { returnTo: 'journey' } });
  }, [journeyData, router]);

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
  const weekComplete = !!journeyData && journeyData.days.length > 0 && journeyData.days.every((d) => d.status === 'done');
  const daysDoneCount = journeyData ? journeyData.days.filter((d) => d.status === 'done').length : 0;

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.header}>MY JOURNEY</Text>

      <View style={styles.lane}>
        {mode === 'onboarding' ? (
          <>
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
          </>
        ) : (
          <>
            <View style={styles.onboardingSummary}>
              <MaterialCommunityIcons name="check-circle" size={16} color={ACCENT} />
              <Text style={styles.onboardingSummaryText}>Onboarding complete{goalLabel ? ` · ${goalLabel}` : ''}</Text>
            </View>

            {journeyLoading ? (
              <Text style={styles.journeyMuted}>Loading your program…</Text>
            ) : journeyData ? (
              <>
                <Text style={styles.journeySectionLabel}>{journeyData.programName.toUpperCase()} · WEEK {journeyData.currentWeek}</Text>
                {journeyData.days.map((d, i) => (
                  <DayNode
                    key={i}
                    number={i + 1}
                    status={d.status}
                    title={d.day.name.toUpperCase()}
                    isNext={journeyData.nextDayIndex === i}
                    isLast={false}
                    onPress={() => router.push({ pathname: '/warrior-program', params: { returnTo: 'journey' } })}
                  />
                ))}

                <NodeRow
                  number={journeyData.days.length + 1}
                  state={weekComplete ? 'active' : 'locked'}
                  title="STRENGTH TRIAL"
                  desc={
                    weekComplete
                      ? "Test your current tier now that this week's days are done."
                      : 'Unlocks after every day this week is done.'
                  }
                  ctaLabel="START"
                  onPressCta={() => router.push({ pathname: '/trial', params: { mode: 'progression', returnTo: 'journey' } })}
                  isLast
                />

                {weekComplete && (
                  <View style={styles.weekCompleteBanner}>
                    <MaterialCommunityIcons name="trophy-outline" size={18} color={ACCENT} />
                    <Text style={styles.weekCompleteText}>
                      {journeyData.hasNextWeek
                        ? 'Week complete — nice work.'
                        : "Week complete — that's every week in this program."}
                    </Text>
                    <TouchableOpacity
                      style={[styles.weekCompletePill, advancingWeek && { opacity: 0.6 }]}
                      onPress={handleContinueProgram}
                      disabled={advancingWeek}
                    >
                      <Text style={styles.weekCompletePillText}>
                        {advancingWeek ? 'STARTING NEXT WEEK…' : journeyData.hasNextWeek ? 'START WEEK ' + (journeyData.currentWeek + 1) : 'VIEW PROGRAM'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.journeyMuted}>No active program yet — build one above to see your daily journey here.</Text>
            )}

            <View style={styles.sideQuestSection}>
              <Text style={styles.journeySectionLabel}>SIDE QUESTS</Text>
              <Text style={styles.journeyMuted}>
                {journeyData ? 'Optional tests that unlock as you progress through the week.' : 'Optional tests you can jump into any time.'}
              </Text>
              <View style={styles.sideQuestRow}>
                <SideQuestChip
                  icon="timer-outline"
                  label="Test Your Endurance"
                  unlockHint="Unlocks after Day 1"
                  locked={!!journeyData && daysDoneCount < 1}
                  onPress={() => router.push({ pathname: '/one-min-max', params: { category: 'entry', returnTo: 'journey' } })}
                />
                <SideQuestChip
                  icon="hand-back-left-outline"
                  label="Test Your Hold"
                  unlockHint="Unlocks after Day 2"
                  locked={!!journeyData && daysDoneCount < 2}
                  onPress={() => router.push({ pathname: '/static-world', params: { movement: 'wall_handstand', returnTo: 'journey' } })}
                />
              </View>
            </View>

            <GhostNode />
          </>
        )}
      </View>
    </ScrollView>
    {mode === 'journey' && <BottomTabBar activeTab="journey" strengthTier={profile?.strength_tier || 0} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  journeyMuted: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'Barlow-Regular',
    fontSize: 12.5,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  onboardingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  onboardingSummaryText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12.5,
  },
  journeySectionLabel: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  sideQuestSection: {
    marginTop: 8,
    marginBottom: 28,
  },
  sideQuestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  sideQuestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.35)',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  sideQuestChipText: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12,
  },
  sideQuestChipLocked: {
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sideQuestChipTextLocked: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12,
  },
  weekCompleteBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,82,82,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.25)',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    gap: 8,
  },
  weekCompleteText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
  },
  weekCompletePill: {
    marginTop: 6,
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  weekCompletePillText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 12,
    letterSpacing: 1.5,
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
