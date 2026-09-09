import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { RankUpReveal } from '../components/trial/RankUpReveal';
import { supabase } from '../lib/supabase';
import { groupRawBlocksIntoDays, deriveDayStates, deriveNextDayIndex, RawProgramBlockRow, DayStateEntry } from '../lib/warriorProgramDays';
import { ProgramDay, ProgramBlock } from '../types/warriorProgram';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { isPowerWorldUnlocked } from '../lib/powerLogic';

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

// Mirrors the design handoff's Node Unlock transition (ring/check crossfade
// + spring pop, ~1.2s in the reference) — RN Animated rather than the
// file's CSS keyframes (reference-only per its own README).
//
// This deliberately animates on every mount, not on a state *change* — an
// earlier version tried to diff previous-vs-current state and only animate
// real transitions, but this screen has no persistent tab navigator behind
// it (BottomTabBar does router.replace between plain stack routes, not a
// React Navigation Tabs navigator), so it genuinely unmounts and remounts
// fresh every time the user navigates back from finishing something. A
// "did the state change since last render" check never fires in that case
// — the freshly mounted screen only ever sees the final, already-complete
// state, so nothing ever appeared to move. Animating on mount, staggered by
// each node's position in the list, is what actually reads as the lane
// coming alive when you land back on it.
// staggerIndex < 0 means "don't animate this one" (e.g. locked nodes,
// still-dashed connectors) — settles at fully visible immediately.
//
// Deliberately slow and springy rather than snappy — per direct feedback,
// the first pass ("boring... should be more like an achievement") read as
// too quick to actually register. Longer per-step stagger so the cascade
// reads as a deliberate reveal instead of a blink, and a lower-friction
// spring for a real, visible overshoot bounce rather than a quick settle.
function useMountPop(staggerIndex: number) {
  const anim = useRef(new Animated.Value(staggerIndex < 0 ? 1 : 0)).current;
  useEffect(() => {
    if (staggerIndex < 0) return;
    const delay = Math.min(staggerIndex * 140, 1100);
    const t = setTimeout(() => {
      Animated.spring(anim, { toValue: 1, friction: 4.5, tension: 45, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return anim;
}

// A one-time radial glow burst behind a node the moment it pops in as
// 'complete' — the actual "achievement unlocked" beat, distinct from the
// plain scale-in every active/complete node gets. staggerIndex < 0 (locked)
// never fires.
function useAchievementBurst(staggerIndex: number) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (staggerIndex < 0) return;
    const delay = Math.min(staggerIndex * 140, 1100);
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return anim;
}

function NodeCircle({ state, number, isSideQuest, staggerIndex }: { state: NodeState; number: number; isSideQuest?: boolean; staggerIndex: number }) {
  const pulse = usePulse(state === 'active');
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  // Locked nodes stay fully static — "no motion until unlocked" is
  // deliberate per the design handoff, it's what draws the eye to what's
  // actually active. Only active/complete ever animate in.
  const pop = useMountPop(state === 'locked' ? -1 : staggerIndex);
  const burst = useAchievementBurst(state === 'complete' ? staggerIndex : -1);
  const popStyle = {
    opacity: pop,
    // Bigger overshoot than a plain UI pop (was 1.15x) — this is meant to
    // read as a small win, not just a state toggle.
    transform: [{ scale: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.3, 1.3, 1] }) }],
  };

  if (state === 'complete') {
    const size = isSideQuest ? 44 : NODE_SIZE;
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.achievementBurst,
            {
              width: size * 2.2,
              height: size * 2.2,
              borderRadius: size * 1.1,
              opacity: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.55, 0] }),
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
            },
          ]}
        />
        <Animated.View style={[styles.nodeCircle, isSideQuest && styles.nodeCircleSmall, { backgroundColor: ACCENT }, popStyle]}>
          <MaterialCommunityIcons name="check" size={isSideQuest ? 18 : 26} color="#FFFFFF" />
        </Animated.View>
      </View>
    );
  }
  if (state === 'active') {
    // Side quests are optional extras, not "you are here" path milestones —
    // a smaller dashed ring with a compass icon instead of a number and no
    // ambient glow, so they read as a fork off the main path, not part of it.
    if (isSideQuest) {
      return (
        <Animated.View style={[styles.nodeCircle, styles.nodeCircleSmall, { borderWidth: 1.5, borderColor: ACCENT, borderStyle: 'dashed' }, popStyle]}>
          <MaterialCommunityIcons name="compass-outline" size={16} color={ACCENT} />
        </Animated.View>
      );
    }
    return (
      <View style={styles.nodeCircleWrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.nodeGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        />
        <Animated.View style={[styles.nodeCircle, { borderWidth: 3, borderColor: ACCENT }, popStyle]}>
          <Text style={styles.nodeNumberActive}>{number}</Text>
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={[styles.nodeCircle, isSideQuest && styles.nodeCircleSmall, { borderWidth: 2, borderColor: ACCENT_DIM }]}>
      <MaterialCommunityIcons name="lock-outline" size={isSideQuest ? 14 : 18} color="rgba(255,255,255,0.3)" />
    </View>
  );
}

function Connector({ complete, staggerIndex }: { complete: boolean; staggerIndex: number }) {
  const fillOpacity = useMountPop(complete ? staggerIndex : -1);
  // The actual "route lights up and moves to the next step" ask — a small
  // glowing dot travels the length of the connector as it fills, matching
  // the design handoff's line-draw + traveling-dot beat. Needs the
  // connector's real measured height (percentage transforms don't exist in
  // RN) to know how far to travel, so it only renders once onLayout reports
  // one; travels via translateY (native-driver safe) reusing the same
  // mount-pop timing as the fill itself, so they move together.
  const [height, setHeight] = useState(0);
  return (
    <Animated.View
      onLayout={complete ? (e) => setHeight(e.nativeEvent.layout.height) : undefined}
      style={[
        styles.connector,
        complete
          ? { backgroundColor: ACCENT, borderWidth: 0, opacity: fillOpacity }
          : { backgroundColor: 'transparent', borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed' },
      ]}
    >
      {complete && height > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.connectorDot,
            {
              opacity: fillOpacity.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: fillOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }],
            },
          ]}
        />
      )}
    </Animated.View>
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
  isSideQuest,
  staggerIndex = 0,
  children,
}: {
  number: number;
  state: NodeState;
  title: string;
  desc: string;
  ctaLabel?: string;
  onPressCta?: () => void;
  isLast: boolean;
  isSideQuest?: boolean;
  staggerIndex?: number;
  children?: React.ReactNode;
}) {
  const pulse = usePulse(state === 'active' && !isSideQuest);
  const labelOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
  const dim = state === 'locked';
  // Same one-time mount-pop as NodeCircle (see useMountPop's comment for
  // why this animates on mount rather than on a state-change diff),
  // applied to the text/CTA side so the whole row visibly arrives together
  // rather than the circle animating while the copy next to it just snaps
  // into place.
  const pop = useMountPop(state === 'locked' ? -1 : staggerIndex);
  const contentPopStyle = { opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };

  return (
    <View style={[styles.row, isSideQuest && styles.rowSideQuest]}>
      <View style={styles.rowLeft}>
        <NodeCircle state={state} number={number} isSideQuest={isSideQuest} staggerIndex={staggerIndex} />
        {!isLast && <Connector complete={state === 'complete'} staggerIndex={staggerIndex} />}
      </View>
      <Animated.View style={[styles.rowRight, contentPopStyle]}>
        {state === 'active' && !isSideQuest && (
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
      </Animated.View>
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
        staggerIndex={number}
      />
    </TouchableOpacity>
  );
}

type SideQuestKind = '1mm' | 'static' | 'power';

// pathname/params build the deep link; questSlotKey (this slot's unique id,
// e.g. "w2_s0") rides along as a route param so the destination screen can
// hand it straight back once the user actually logs something there —
// that's the one signal MilestoneLaneScreen needs to mark this specific
// slot complete, no new table or polling required.
const SIDE_QUEST_DEFS: Record<SideQuestKind, {
  icon: string;
  title: string;
  desc: string;
  pathname: string;
  params: Record<string, string>;
}> = {
  '1mm': {
    icon: 'timer-outline',
    title: 'SIDE QUEST · TEST YOUR ENDURANCE',
    desc: '1-Minute Max — optional, skip it and move on any time.',
    pathname: '/one-min-max',
    params: { category: 'entry' },
  },
  static: {
    icon: 'hand-back-left-outline',
    title: 'SIDE QUEST · TEST YOUR HOLD',
    desc: 'Static World wall handstand — optional, skip it and move on any time.',
    pathname: '/static-world',
    params: { movement: 'wall_handstand' },
  },
  power: {
    icon: 'lightning-bolt-outline',
    title: 'SIDE QUEST · TEST YOUR POWER',
    desc: 'Power World — optional, skip it and move on any time.',
    pathname: '/power-world',
    params: {},
  },
};

// Rotation the user asked for: 1MM -> Static -> Power, but Power only if
// tier 6+ (isPowerWorldUnlocked) -- otherwise it's skipped and the
// rotation just alternates 1MM/Static. slotIndex runs continuously across
// the whole path (not reset per week) so progressing into a new week picks
// up the rotation where it left off rather than always starting at 1MM.
function getSideQuestForSlot(slotIndex: number, strengthTier: number): SideQuestKind {
  const rotation: SideQuestKind[] = isPowerWorldUnlocked(strengthTier) ? ['1mm', 'static', 'power'] : ['1mm', 'static'];
  return rotation[slotIndex % rotation.length];
}

function SideQuestNode({ kind, state, isLast, staggerIndex, onPress }: {
  kind: SideQuestKind;
  state: NodeState;
  isLast: boolean;
  staggerIndex: number;
  onPress: () => void;
}) {
  const def = SIDE_QUEST_DEFS[kind];
  const desc = state === 'complete' ? 'Done — nice work.' : state === 'locked' ? 'Unlocks once the day before it is done.' : def.desc;
  return (
    <NodeRow
      number={0}
      state={state}
      title={def.title}
      desc={desc}
      ctaLabel={state === 'active' ? 'START' : undefined}
      onPressCta={state === 'active' ? onPress : undefined}
      isLast={isLast}
      staggerIndex={staggerIndex}
      isSideQuest
    />
  );
}

const REVEAL_SHOWN_KEY_PREFIX = 'milestone_lane_reveal_shown_';
const LEGACY_ACK_KEY_PREFIX = 'milestone_lane_legacy_ack_';
const LEGACY_FLOW_KEY_PREFIX = 'milestone_lane_legacy_flow_';

interface JourneyWeekData {
  weekNumber: number;
  days: DayStateEntry[];
  nextDayIndex: number | null;
}

interface JourneyProgramData {
  warriorProgramId: string;
  programName: string;
  currentWeek: number;
  hasNextWeek: boolean;
  // Every week from 1 through currentWeek, in order — the full path so
  // far, not just "this week". Past weeks are already fully done (that's
  // how currentWeek got here), so only the last entry ever has an active
  // next-day or unfinished trial/side-quest gate.
  weeks: JourneyWeekData[];
}

const COMPLETED_QUESTS_KEY_PREFIX = 'milestone_lane_quests_done_';

export function MilestoneLaneScreen({ mode }: MilestoneLaneScreenProps) {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const { questDone } = useLocalSearchParams<{ questDone?: string }>();
  const { theme } = useTheme();
  const [showReveal, setShowReveal] = useState(false);
  const revealCheckedRef = useRef(false);
  const [journeyData, setJourneyData] = useState<JourneyProgramData | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(mode === 'journey');
  // Which side-quest slots (keyed "w{week}_s{index}") the user has actually
  // completed — set only when a quest screen hands a matching questSlotKey
  // back on a real successful log, never just from visiting. Local/per-
  // device by design (AsyncStorage, same pattern as the tier-reveal flag):
  // this is a lightweight gamification signal, not core progress data, so
  // it doesn't need a new table or cross-device sync.
  const [completedQuestSlots, setCompletedQuestSlots] = useState<Set<string>>(new Set());
  // Existing members from before this feature shipped got onboarding_completed_at
  // backfilled to unblock them from AuthGuard, but never actually saw
  // milestones 2/3 — primary_goal is the real signal for that (backfill never
  // touched it; only the genuine new-flow milestone-2 screen sets it).
  // Confirmed against prod: 261 accounts match this, 1 has genuinely
  // completed the new flow. Shown once until acknowledged (picking any
  // milestone-3 option), then this screen behaves like any other returning
  // user's — never silently skipped straight to the day path without the
  // user ever having seen it.
  const [legacyAcknowledged, setLegacyAcknowledged] = useState(false);
  // Whether this account was ever a "legacy" one (needs the catch-up
  // milestone view at all) — null until loaded. Deliberately NOT derived
  // live from profile.primary_goal on every mount: that field legitimately
  // flips from null to set the moment the user completes milestone 2, and
  // a ref-scoped "decide once" only protected against re-evaluating within
  // a single mount — this screen has no persistent tab navigator, so it
  // remounts fresh every time the user leaves and returns, wiping any ref.
  // Reported live: fill in milestone 2, leave, come back — milestone 3
  // (never yet used) had vanished because the re-mounted screen re-derived
  // "is legacy" from primary_goal being set now and got a different answer.
  // Persisting the decision to AsyncStorage the first time it's ever made
  // fixes this: it stays fixed for this account regardless of what
  // primary_goal does afterward, until the user actually acknowledges
  // milestone 3 (or reinstalls/switches devices, at which point re-deriving
  // from current profile state is a reasonable fallback — this is
  // deliberately local/lightweight bookkeeping, not core progress data).
  const [legacyFlowActive, setLegacyFlowActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode !== 'journey' || !profile?.id) return;
    AsyncStorage.getItem(`${COMPLETED_QUESTS_KEY_PREFIX}${profile.id}`)
      .then((stored) => {
        if (stored) setCompletedQuestSlots(new Set(JSON.parse(stored)));
      })
      .catch(() => {});
    AsyncStorage.getItem(`${LEGACY_ACK_KEY_PREFIX}${profile.id}`)
      .then((stored) => setLegacyAcknowledged(stored === 'true'))
      .catch(() => {});

    const flowKey = `${LEGACY_FLOW_KEY_PREFIX}${profile.id}`;
    AsyncStorage.getItem(flowKey)
      .then((stored) => {
        if (stored === 'true' || stored === 'false') {
          setLegacyFlowActive(stored === 'true');
          return;
        }
        // First time this has ever been decided for this account — lock it
        // in permanently now.
        const decided = !profile.primary_goal;
        setLegacyFlowActive(decided);
        AsyncStorage.setItem(flowKey, decided ? 'true' : 'false').catch(() => {});
      })
      .catch(() => setLegacyFlowActive(!profile.primary_goal));
    // Deliberately excludes profile.primary_goal — this must only run once
    // per (mode, profile.id), not re-run when the goal is later filled in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profile?.id]);

  const acknowledgeLegacyOnboarding = useCallback(() => {
    // No-op during genuine (mandatory) onboarding — this flag only matters
    // for the free-roam journey tab's legacy-member view; a real new user
    // never ends up back in that state (milestone 2 is mandatory for them),
    // so writing it there would just be dead data.
    if (mode !== 'journey') return;
    setLegacyAcknowledged(true);
    if (profile?.id) {
      AsyncStorage.setItem(`${LEGACY_ACK_KEY_PREFIX}${profile.id}`, 'true').catch(() => {});
    }
  }, [mode, profile?.id]);

  // A quest screen navigating back with ?questDone=<slotKey> is the one
  // signal that a real log happened there (not just a visit) — persist it
  // and reflect it immediately without waiting for a re-fetch.
  useEffect(() => {
    if (!questDone || !profile?.id) return;
    setCompletedQuestSlots((prev) => {
      if (prev.has(questDone)) return prev;
      const next = new Set(prev);
      next.add(questDone);
      AsyncStorage.setItem(`${COMPLETED_QUESTS_KEY_PREFIX}${profile.id}`, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, [questDone, profile?.id]);

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
      // Full path so far: every week from 1 through currentWeek, not just
      // the current one — a "START WEEK 2" tap must not make Week 1's
      // finished days disappear.
      const pastAndCurrentBlocks = (blocks ?? []).filter((b: any) => (b.week_number || 1) <= rawCurrentWeek);

      const loggedBlockIds = new Set((logs ?? []).map((l: any) => String(l.block_id)));
      const rawBlocks: RawProgramBlockRow[] = pastAndCurrentBlocks.map((b: any) => ({
        id: b.id,
        name: b.name,
        week_number: b.week_number,
      }));
      // groupRawBlocksIntoDays already keys by week+day, so grouping the
      // full multi-week set in one call and then bucketing by weekNumber
      // below is equivalent to (and simpler than) grouping per-week.
      const grouped = groupRawBlocksIntoDays(rawBlocks);
      const blockById = new Map(pastAndCurrentBlocks.map((b: any) => [String(b.id), b]));

      const daysByWeek = new Map<number, ProgramDay[]>();
      for (const g of grouped) {
        const day: ProgramDay = {
          name: g.dayName,
          blocks: g.blockIds.map((id): ProgramBlock => ({
            id,
            name: blockById.get(String(id))?.name ?? '',
            notes: '',
            exercises: [],
            completedStatus: loggedBlockIds.has(String(id)) ? 'completed' : 'none',
          })),
        };
        const list = daysByWeek.get(g.weekNumber) ?? [];
        list.push(day);
        daysByWeek.set(g.weekNumber, list);
      }

      const weeks: JourneyWeekData[] = Array.from(daysByWeek.keys())
        .sort((a, b) => a - b)
        .map((weekNumber) => {
          const weekDays = daysByWeek.get(weekNumber)!;
          return {
            weekNumber,
            days: deriveDayStates(weekDays),
            nextDayIndex: deriveNextDayIndex(weekDays),
          };
        });

      const templateRel = (program as any).program_templates;
      const programName = Array.isArray(templateRel) ? templateRel[0]?.name : templateRel?.name;
      const hasNextWeek = (blocks ?? []).some((b: any) => (b.week_number || 1) === rawCurrentWeek + 1);

      setJourneyData({
        warriorProgramId: (program as any).id,
        programName: programName || 'Your Program',
        currentWeek: rawCurrentWeek,
        hasNextWeek,
        weeks,
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

  const showLegacyMilestones = mode === 'journey' && legacyFlowActive === true && !legacyAcknowledged;

  // Same sequential gating everywhere — milestone 3 always waits on
  // milestone 2, mandatory onboarding and the legacy journey view alike.
  // "Keep it open" for legacy members means milestone 2 stays genuinely
  // available to complete (not skipped/backfilled/hidden), not that
  // milestone 3 gets to bypass it.
  const milestone1State: NodeState = profile?.assessed_at ? 'complete' : 'active';
  const milestone2State: NodeState = profile?.primary_goal ? 'complete' : profile?.assessed_at ? 'active' : 'locked';
  const milestone3State: NodeState = profile?.assessed_at && profile?.primary_goal ? 'active' : 'locked';

  const goalLabel = profile?.primary_goal ? GOAL_LABELS[profile.primary_goal] ?? profile.primary_goal : null;
  // Trial/side-quest gating and the week-complete banner only ever look at
  // the latest (current) week — earlier weeks in the path are already done.
  const latestWeek = journeyData ? journeyData.weeks[journeyData.weeks.length - 1] ?? null : null;
  const weekComplete = !!latestWeek && latestWeek.days.length > 0 && latestWeek.days.every((d) => d.status === 'done');
  // Strength Trial: every 2 weeks, not every week — only odd->even
  // transitions (week 2, 4, 6...) count as a trial week.
  const isTrialWeek = !!journeyData && journeyData.currentWeek % 2 === 0;

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.header}>MY JOURNEY</Text>

      <View style={styles.lane}>
        {mode === 'onboarding' || showLegacyMilestones ? (
          <>
            <NodeRow
              number={1}
              state={milestone1State}
              title="01 ASSESSMENT"
              desc={milestone1State === 'complete' ? 'Starting tier set.' : 'Find your starting tier.'}
              ctaLabel="START"
              onPressCta={() => router.push('/assessment-gate')}
              isLast={false}
              staggerIndex={1}
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
              staggerIndex={2}
            />
            <NodeRow
              number={3}
              state={milestone3State}
              title="03 BUILD YOUR PROGRAM"
              desc={
                milestone3State !== 'active'
                  ? 'Unlocks after your goals.'
                  : showLegacyMilestones
                  ? 'Pick up where you left off, or start something new.'
                  : 'Choose how you want to train. This is where onboarding ends.'
              }
              isLast
              staggerIndex={3}
            >
              <View style={styles.choiceStack}>
                {showLegacyMilestones && journeyData ? (
                  <ProgramChoiceCard
                    icon="map-marker-path"
                    title="CONTINUE ACTIVE PROGRAM"
                    desc={`Jump back in — ${journeyData.programName}, Week ${journeyData.currentWeek}.`}
                    onPress={acknowledgeLegacyOnboarding}
                  />
                ) : (
                  <ProgramChoiceCard
                    icon="creation"
                    title="AI COACH"
                    desc="A day-by-day plan that adapts as you progress."
                    onPress={() => {
                      acknowledgeLegacyOnboarding();
                      router.push('/coach');
                    }}
                  />
                )}
                <ProgramChoiceCard
                  icon="tune-vertical"
                  title="CUSTOMIZE PROGRAM"
                  desc="Pick your focus, frequency and equipment."
                  onPress={() => {
                    acknowledgeLegacyOnboarding();
                    router.push('/customize-program');
                  }}
                />
                <ProgramChoiceCard
                  icon="view-grid-outline"
                  title="READY TEMPLATE"
                  desc="Start an expert-built program today."
                  onPress={() => {
                    acknowledgeLegacyOnboarding();
                    router.push('/program-templates');
                  }}
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
              {!profile?.primary_goal && (
                // Legacy member who's already moved past the milestone view
                // (acknowledged it) — goals/equipment stays genuinely
                // optional, never forced, but still reachable rather than
                // disappearing entirely.
                <TouchableOpacity onPress={() => router.push('/goals-equipment')}>
                  <Text style={styles.onboardingSummaryLink}>ADD GOAL</Text>
                </TouchableOpacity>
              )}
            </View>

            {journeyLoading ? (
              <Text style={styles.journeyMuted}>Loading your program…</Text>
            ) : journeyData ? (
              <>
                {journeyData.weeks.map((week, weekIdx) => {
                  const isLatestWeek = weekIdx === journeyData.weeks.length - 1;
                  const startNumber = journeyData.weeks.slice(0, weekIdx).reduce((sum, w) => sum + w.days.length, 0);
                  // Side-quest rotation runs continuously across the whole
                  // path, not reset per week — seed it with how many
                  // between-day gaps happened in every earlier week so a
                  // new week picks the rotation up where it left off.
                  const seedSlot = journeyData.weeks.slice(0, weekIdx).reduce((sum, w) => sum + Math.max(w.days.length - 1, 0), 0);

                  const rows: React.ReactNode[] = week.days.flatMap((d, i) => {
                    const dayRow = (
                      <DayNode
                        key={`day-${week.weekNumber}-${i}`}
                        number={startNumber + i + 1}
                        status={d.status}
                        title={d.day.name.toUpperCase()}
                        isNext={isLatestWeek && week.nextDayIndex === i}
                        isLast={false}
                        onPress={() => router.push({ pathname: '/warrior-program', params: { returnTo: 'journey' } })}
                      />
                    );
                    // Side quests only make sense for the week still in
                    // progress — inserted between each pair of days, not
                    // after the last one (that slot belongs to the weekly
                    // challenge below).
                    if (!isLatestWeek || i >= week.days.length - 1) return [dayRow];
                    const kind = getSideQuestForSlot(seedSlot + i, profile?.strength_tier || 0);
                    const slotKey = `w${week.weekNumber}_s${i}`;
                    const questState: NodeState = completedQuestSlots.has(slotKey)
                      ? 'complete'
                      : d.status === 'done'
                      ? 'active'
                      : 'locked';
                    const def = SIDE_QUEST_DEFS[kind];
                    return [
                      dayRow,
                      <SideQuestNode
                        key={`quest-${week.weekNumber}-${i}`}
                        kind={kind}
                        state={questState}
                        isLast={false}
                        staggerIndex={startNumber + i + 1}
                        onPress={() =>
                          router.push({
                            pathname: def.pathname,
                            params: { ...def.params, returnTo: 'journey', questSlotKey: slotKey },
                          })
                        }
                      />,
                    ];
                  });

                  if (isLatestWeek) {
                    rows.push(
                      <NodeRow
                        key={`weekly-challenge-${week.weekNumber}`}
                        number={0}
                        state="active"
                        title="SIDE QUEST · WEEKLY CHALLENGE"
                        desc="This week's community challenge — optional, skip it and move on any time."
                        ctaLabel="START"
                        onPressCta={() => router.push('/weekly-challenge')}
                        isLast
                        staggerIndex={startNumber + week.days.length + 1}
                        isSideQuest
                      />
                    );
                  }

                  return (
                    <View key={week.weekNumber}>
                      <Text style={styles.journeySectionLabel}>
                        {journeyData.programName.toUpperCase()} · WEEK {week.weekNumber}
                        {!isLatestWeek ? ' — COMPLETE' : ''}
                      </Text>
                      {rows}
                    </View>
                  );
                })}

                <NodeRow
                  number={journeyData.weeks.reduce((sum, w) => sum + w.days.length, 0) + 1}
                  state={weekComplete && isTrialWeek ? 'active' : 'locked'}
                  title="STRENGTH TRIAL"
                  desc={
                    !isTrialWeek
                      ? `Every 2 weeks — next available Week ${journeyData.currentWeek % 2 === 0 ? journeyData.currentWeek : journeyData.currentWeek + 1}.`
                      : weekComplete
                      ? "Test your current tier now that this week's days are done."
                      : 'Unlocks after every day this week is done.'
                  }
                  ctaLabel="START"
                  onPressCta={() => router.push({ pathname: '/trial', params: { mode: 'progression', returnTo: 'journey' } })}
                  isLast
                  staggerIndex={journeyData.weeks.reduce((sum, w) => sum + w.days.length, 0) + 1}
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
  rowSideQuest: {
    opacity: 0.95,
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
  achievementBurst: {
    position: 'absolute',
    backgroundColor: 'rgba(255,82,82,0.4)',
  },
  nodeCircle: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCircleSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    position: 'relative',
  },
  connectorDot: {
    position: 'absolute',
    top: 0,
    left: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
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
    flex: 1,
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12.5,
  },
  onboardingSummaryLink: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 11,
    letterSpacing: 1,
  },
  journeySectionLabel: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
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
