import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing, Image, ImageSourcePropType, Dimensions } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { RankUpReveal } from '../components/trial/RankUpReveal';
import { supabase } from '../lib/supabase';
import { groupRawBlocksIntoDays, deriveDayStates, deriveNextDayIndex, estimateSessionMinutes, countMovements, RawProgramBlockRow, DayStateEntry } from '../lib/warriorProgramDays';
import { ProgramDay, ProgramBlock } from '../types/warriorProgram';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { isPowerWorldUnlocked } from '../lib/powerLogic';

// Cover photos for the milestone/journey list rows' photo cards, organized
// as one pool per category under assets/Milestone Cards/{push,pull,lower
// body,random}. require() needs static string literals, so a real directory
// scan isn't possible -- each file is listed individually here; adding a
// future photo is: drop a space-free file into the right folder, add one
// require() line to the matching array below.
//
// Filenames must be space-free: React Native's on-device asset URL is built
// by AssetSourceResolver.js via plain string concatenation of `asset.name`
// (never encodeURIComponent'd), so a literal space in the filename produces
// a URI with an unencoded space in it -- which NSURL(string:) on iOS fails
// to parse at all, silently, so the Image never even fires a request.
// That's what "cards is empty" was the first time this shipped: every file
// had a space in its base name except one, so only that one card ever
// rendered a photo. (Folder names are fine with spaces -- httpServerLocation
// is percent-encoded server-side at bundle time; only the runtime-
// concatenated filename portion is the risk.)
const PUSH_IMAGES: ImageSourcePropType[] = [
  require('../../assets/Milestone Cards/push/incline-pushup.png'),
  require('../../assets/Milestone Cards/push/push-01.png'),
  require('../../assets/Milestone Cards/push/push-02.png'),
  require('../../assets/Milestone Cards/push/push-03.png'),
  require('../../assets/Milestone Cards/push/push-04.png'),
  require('../../assets/Milestone Cards/push/push-05.png'),
  require('../../assets/Milestone Cards/push/push-06.png'),
  require('../../assets/Milestone Cards/push/push-07.png'),
];
const PULL_IMAGES: ImageSourcePropType[] = [
  require('../../assets/Milestone Cards/pull/pull-ups.png'),
  require('../../assets/Milestone Cards/pull/front-lever.jpeg'),
  require('../../assets/Milestone Cards/pull/muscle-up.jpeg'),
  require('../../assets/Milestone Cards/pull/pull-01.png'),
];
const LEGS_IMAGES: ImageSourcePropType[] = [
  require('../../assets/Milestone Cards/lower body/deep-squat.png'),
  require('../../assets/Milestone Cards/lower body/lunges.png'),
  require('../../assets/Milestone Cards/lower body/pistol-squat.png'),
  require('../../assets/Milestone Cards/lower body/pistol-squat-2.jpeg'),
  require('../../assets/Milestone Cards/lower body/sprint.png'),
];
const RANDOM_IMAGES: ImageSourcePropType[] = [
  require('../../assets/Milestone Cards/random/mobility.png'),
  require('../../assets/Milestone Cards/random/handstand.png'),
  require('../../assets/Milestone Cards/random/mountain-climber.png'),
  require('../../assets/Milestone Cards/random/random-01.png'),
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Deterministic per `seed`, not Math.random() -- this screen fully remounts
// on every nav (no persistent tab navigator, see useMountPop's comment
// below), so a re-rolled random pick would visibly flicker the photo on
// every visit.
function pickFromPool(pool: ImageSourcePropType[], seed: string): ImageSourcePropType {
  return pool[hashString(seed) % pool.length];
}

// Training-day photo picked from what the day is actually made of, not a
// blind rotation: program_blocks/exercises carry no structured muscle-group
// category by the time they reach the client (that only exists upstream, on
// workout_library rows, at pick time in CustomizeProgramScreen) -- so this
// reads the day's real block/exercise names for push/pull/lower-body
// keywords instead, then picks a stable photo from that category's pool.
// Full-body/unmatched days fall through to the random pool.
const PUSH_KEYWORDS = /push[\s-]?up|\bpush\b|\bdip\b|\bpress\b/i;
const LOWER_BODY_KEYWORDS = /\bsquat|\blunge|\bpistol|\bleg\b|\bcalf|\bglute|\bnordic|step[\s-]?up/i;
const PULL_KEYWORDS = /pull[\s-]?up|\bpull\b|\brow\b|chin[\s-]?up|\blat\b|muscle[\s-]?up/i;

function pickDayCardImage(day: ProgramDay, seed: string): ImageSourcePropType {
  const text = day.blocks.map((b) => `${b.name} ${b.exercises.map((e) => e.name).join(' ')}`).join(' ');
  if (PUSH_KEYWORDS.test(text)) return pickFromPool(PUSH_IMAGES, seed);
  if (LOWER_BODY_KEYWORDS.test(text)) return pickFromPool(LEGS_IMAGES, seed);
  if (PULL_KEYWORDS.test(text)) return pickFromPool(PULL_IMAGES, seed);
  return pickFromPool(RANDOM_IMAGES, seed);
}

// Design tokens per assets/design_handoff_milestone_lane — with the color/font
// corrections noted in the plan: the handoff's coral (#FC5454) and Oswald
// don't match the real app (RankUpReveal's #FF5252 / PlusJakartaSans+
// BarlowCondensed do), so those are substituted here.
const ACCENT = '#FF5252';
const ACCENT_DIM = 'rgba(255, 82, 82, 0.22)';
const NODE_SIZE = 48;
// The active day's quest-branch curve+node box (see QuestBranch) -- fixed
// dimensions so the SVG path's endpoint and the node's pinned position are
// computed from the same numbers and can never drift apart.
const QUEST_NODE_SIZE = 34;
const QUEST_BRANCH_WRAP_WIDTH = 46;

type NodeState = 'locked' | 'active' | 'complete';

interface StatPillDatum {
  icon: string;
  label: string;
}

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

function NodeCircle({ state, number, staggerIndex }: { state: NodeState; number: number; staggerIndex: number }) {
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
    const size = NODE_SIZE;
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
        <Animated.View style={[styles.nodeCircle, { backgroundColor: ACCENT }, popStyle]}>
          <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
        </Animated.View>
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
        <Animated.View style={[styles.nodeCircle, { borderWidth: 3, borderColor: ACCENT }, popStyle]}>
          <Text style={styles.nodeNumberActive}>{number}</Text>
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={[styles.nodeCircle, { borderWidth: 2, borderColor: ACCENT_DIM }]}>
      <MaterialCommunityIcons name="lock-outline" size={14} color="rgba(255,255,255,0.3)" />
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
        // Solid the whole way down, not dashed -- the lane should read as
        // one continuous path extending through the locked cards ahead,
        // just dark past whatever's actually been opened (complete), which
        // is the only segment that gets the lit/glowing + traveling-dot
        // treatment below.
        complete ? { backgroundColor: ACCENT, opacity: fillOpacity } : { backgroundColor: 'rgba(255,255,255,0.08)' },
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

// Diagonal sheen sweep across a CTA pill, on loop — needs the pill's real
// measured width (percentage transforms don't exist in RN) to know how far
// to travel, so it only starts once onLayout reports one.
function useCtaSheen(width: number) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (width <= 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [width, anim]);
  return anim;
}

function MilestoneCardCta({ label, secondary, onPress }: { label: string; secondary?: boolean; onPress: () => void }) {
  const [width, setWidth] = useState(0);
  const sheen = useCtaSheen(secondary ? 0 : width);
  const translateX = sheen.interpolate({ inputRange: [0, 1], outputRange: [-width, width * 1.4] });

  if (secondary) {
    return (
      <TouchableOpacity style={styles.ctaPillSecondary} onPress={onPress}>
        <Text style={styles.ctaPillSecondaryText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.milestoneCardCta}
      onPress={onPress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View pointerEvents="none" style={[styles.milestoneCardCtaSheen, { transform: [{ translateX }, { rotate: '20deg' }] }]} />
      )}
      <Text style={styles.ctaPillText}>{label}</Text>
    </TouchableOpacity>
  );
}

// The photo-card treatment for an active/locked row's content, per the
// design handoff added alongside assets/Milestone Cards — completed rows
// never get here (NodeRow keeps its own plain checkmark + strikethrough
// text for those, see below).
function StatPill({ icon, label, dim }: { icon: string; label: string; dim?: boolean }) {
  return (
    <View style={[styles.statPill, dim && styles.statPillDim]}>
      <MaterialCommunityIcons name={icon as any} size={11} color={dim ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)'} />
      <Text style={[styles.statPillText, dim && styles.statPillTextDim]}>{label}</Text>
    </View>
  );
}

// The card content for every row in the lane -- three states, per the design
// spec: 'complete' ("Finished") is a plain dark card with a struck-through
// title, never a photo; 'active'/'locked' share the photo-card shell (cover
// image, dark gradient scrim, badge top-left) that this used to be the only
// treatment for, back when complete rows had no card at all (just plain
// text -- see git history on NodeRow if that's ever worth comparing again).
function JourneyCard({
  state,
  image,
  title,
  desc,
  stats,
  ctaLabel,
  onPressCta,
  secondaryCtaLabel,
  onPressSecondaryCta,
  showHereBadge,
}: {
  state: NodeState;
  // Active/locked render it full-bleed; complete renders a small rounded
  // thumbnail instead (see finishedCardThumb) -- callers already compute
  // this unconditionally for seed-stability elsewhere (pickDayCardImage),
  // so it's simplest to just always pass it through.
  image?: ImageSourcePropType;
  title: string;
  desc: string;
  // Duration/movement-count pills -- day cards only (see estimateSessionMinutes/
  // countMovements at the call site), active/locked states only -- the
  // Finished card dropped them per direct feedback (the thumbnail took
  // their old spot on the right instead).
  stats?: StatPillDatum[];
  ctaLabel?: string;
  onPressCta?: () => void;
  // Strength Trial only, today -- "can be skipped" (see the call site's
  // reuse of the same skippedQuestSlots/handleSkipQuest plumbing quests
  // already use).
  secondaryCtaLabel?: string;
  onPressSecondaryCta?: () => void;
  showHereBadge?: boolean;
}) {
  const locked = state === 'locked';
  const pulse = usePulse(state === 'active' && !!showHereBadge);
  const badgeOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });

  if (state === 'complete') {
    return (
      <View style={styles.finishedCard}>
        <View style={styles.finishedCardBody}>
          <Text style={styles.finishedCardTitle} numberOfLines={2}>
            {title}
          </Text>
          {!!desc && (
            <Text style={styles.finishedCardDesc} numberOfLines={2}>
              {desc}
            </Text>
          )}
        </View>
        {/* Flush against the card's own right/top/bottom edges, no padding
            or radius of its own -- the card is overflow:hidden with its own
            16px radius, so it clips the image's outer corners to match
            instead of the image needing to know the card's radius itself. */}
        {!!image && <Image source={image} style={styles.finishedCardThumb} resizeMode="cover" />}
      </View>
    );
  }

  return (
    <View style={[styles.milestoneCard, locked && styles.milestoneCardLocked]}>
      <Image source={image} style={styles.milestoneCardImage} resizeMode="cover" />
      {/* RN's Image has no CSS-filter equivalent (no grayscale/brightness) —
          a flat dark scrim is the native approximation for "locked, dimmed
          photo" the design spec asks for. */}
      {locked && <View style={styles.milestoneCardLockedScrim} />}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(22,22,22,0)', 'rgba(22,22,22,0.68)', 'rgba(22,22,22,0.94)']}
        locations={[0.42, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      {locked ? (
        <View style={styles.milestoneLockBadge}>
          <MaterialCommunityIcons name="lock-outline" size={11} color="rgba(255,255,255,0.6)" />
        </View>
      ) : showHereBadge ? (
        <Animated.View style={[styles.milestoneHereBadge, { opacity: badgeOpacity }]}>
          <Text style={styles.milestoneHereBadgeText}>YOU ARE HERE</Text>
        </Animated.View>
      ) : null}
      <View style={styles.milestoneCardTextWrap}>
        <Text style={[styles.milestoneCardTitle, locked && styles.milestoneCardTitleLocked]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.milestoneCardDesc, locked && styles.milestoneCardDescLocked]} numberOfLines={2}>
          {desc}
        </Text>
        {!!stats?.length && (
          <View style={styles.statPillRow}>
            {stats.map((s) => (
              <StatPill key={s.icon} icon={s.icon} label={s.label} dim={locked} />
            ))}
          </View>
        )}
        {!locked && (ctaLabel || secondaryCtaLabel) && (
          <View style={styles.ctaRow}>
            {ctaLabel && onPressCta && <MilestoneCardCta label={ctaLabel} onPress={onPressCta} />}
            {secondaryCtaLabel && onPressSecondaryCta && (
              <MilestoneCardCta label={secondaryCtaLabel} secondary onPress={onPressSecondaryCta} />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function NodeRow({
  number,
  state,
  title,
  desc,
  image,
  stats,
  ctaLabel,
  onPressCta,
  secondaryCtaLabel,
  onPressSecondaryCta,
  isLast,
  staggerIndex = 0,
  containerRef,
  attachedQuest,
  children,
}: {
  number: number;
  state: NodeState;
  title: string;
  desc: string;
  // Active/locked rows render as a photo card; complete rows render the
  // plain dark "Finished" card instead and never show a photo, even if one
  // is passed (see JourneyCard).
  image?: ImageSourcePropType;
  stats?: StatPillDatum[];
  ctaLabel?: string;
  onPressCta?: () => void;
  secondaryCtaLabel?: string;
  onPressSecondaryCta?: () => void;
  isLast: boolean;
  staggerIndex?: number;
  containerRef?: React.Ref<View>;
  // The one paired quest a day card can have -- rendered below the card as
  // AttachedQuest (complete/locked) or QuestBranch (active). Never passed
  // for milestones/Strength Trial, which have no paired quest.
  attachedQuest?: AttachedQuestData;
  children?: React.ReactNode;
}) {
  // Same one-time mount-pop as NodeCircle (see useMountPop's comment for
  // why this animates on mount rather than on a state-change diff),
  // applied to the card side so the whole row visibly arrives together
  // rather than the circle animating while the card next to it just snaps
  // into place.
  const pop = useMountPop(state === 'locked' ? -1 : staggerIndex);
  const contentPopStyle = { opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };

  return (
    <View ref={containerRef} style={styles.row}>
      <View style={styles.rowLeft}>
        <NodeCircle state={state} number={number} staggerIndex={staggerIndex} />
        {!isLast && <Connector complete={state === 'complete'} staggerIndex={staggerIndex} />}
      </View>
      <Animated.View style={[styles.rowRight, contentPopStyle]}>
        <JourneyCard
          state={state}
          image={image}
          title={title}
          desc={desc}
          stats={stats}
          ctaLabel={ctaLabel}
          onPressCta={onPressCta}
          secondaryCtaLabel={secondaryCtaLabel}
          onPressSecondaryCta={onPressSecondaryCta}
          showHereBadge={state === 'active'}
        />
        {state === 'active' && children}
        {attachedQuest &&
          (attachedQuest.state === 'active' ? (
            <QuestBranch kind={attachedQuest.kind} onPress={attachedQuest.onPress} onSkip={attachedQuest.onSkip} />
          ) : (
            <AttachedQuest
              kind={attachedQuest.kind}
              state={attachedQuest.state}
              skipped={attachedQuest.skipped}
              onPress={attachedQuest.onPress}
            />
          ))}
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

function DayNode({ number, state, title, day, seed, isLast, containerRef, onPress, attachedQuest }: {
  number: number;
  // 'complete' (already resolved, kept visible as history), 'active' (the
  // one current pointer position — the only one actually startable), or
  // 'locked' (a future day in this week, shown so the full week is visible
  // but not yet reachable -- the strict one-step-at-a-time gating still
  // applies, only visibility changed per direct request).
  state: NodeState;
  title: string;
  // Real block/exercise data for this day, used to pick a push/pull/lower-
  // body photo (see pickDayCardImage) and the stat pills (duration/movement
  // count) -- not just for display.
  day: ProgramDay;
  // Distinguishes this day from others sharing the same day.name across
  // different weeks (e.g. every week's "DAY 1"), so they don't all land on
  // the same pool index -- see pickFromPool.
  seed: string;
  isLast: boolean;
  containerRef?: React.Ref<View>;
  onPress: () => void;
  // The quest paired with this day, if any -- see buildWeekSequence's
  // afterDayIndex. Rendered below the card by NodeRow.
  attachedQuest?: AttachedQuestData;
}) {
  return (
    <TouchableOpacity ref={containerRef} activeOpacity={0.7} onPress={onPress} disabled={state === 'locked'}>
      <NodeRow
        number={number}
        state={state}
        title={title}
        desc={state === 'complete' ? 'Completed.' : state === 'active' ? 'Up next in your program.' : 'Unlocks once the step before it is done.'}
        image={pickDayCardImage(day, seed)}
        stats={[
          { icon: 'clock-outline', label: `${estimateSessionMinutes(day)} MIN` },
          { icon: 'dumbbell', label: `${countMovements(day)} MOVEMENTS` },
        ]}
        ctaLabel={state === 'active' ? 'START NOW' : undefined}
        onPressCta={state === 'active' ? onPress : undefined}
        isLast={isLast}
        staggerIndex={number}
        attachedQuest={attachedQuest}
      />
    </TouchableOpacity>
  );
}

type SideQuestKind = '1mm' | 'static' | 'power' | 'weekly';

// pathname/params build the deep link; questSlotKey (this slot's unique id,
// e.g. "w2_s0") rides along as a route param so the destination screen can
// hand it straight back once the user actually logs something there —
// that's the one signal MilestoneLaneScreen needs to mark this specific
// slot complete, no new table or polling required. 'weekly' is the one
// exception: WeeklyChallengeScreen doesn't yet wire up that return signal
// (see its own note below), so that slot only ever resolves via SKIP today.
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
  weekly: {
    icon: 'trophy-outline',
    title: 'SIDE QUEST · WEEKLY CHALLENGE',
    desc: "This week's community challenge — optional, skip it and move on any time.",
    pathname: '/weekly-challenge',
    params: {},
  },
};

// Rotation the user asked for: 1MM -> Static -> Power, but Power only if
// tier 6+ (isPowerWorldUnlocked) -- otherwise it's skipped and the
// rotation just alternates 1MM/Static. slotIndex runs continuously across
// the whole path (not reset per week) so progressing into a new week picks
// up the rotation where it left off rather than always starting at 1MM.
// Never used for the fixed 'weekly' slot -- that one's assignment isn't
// rotated, see buildWeekSequence.
function getSideQuestForSlot(slotIndex: number, strengthTier: number): '1mm' | 'static' | 'power' {
  const rotation: Array<'1mm' | 'static' | 'power'> = isPowerWorldUnlocked(strengthTier) ? ['1mm', 'static', 'power'] : ['1mm', 'static'];
  return rotation[slotIndex % rotation.length];
}

// How many rotation-pool ticks (see getSideQuestForSlot) a week of this
// shape consumes, without needing to actually build its sequence -- used to
// seed the rotation counter for the current week from every earlier week's
// count. The first between-day gap is always the fixed weekly-challenge
// slot (not part of the rotation); every other between-day gap rotates, and
// so does the end-of-week slot on a non-trial week (a trial week's
// end-of-week slot is the strength trial itself, outside the rotation).
function rotationSlotsUsed(dayCount: number, isTrialWeek: boolean): number {
  const midWeekRotating = Math.max(dayCount - 2, 0);
  return midWeekRotating + (isTrialWeek ? 0 : 1);
}

type SequenceItem =
  | { kind: 'day'; dayIndex: number }
  // afterDayIndex is the day this quest opens alongside -- see buildWeekSequence.
  | { kind: 'quest'; slotIndex: number; questKind: SideQuestKind; afterDayIndex: number };

// The one-step-at-a-time flow, per direct spec: Day1 -> Weekly Challenge
// (always, fixed) -> Day2 -> a rotating quest -> Day3 (last day) -> another
// rotating quest, UNLESS this is a trial week, in which case that
// end-of-week slot is skipped here entirely -- the strength trial takes it
// instead, rendered separately outside this sequence (see the render code)
// since it's a bonus checkpoint, not another gate: it was never required to
// resolve for the week to count as complete, and that stays true here so a
// user is never blocked from starting next week just because they haven't
// tested their tier yet.
//
// A day is resolved by real completion data (workout_logs, via day.status).
// A quest (weekly-challenge or rotating alike) opens alongside the day it's
// paired with -- the moment that day becomes the current step, not once
// it's finished -- and resolves by finishing it for real or explicitly
// skipping it. Per direct request, a quest is "part of the day before," not
// its own gate: it never blocks the day after it (see the render loop,
// which derives each item's state independently rather than from a single
// shared pointer).
function buildWeekSequence(days: DayStateEntry[], isTrialWeek: boolean, strengthTier: number, rotationSeed: number): SequenceItem[] {
  const items: SequenceItem[] = [];
  let rotationCounter = rotationSeed;
  let slotIndex = 0;
  days.forEach((_, i) => {
    items.push({ kind: 'day', dayIndex: i });
    const isLastDay = i === days.length - 1;
    if (!isLastDay) {
      const questKind: SideQuestKind = i === 0 ? 'weekly' : getSideQuestForSlot(rotationCounter++, strengthTier);
      items.push({ kind: 'quest', slotIndex: slotIndex++, questKind, afterDayIndex: i });
    }
  });
  if (!isTrialWeek) {
    items.push({
      kind: 'quest',
      slotIndex: slotIndex++,
      questKind: getSideQuestForSlot(rotationCounter++, strengthTier),
      afterDayIndex: days.length - 1,
    });
  }
  return items;
}

// Data a day's row needs to render its paired quest -- either as the plain
// AttachedQuest row (complete/locked) or, when the day itself is active, the
// branching QuestBranch instead. Built by the render loop from
// SequenceItem's 'quest' entries (see buildWeekSequence's afterDayIndex).
interface AttachedQuestData {
  kind: SideQuestKind;
  state: NodeState;
  skipped?: boolean;
  onPress: () => void;
  onSkip?: () => void;
}

// The dashed-ring + compass circle -- shared between here (the branch's
// floating node) and, previously, NodeCircle's side-quest variant, which no
// longer exists now that quests are never their own left-rail row.
function QuestNode({ size = QUEST_NODE_SIZE }: { size?: number }) {
  const pulse = usePulse(true);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });
  return (
    <Animated.View
      style={[
        styles.questNode,
        { width: size, height: size, borderRadius: size / 2, opacity },
      ]}
    >
      <MaterialCommunityIcons name="compass-outline" size={14} color={ACCENT} />
    </Animated.View>
  );
}

// Finished/locked days: a plain, non-interactive-when-locked row folded into
// the day's own card area -- no branch, no left-rail circle of its own (that
// was SideQuestNode's old job; quests are never a separate list row anymore,
// see buildWeekSequence's afterDayIndex and the render loop below).
function AttachedQuest({ kind, state, skipped, onPress }: AttachedQuestData) {
  const def = SIDE_QUEST_DEFS[kind];
  const resolved = state === 'complete';
  const locked = state === 'locked';
  return (
    <TouchableOpacity
      style={styles.attachedQuestRow}
      onPress={onPress}
      disabled={locked}
      activeOpacity={0.7}
    >
      <View style={[styles.attachedQuestIcon, locked && styles.attachedQuestIconLocked]}>
        <MaterialCommunityIcons
          name={locked ? 'lock-outline' : 'check'}
          size={11}
          color={locked ? 'rgba(255,255,255,0.35)' : '#FFFFFF'}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.attachedQuestLabel, locked && styles.attachedQuestLabelLocked]}>SIDE QUEST</Text>
        <Text
          style={[styles.attachedQuestTitle, locked && styles.attachedQuestTitleLocked, resolved && styles.attachedQuestTitleResolved]}
          numberOfLines={1}
        >
          {def.title.replace('SIDE QUEST · ', '')}
        </Text>
        {resolved && <Text style={styles.attachedQuestDesc}>{skipped ? 'Skipped.' : 'Done — nice work.'}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// The one active day's paired quest: a short dashed curve leaving the card's
// bottom-left, landing on a pulsing node, connected to a floating callout
// bubble with its own START/SKIP. Normal document flow below the day's
// card (not absolutely positioned against it) -- deliberately avoids the
// measureInWindow-style dependency chain that caused real bugs earlier this
// session (see the auto-scroll effect's own comment on why).
function QuestBranch({ kind, onPress, onSkip }: { kind: SideQuestKind; onPress: () => void; onSkip?: () => void }) {
  const def = SIDE_QUEST_DEFS[kind];
  return (
    <View style={styles.questBranchRow}>
      {/* Curve + node are one fixed-size, self-contained box instead of two
          separate flex siblings that have to happen to land on each other's
          edges -- the node is pinned to the box's right edge (absolute,
          top:0) and the curve's own path endpoint is computed from that same
          box's dimensions, so the two can never drift apart regardless of
          what else changes in this row's layout. */}
      <View style={styles.questBranchNodeWrap}>
        {/* Drops straight down from the day card above, then bends right
            into the node -- flipped from the first version, which bulged
            the opposite way (right first, then down) and read as curving
            away from the node instead of into it. */}
        <Svg width={QUEST_BRANCH_WRAP_WIDTH} height={QUEST_NODE_SIZE} style={StyleSheet.absoluteFill}>
          <Path
            d={`M4,2 Q4,${QUEST_NODE_SIZE / 2} ${QUEST_BRANCH_WRAP_WIDTH - QUEST_NODE_SIZE / 2},${QUEST_NODE_SIZE / 2}`}
            stroke={ACCENT}
            strokeWidth={2}
            strokeDasharray="4,5"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
        <View style={styles.questBranchNode}>
          <QuestNode />
        </View>
      </View>
      <View style={styles.questBubble}>
        <Text style={styles.questBubbleLabel}>SIDE QUEST</Text>
        <Text style={styles.questBubbleTitle} numberOfLines={1}>
          {def.title.replace('SIDE QUEST · ', '')}
        </Text>
        <Text style={styles.questBubbleDesc} numberOfLines={1}>
          {def.desc}
        </Text>
        <View style={styles.questBubbleCtaRow}>
          <TouchableOpacity style={styles.questBubbleCta} onPress={onPress}>
            <Text style={styles.questBubbleCtaText}>START</Text>
          </TouchableOpacity>
          {onSkip && (
            <TouchableOpacity style={styles.questBubbleCtaSecondary} onPress={onSkip}>
              <Text style={styles.questBubbleCtaSecondaryText}>SKIP</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
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
  // Whether this program is eligible for the self-service "ADD NEW WEEK"
  // RPC (add_week_to_own_program) once hasNextWeek is false — true only
  // for LEAP-system-owned programs (Customize Program, Ready Template),
  // never a real coach's program, matching that RPC's own server-side
  // check (coach_id = LEAP_SYSTEM_PROFILE_ID). A customized program is
  // structurally always a single week (create_custom_program_from_workouts
  // hardcodes week_number = 1), so this is what actually lets someone keep
  // training past the one week they built instead of hitting a dead end.
  canAddWeek: boolean;
  // Every week from 1 through currentWeek, in order — the full path so
  // far, not just "this week". Past weeks are already fully done (that's
  // how currentWeek got here), so only the last entry ever has an active
  // next-day or unfinished trial/side-quest gate.
  weeks: JourneyWeekData[];
}

const COMPLETED_QUESTS_KEY_PREFIX = 'milestone_lane_quests_done_';
const SKIPPED_QUESTS_KEY_PREFIX = 'milestone_lane_quests_skipped_';
// Matches the constant of the same name used server-side (e.g.
// select_library_template, add_week_to_own_program) — the system profile
// that owns Customize Program / Ready Template programs, as opposed to a
// real coach or the AI coach profile.
const LEAP_SYSTEM_PROFILE_ID = '00000000-0000-0000-0000-000000000001';

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
  // Side quests explicitly skipped (SKIP button, not a real log) — a
  // separate set from completedQuestSlots so the UI can still say
  // "Skipped." honestly rather than "Done." Gating-wise the two are
  // equivalent (both resolve the slot and unlock the next day); only the
  // copy differs.
  const [skippedQuestSlots, setSkippedQuestSlots] = useState<Set<string>>(new Set());
  // Auto-scroll target: whichever single row is "the current step" gets
  // this ref attached (only one at a time, across whichever branch is
  // rendering) so the screen can jump straight to it on load instead of
  // requiring a manual scroll past however much history exists above it.
  const scrollViewRef = useRef<ScrollView>(null);
  const activeStepRef = useRef<View>(null);
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
    AsyncStorage.getItem(`${SKIPPED_QUESTS_KEY_PREFIX}${profile.id}`)
      .then((stored) => {
        if (stored) setSkippedQuestSlots(new Set(JSON.parse(stored)));
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

  const handleSkipQuest = useCallback(
    (slotKey: string) => {
      if (!profile?.id) return;
      setSkippedQuestSlots((prev) => {
        if (prev.has(slotKey)) return prev;
        const next = new Set(prev);
        next.add(slotKey);
        AsyncStorage.setItem(`${SKIPPED_QUESTS_KEY_PREFIX}${profile.id}`, JSON.stringify(Array.from(next))).catch(() => {});
        return next;
      });
    },
    [profile?.id]
  );

  useFocusEffect(
    useCallback(() => {
      // Skip while the tier-reveal is up — see the loadJourneyProgram
      // focus effect below for why. showReveal is in the dependency array
      // so the moment dismissReveal() flips it false, this re-fires
      // automatically (screen is still focused) and catches up.
      if (showReveal) return;
      refreshProfile();
    }, [refreshProfile, showReveal])
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
        .select('id, template_id, current_week, coach_id, program_templates:template_id ( name )')
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
        canAddWeek: (program as any).coach_id === LEAP_SYSTEM_PROFILE_ID,
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
      // RankUpReveal's animation is JS-thread-driven (useNativeDriver:
      // false internally, likely because its progress-bar width isn't
      // native-drivable), so it needs the JS thread free to stay smooth.
      // loadJourneyProgram is 3 sequential/parallel Supabase queries plus
      // grouping/parsing on that same thread, and this focus effect fires
      // at exactly the moment a reveal is often due (returning from the
      // assessment flow) — reported live as "the rank up modal is heavy
      // lagging when opening the journey." The data isn't displayed while
      // the reveal covers the screen anyway, so there's nothing to lose by
      // deferring the fetch until it's dismissed (see showReveal in the
      // dependency array below, same pattern as the refreshProfile effect
      // above).
      if (showReveal) return;
      loadJourneyProgram();
    }, [loadJourneyProgram, showReveal])
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
    if (!journeyData) return;

    // No more pre-built weeks and this program isn't eligible for
    // self-service extension (a real coach's program, or the AI coach's
    // own -- it has its own append mechanism) -- same "just go look at
    // it" behavior as before.
    if (!journeyData.hasNextWeek && !journeyData.canAddWeek) {
      router.push({ pathname: '/warrior-program', params: { returnTo: 'journey' } });
      return;
    }

    setAdvancingWeek(true);

    // Customize Program always creates exactly one week
    // (create_custom_program_from_workouts hardcodes week_number = 1) --
    // reported live as "after finishing the week he customized he can't
    // add a new week." add_week_to_own_program clones the current week's
    // blocks forward as the next one; the current_week bump below (shared
    // with the hasNextWeek path) is what actually makes it the active week.
    if (!journeyData.hasNextWeek && journeyData.canAddWeek) {
      const { error: addWeekError } = await supabase.rpc('add_week_to_own_program', {
        p_warrior_program_id: journeyData.warriorProgramId,
      });
      if (addWeekError) {
        console.error('Failed to add a new week:', addWeekError);
        setAdvancingWeek(false);
        router.push({ pathname: '/warrior-program', params: { returnTo: 'journey' } });
        return;
      }
    }

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

  // Auto-scroll to whichever row claimed activeStepRef (the current
  // milestone, day, or quest — exactly one at a time, see the containerRef
  // assignments below). Placed before the early RankUpReveal return, not
  // after, so this hook is never called conditionally: showReveal toggles
  // false->true->false within a single mount (see dismissReveal), and a
  // hook only present on some of those render passes would violate the
  // Rules of Hooks. The effect body itself still only touches refs, which
  // are already attached by the time any effect runs regardless of where
  // it's declared in the function.
  useEffect(() => {
    if (mode === 'journey' && journeyLoading) return;
    const t = setTimeout(() => {
      const node = activeStepRef.current as unknown as {
        measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
      } | null;
      const scrollNode = scrollViewRef.current as unknown as {
        measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
        scrollTo: (o: { y: number; animated: boolean }) => void;
      } | null;
      if (!node?.measureInWindow || !scrollNode?.measureInWindow) return;
      // measureLayout's relativeTo-node approach silently failed here
      // (likely a New Architecture/Fabric ref quirk — this project has
      // newArchEnabled: true) and swallowing that failure meant it just
      // did nothing, landing on the default top-of-list position instead
      // of scrolling — reported live as "still navigates to the first
      // step." measureInWindow on both nodes and subtracting is a simpler,
      // more universally reliable alternative: at this point (right after
      // mount, before any user scrolling) the ScrollView's own offset is
      // still 0, so the difference between the two window positions is
      // already the target scroll offset, no relative-node argument needed.
      // Lands the current card in the middle of the screen, not just
      // scrolled into view at the top -- centers the node's own vertical
      // midpoint against the screen's, using its real measured height
      // rather than a guessed fixed offset.
      scrollNode.measureInWindow((_svX, svY) => {
        node.measureInWindow!((_nX, nY, _nWidth, nHeight) => {
          const screenHeight = Dimensions.get('window').height;
          const target = nY + nHeight / 2 - svY - screenHeight / 2;
          scrollNode.scrollTo({ y: Math.max(target, 0), animated: true });
        });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [mode, journeyLoading, journeyData, legacyAcknowledged, legacyFlowActive]);

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
  // Plain function, not useCallback -- it's only ever called directly below
  // in the same render, never passed down as a memoized prop or referenced
  // in another hook's dependency array, so memoizing it bought nothing. A
  // useCallback here was also the actual bug just reported live ("Rendered
  // fewer hooks than expected"): it sat after the early RankUpReveal return
  // above, so the render pass where showReveal is true skipped this hook
  // call entirely while the very next render (showReveal now false) called
  // it -- a genuine Rules-of-Hooks violation, not the earlier auto-scroll
  // effect (which was already correctly placed before that return).
  const isQuestSlotResolved = (slotKey: string) => completedQuestSlots.has(slotKey) || skippedQuestSlots.has(slotKey);
  // Trial/side-quest gating and the week-complete banner only ever look at
  // the latest (current) week — earlier weeks in the path are already done.
  const latestWeek = journeyData ? journeyData.weeks[journeyData.weeks.length - 1] ?? null : null;
  // Strength Trial: every 2 weeks, starting from week 1 -- odd weeks (1, 3,
  // 5...) are trial weeks, per direct spec.
  const isTrialWeek = !!journeyData && journeyData.currentWeek % 2 === 1;
  // Days gate days -- the first not-yet-done day is the one active step.
  // Quests are deliberately decoupled from this (see the render loop
  // below): a quest opens alongside the day it's paired with, the moment
  // that day becomes current, but never blocks the day after it -- it's
  // "part of the day before," not its own gate. -1 means every day this
  // week is already done.
  const latestDayPointer = latestWeek ? latestWeek.days.findIndex((d) => d.status !== 'done') : -1;
  // The strength trial is the one exception that keeps a real gate: it
  // only unlocks once every day this week is done, same as before.
  const weekComplete = !!latestWeek && latestWeek.days.length > 0 && latestDayPointer === -1;
  // "Strength trial card can be skipped" -- reuses the exact same
  // skippedQuestSlots/handleSkipQuest plumbing quests already use, with a
  // synthetic per-week slot key rather than a new tracking mechanism.
  const trialSlotKey = journeyData ? `w${journeyData.currentWeek}_trial` : '';
  const trialSkipped = skippedQuestSlots.has(trialSlotKey);

  return (
    <View style={styles.screen}>
    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.header}>MY JOURNEY</Text>

      <View style={styles.lane}>
        <>
            <NodeRow
              number={1}
              state={milestone1State}
              title="01 ASSESSMENT"
              desc={milestone1State === 'complete' ? 'Starting tier set.' : 'Find your starting tier.'}
              image={pickFromPool(RANDOM_IMAGES, 'milestone-1')}
              ctaLabel="START"
              onPressCta={() => router.push('/assessment-gate')}
              isLast={false}
              staggerIndex={1}
              containerRef={milestone1State === 'active' ? activeStepRef : undefined}
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
              image={pickFromPool(RANDOM_IMAGES, 'milestone-2')}
              ctaLabel="START"
              onPressCta={() => router.push('/goals-equipment')}
              isLast={false}
              staggerIndex={2}
              containerRef={milestone2State === 'active' ? activeStepRef : undefined}
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
              image={pickFromPool(RANDOM_IMAGES, 'milestone-3')}
              isLast
              staggerIndex={3}
              containerRef={milestone3State === 'active' ? activeStepRef : undefined}
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

            {/* Per direct request: keep the onboarding steps (Assessment/
                Goals/Build Program) permanently visible as the first few
                steps of the lane, rather than collapsing them into a one-
                line summary once done -- milestone 2's own Finished card
                already shows the saved goal, so the old summary banner's
                job is redundant now. */}
            {mode === 'journey' && (journeyLoading ? (
              <Text style={styles.journeyMuted}>Loading your program…</Text>
            ) : journeyData ? (
              <>
                {journeyData.weeks.map((week, weekIdx) => {
                  const isLatestWeek = weekIdx === journeyData.weeks.length - 1;
                  const startNumber = journeyData.weeks.slice(0, weekIdx).reduce((sum, w) => sum + w.days.length, 0);

                  // A quest is never its own row anymore -- it's paired with
                  // exactly one day (afterDayIndex, see buildWeekSequence) and
                  // rendered attached to that day's card instead. Rebuilding
                  // this week's own sequence (not just the latest week's) is
                  // what lets a past week's Finished cards show what quest
                  // was attached and whether it was done/skipped, instead of
                  // silently dropping that info the way the old history view
                  // did.
                  const weekIsTrialWeek = week.weekNumber % 2 === 1;
                  const weekRotationSeed = journeyData.weeks
                    .slice(0, weekIdx)
                    .reduce((sum, w) => sum + rotationSlotsUsed(w.days.length, w.weekNumber % 2 === 1), 0);
                  const weekSequence = buildWeekSequence(week.days, weekIsTrialWeek, profile?.strength_tier || 0, weekRotationSeed);
                  const questByDayIndex = new Map<number, Extract<SequenceItem, { kind: 'quest' }>>();
                  weekSequence.forEach((item) => {
                    if (item.kind === 'quest') questByDayIndex.set(item.afterDayIndex, item);
                  });

                  const attachedQuestFor = (dayIndex: number, dayState: NodeState): AttachedQuestData | undefined => {
                    const questItem = questByDayIndex.get(dayIndex);
                    if (!questItem) return undefined;
                    const slotKey = `w${week.weekNumber}_s${questItem.slotIndex}`;
                    const resolved = isQuestSlotResolved(slotKey);
                    const def = SIDE_QUEST_DEFS[questItem.questKind];
                    // Opens alongside its day -- the moment that day is
                    // reached (active or done), never gated behind the day
                    // being *finished*. Never blocks the day after it either
                    // (unlike the strength trial, which still waits for the
                    // whole week) -- it's "part of the day before," not its
                    // own gate.
                    return {
                      kind: questItem.questKind,
                      state: resolved ? 'complete' : dayState !== 'locked' ? 'active' : 'locked',
                      skipped: skippedQuestSlots.has(slotKey),
                      onPress: () =>
                        router.push({
                          pathname: def.pathname,
                          params: { ...def.params, returnTo: 'journey', questSlotKey: slotKey },
                        }),
                      onSkip: () => handleSkipQuest(slotKey),
                    };
                  };

                  // Past weeks: full history, every day already done -- no
                  // pointer needed, only the quest resolution can vary.
                  // Current week: the full week is always visible (per direct
                  // request — "can i see the full week instead of showing me
                  // next step and next trial strength only"). Gating itself
                  // is unchanged: only the pointer day is 'active'
                  // (startable), everything after it renders 'locked' (no
                  // CTA, dimmed, not tappable) so the whole week's shape is
                  // visible without letting anyone skip ahead out of order.
                  const rows = week.days.map((d, i) => {
                    const dayState: NodeState = !isLatestWeek
                      ? 'complete'
                      : latestDayPointer === -1 || i < latestDayPointer
                      ? 'complete'
                      : i === latestDayPointer
                      ? 'active'
                      : 'locked';
                    const isDayPointer = isLatestWeek && i === latestDayPointer;
                    return (
                      <DayNode
                        key={`day-${week.weekNumber}-${i}`}
                        number={startNumber + i + 1}
                        state={dayState}
                        title={d.day.name.toUpperCase()}
                        day={d.day}
                        seed={`w${week.weekNumber}-d${i}-${d.day.name}`}
                        isLast={false}
                        containerRef={isDayPointer ? activeStepRef : undefined}
                        onPress={() =>
                          router.push({
                            pathname: '/warrior-program',
                            // startDay only makes sense for the current
                            // week -- WarriorProgramScreen lands on
                            // current_week by default, so a past week's day
                            // index wouldn't refer to the right day there.
                            params: isLatestWeek
                              ? { returnTo: 'journey', startDay: String(i) }
                              : { returnTo: 'journey' },
                          })
                        }
                        attachedQuest={attachedQuestFor(i, dayState)}
                      />
                    );
                  });

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
                  state={trialSkipped ? 'complete' : weekComplete && isTrialWeek ? 'active' : 'locked'}
                  title="STRENGTH TRIAL"
                  desc={
                    trialSkipped
                      ? 'Skipped.'
                      : !isTrialWeek
                      ? `Every 2 weeks — next available Week ${journeyData.currentWeek + 1}.`
                      : weekComplete
                      ? "Test your current tier now that this week's days are done."
                      : 'Unlocks after every day this week is done.'
                  }
                  image={pickFromPool(RANDOM_IMAGES, `strength-trial-${journeyData.currentWeek}`)}
                  ctaLabel="START"
                  onPressCta={() => router.push({ pathname: '/trial', params: { mode: 'progression', returnTo: 'journey' } })}
                  secondaryCtaLabel={!trialSkipped ? 'SKIP' : undefined}
                  onPressSecondaryCta={!trialSkipped ? () => handleSkipQuest(trialSlotKey) : undefined}
                  isLast
                  staggerIndex={journeyData.weeks.reduce((sum, w) => sum + w.days.length, 0) + 1}
                  // Once the day/quest sequence is exhausted, none of those
                  // rows claim the auto-scroll ref (their pointer is -1) —
                  // this becomes "the next thing" instead, trial week or not
                  // (unless it's already been skipped, in which case there's
                  // nothing left here to scroll to).
                  containerRef={weekComplete && !trialSkipped ? activeStepRef : undefined}
                />

                {weekComplete && (
                  <View style={styles.weekCompleteBanner}>
                    <MaterialCommunityIcons name="trophy-outline" size={18} color={ACCENT} />
                    <Text style={styles.weekCompleteText}>
                      {journeyData.hasNextWeek || journeyData.canAddWeek
                        ? 'Week complete — nice work.'
                        : "Week complete — that's every week in this program."}
                    </Text>
                    <TouchableOpacity
                      style={[styles.weekCompletePill, advancingWeek && { opacity: 0.6 }]}
                      onPress={handleContinueProgram}
                      disabled={advancingWeek}
                    >
                      <Text style={styles.weekCompletePillText}>
                        {advancingWeek
                          ? (journeyData.hasNextWeek ? 'STARTING NEXT WEEK…' : journeyData.canAddWeek ? 'ADDING WEEK…' : 'STARTING NEXT WEEK…')
                          : journeyData.hasNextWeek
                          ? 'START WEEK ' + (journeyData.currentWeek + 1)
                          : journeyData.canAddWeek
                          ? 'ADD NEW WEEK'
                          : 'VIEW PROGRAM'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.journeyMuted}>No active program yet — build one above to see your daily journey here.</Text>
            ))}

            <GhostNode />
        </>
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
    gap: 10,
  },
  rowLeft: {
    alignItems: 'center',
    width: NODE_SIZE,
  },
  rowRight: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: 10,
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
  nodeNumberActive: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 16,
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
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  ctaPillText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  ctaPillSecondary: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  ctaPillSecondaryText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  finishedCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 84,
  },
  finishedCardBody: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  finishedCardThumb: {
    // Fixed, deliberately wide-ish panel rather than a small inset square
    // or an exact aspect-ratio match -- fills the card's full height
    // (alignSelf:'stretch') flush to the right edge, reading as a real
    // cover photo rather than a tiny icon.
    width: 100,
    alignSelf: 'stretch',
  },
  finishedCardTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 15,
    textDecorationLine: 'line-through',
    textDecorationColor: 'rgba(255,255,255,0.4)',
  },
  finishedCardDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'PlusJakartaSans-Light',
    fontSize: 12.5,
    marginTop: 3,
  },
  statPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  statPillDim: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statPillText: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 10,
  },
  statPillTextDim: {
    color: 'rgba(255,255,255,0.35)',
  },
  attachedQuestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  attachedQuestIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachedQuestIconLocked: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  attachedQuestLabel: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  attachedQuestLabelLocked: {
    color: 'rgba(255,255,255,0.25)',
  },
  attachedQuestTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 12.5,
    marginTop: 1,
  },
  attachedQuestTitleLocked: {
    color: 'rgba(255,255,255,0.3)',
  },
  attachedQuestTitleResolved: {
    textDecorationLine: 'line-through',
    textDecorationColor: 'rgba(255,255,255,0.4)',
  },
  attachedQuestDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'PlusJakartaSans-Light',
    fontSize: 11.5,
    marginTop: 1,
  },
  questNode: {
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questBranchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  questBranchNodeWrap: {
    width: QUEST_BRANCH_WRAP_WIDTH,
    height: QUEST_NODE_SIZE,
  },
  questBranchNode: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  questBubble: {
    flex: 1,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: ACCENT_DIM,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  questBubbleLabel: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 8,
    letterSpacing: 1,
  },
  questBubbleTitle: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 12,
    marginTop: 1,
  },
  questBubbleDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'PlusJakartaSans-Light',
    fontSize: 9.5,
    marginTop: 1,
  },
  questBubbleCtaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  questBubbleCta: {
    backgroundColor: ACCENT,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  questBubbleCtaText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  questBubbleCtaSecondary: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  questBubbleCtaSecondaryText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  milestoneCard: {
    position: 'relative',
    height: 188,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#161616',
  },
  milestoneCardLocked: {
    // Shorter than the active/current-day size -- a locked "next up"
    // preview doesn't need the same real estate; it grows back to the full
    // 188 the moment it becomes the active card (see JourneyCard).
    height: 100,
  },
  milestoneCardImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  milestoneCardLockedScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  milestoneLockBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(5,5,5,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneHereBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  milestoneHereBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 8,
    letterSpacing: 1,
  },
  milestoneCardTextWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  milestoneCardTitle: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  milestoneCardTitleLocked: {
    color: 'rgba(255,255,255,0.35)',
  },
  milestoneCardDesc: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 12,
    marginTop: 3,
  },
  milestoneCardDescLocked: {
    color: 'rgba(255,255,255,0.25)',
  },
  milestoneCardCta: {
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  milestoneCardCtaSheen: {
    position: 'absolute',
    top: -14,
    bottom: -14,
    width: 20,
    backgroundColor: 'rgba(255,255,255,0.35)',
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
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 12.5,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
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
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
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
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 13,
    letterSpacing: 1,
  },
  choiceDesc: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
});
