import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, ActivityIndicator, Alert, LayoutChangeEvent, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
// A plain react-native ScrollView doesn't negotiate with RNGH's separate
// gesture recognizer system — the scroll responder can grab/cancel the
// long-press-then-drag before it ever activates. RNGH's own ScrollView is
// a drop-in replacement that's part of the same gesture system, so a
// Gesture.Pan() card inside it behaves correctly (long-press still starts
// a drag; a quick swipe still scrolls normally).
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, SharedValue } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  getStandaloneWorkouts,
  getStandaloneWorkoutDetail,
  createCustomProgramFromWorkouts,
  StandaloneWorkoutSummary,
  StandaloneWorkoutDetail,
} from '../lib/workoutLibrary';
import { DifficultyBand } from '../lib/templateLibrary';
import { canAccessCustomizeProgram, isProRequiredError } from '../lib/entitlement';
import { StealthTheme } from '../../constants/Theme';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { StandaloneWorkoutDetailModal, BuildSummaryModal, UpgradeToSaveModal } from '../components/workoutLibrary/SharedWorkoutModals';
import { ChipRow } from '../components/trainingCenter/ChipRow';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

// Browse standalone Workouts, pick up to MAX_CUSTOM_PROGRAM_DAYS as your
// custom program's days, then create it. The preview/build modals are
// shared with ProgramTemplatesScreen (StandaloneWorkoutDetailModal /
// BuildSummaryModal, from ../components/workoutLibrary/SharedWorkoutModals)
// rather than rebuilt, so the actual add/remove/create behavior stays
// consistent everywhere it's used.
const MAX_CUSTOM_PROGRAM_DAYS = 7;
const CATEGORY_OPTIONS = ['all', 'PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY'] as const;
const DIFFICULTY_OPTIONS: (DifficultyBand | 'all')[] = ['all', 'beginner', 'intermediate', 'advanced'];
// Quick Build day-count filter — same MAX_CUSTOM_PROGRAM_DAYS ceiling applies
// server-side, this is just the UX-recommended quick-pick range.
const DAY_COUNT_OPTIONS = ['2', '3', '4', '5', '6'] as const;

// A free user's build must survive the trip through the paywall.
// PaywallScreen.goToProfile() calls router.dismissAll() on a successful
// purchase (see its own comment), which unmounts this screen entirely —
// selectedDayWorkouts/daySlots are plain useState and don't survive that.
// The workout IDs (order preserved) are stashed here right before pushing
// to /paywall and picked back up by the restore effect below, so "your
// days stay exactly as you built them" (UpgradeToSaveModal's copy) is
// actually true instead of just a promise the code doesn't keep.
const pendingProgramStorageKey = (userId: string) => `pending_custom_program_${userId}`;

async function persistPendingProgram(userId: string | undefined, workouts: StandaloneWorkoutSummary[]) {
  if (!userId || workouts.length === 0) return;
  try {
    await AsyncStorage.setItem(pendingProgramStorageKey(userId), JSON.stringify(workouts.map((w) => w.id)));
  } catch (err) {
    console.error('persistPendingProgram failed:', err);
  }
}

type DaySlot = StandaloneWorkoutSummary | null;
type DragPayload = { type: 'workout'; workout: StandaloneWorkoutSummary } | { type: 'slot'; index: number };
type SlotRect = { x: number; y: number; width: number; height: number };

// A dragged card is a child of the scrollable grid, which paints *behind*
// the floating Quick Build panel in React Native's stacking order — no
// zIndex/elevation on the card itself can lift it above a later sibling
// subtree. So instead of animating the card in place, every DraggableCard
// hands its position + "what it is" off to this single top-level ghost
// (rendered last, above everything, including the panel) for the duration
// of the drag — the original card just dims to show it's lifted. Position
// (x/y/size/active) is UI-thread shared values for 60fps tracking with no
// re-render; `setPayload` is the one JS-thread hop (via runOnJS), called
// only at drag start/end, to swap which card's visual the ghost shows.
type DragGhostContextValue = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
  active: SharedValue<number>;
  setPayload: (p: DragPayload | null) => void;
};
const DragGhostContext = createContext<DragGhostContextValue | null>(null);

function triggerDragHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  PULL: ['#8E6FD1', '#4A2F82'],
  PUSH: ['#FF6F5E', '#B71C1C'],
  LEGS: ['#5FC4F7', '#0D4C7A'],
  CORE: ['#FFC15E', '#B8730A'],
  FULL_BODY: ['#5FD9C9', '#0F6B62'],
  DEFAULT: ['#8B98A5', '#37474F'],
};
function categoryGradient(category: string | null | undefined): [string, string] {
  return CATEGORY_GRADIENTS[category ?? ''] ?? CATEGORY_GRADIENTS.DEFAULT;
}

// The image/gradient + badge overlay shared by both Browse mode's tappable
// WorkoutPhotoCard and Quick Build's draggable card — split out so Quick
// Build's DraggableCard wrapper can reuse the exact same visual without
// duplicating markup, while WorkoutPhotoCard's own TouchableOpacity (and
// therefore Browse mode's tap-to-add behavior) stays completely untouched.
function WorkoutCardVisual({
  item,
  locked,
  showProBadge,
  dayNumber,
  columns,
}: {
  item: StandaloneWorkoutSummary;
  locked: boolean;
  showProBadge?: boolean;
  dayNumber: number | null;
  columns: 1 | 2;
}) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = getStyles(c);
  const [colorStart, colorEnd] = categoryGradient(item.category);
  const coverSource = item.cover_image_url ? { uri: item.cover_image_url } : null;
  const isSelected = dayNumber !== null;
  const isWide = columns === 1;

  const overlay = (
    <>
      {locked && <View style={StyleSheet.absoluteFillObject} pointerEvents="none" />}
      <View style={styles.cardTopRow}>
        {isSelected ? (
          <View style={styles.dayBadge}>
            <MaterialCommunityIcons name="check-circle" size={11} color="#000" />
            <Text style={styles.dayBadgeText}>DAY {dayNumber}</Text>
          </View>
        ) : locked ? (
          <View style={styles.lockBadge}>
            {/* Always white — sits on the workout's cover photo/gradient, not the page bg */}
            <MaterialCommunityIcons name="lock" size={12} color="#FFFFFF" />
          </View>
        ) : (
          <View style={styles.addBadge}>
            <MaterialCommunityIcons name="plus" size={14} color={c.coral} />
          </View>
        )}
        <View style={styles.topRightBadges}>
          {showProBadge && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
          {!!item.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText} numberOfLines={1}>{item.category.replace('_', ' ')}</Text>
            </View>
          )}
        </View>
      </View>
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
        style={[styles.cardBottomGradient, isWide ? styles.cardBottomGradientWide : styles.cardBottomGradientGrid]}
      >
        <Text style={[styles.cardTitle, isWide ? styles.cardTitleWide : styles.cardTitleGrid]} numberOfLines={isWide ? 1 : 2}>
          {item.title.toUpperCase()}
        </Text>
        {!!item.difficulty && <Text style={[styles.cardMeta, !isWide && styles.cardMetaGrid]}>{item.difficulty.toUpperCase()}</Text>}
      </LinearGradient>
    </>
  );

  return coverSource ? (
    <ImageBackground source={coverSource} style={styles.card} imageStyle={{ borderRadius: 16 }}>
      {overlay}
    </ImageBackground>
  ) : (
    <LinearGradient colors={[colorStart, colorEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      {overlay}
    </LinearGradient>
  );
}

// Browse mode's tappable card — identical markup/behavior to before the
// WorkoutCardVisual extraction, just delegating the image/overlay to it.
function WorkoutPhotoCard({
  item,
  locked,
  showProBadge,
  dayNumber,
  columns,
  hidden,
  onPress,
}: {
  item: StandaloneWorkoutSummary;
  locked: boolean;
  // Purely informational reminder that Customize Program requires Pro —
  // every workout stays fully browsable/selectable either way (this screen
  // is deliberately "browse free, paywall on Create," see isPro/handleCreate
  // below), so this must never gate tapping or add a blocking overlay the
  // way `locked` does.
  showProBadge?: boolean;
  dayNumber: number | null;
  columns: 1 | 2;
  hidden?: boolean;
  onPress: () => void;
}) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = getStyles(c);
  const isSelected = dayNumber !== null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.cardWrap,
        columns === 1 ? styles.cardWrapWide : styles.cardWrapGrid,
        isSelected && { borderColor: c.coral, borderWidth: 1.5 },
        hidden && { display: 'none' },
      ]}
    >
      <WorkoutCardVisual item={item} locked={locked} showProBadge={showProBadge} dayNumber={dayNumber} columns={columns} />
    </TouchableOpacity>
  );
}

// Quick Build's drag source/target wrapper. A single Pan gesture handles
// the drag (long-press then move, so a quick scroll swipe on the
// ScrollView underneath isn't hijacked), raced against a real Tap gesture
// for the fallback "tap fills first empty day" — whichever recognizes
// first wins, so a still finger-down resolves as a tap and any real
// movement resolves as a drag.
//
// This card never moves itself in place — instead it hands its position
// off to the single top-level DragGhostOverlay (see DragGhostContext
// above) for the duration of the drag, and just dims here to show it's
// "lifted." A card animating in place can never render above a later
// sibling (the floating panel), so once a drag crossed into the panel's
// screen area the card used to visually vanish — this is what "goes below
// the build window" / "can't drag" was: the interaction still worked, but
// its own visual feedback disappeared, which read as broken.
function DraggableCard({
  payload,
  onTap,
  onDrop,
  style,
  children,
}: {
  payload: DragPayload;
  onTap: () => void;
  onDrop: (absoluteX: number, absoluteY: number) => void;
  style?: any;
  children: React.ReactNode;
}) {
  const ghost = useContext(DragGhostContext);
  const opacity = useSharedValue(1);
  const cardWidth = useSharedValue(0);
  const cardHeight = useSharedValue(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    cardWidth.value = e.nativeEvent.layout.width;
    cardHeight.value = e.nativeEvent.layout.height;
  };

  // Clear gap between these two thresholds on purpose — with Race, whichever
  // gesture activates first wins. Tap's own maxDistance (~10px, RNGH default)
  // already rejects anything that moved; the duration gap here just makes
  // sure a normal-speed tap resolves as a tap before the long-press timer
  // could steal it and turn a still, near-zero-movement release into a
  // silently-no-op "drag" instead (confirmed bug: the two thresholds used to
  // overlap — 250ms tap vs. 180ms long-press — so most ordinary taps lost
  // the race to the drag gesture).
  const tap = Gesture.Tap()
    .maxDuration(180)
    .onEnd((_e, success) => {
      if (success) runOnJS(onTap)();
    });

  const pan = Gesture.Pan()
    .activateAfterLongPress(260)
    .onStart((e) => {
      opacity.value = withTiming(0.3, { duration: 120 });
      if (ghost) {
        ghost.width.value = cardWidth.value;
        ghost.height.value = cardHeight.value;
        // Ghost centers on the touch point rather than replicating the
        // card's exact original bounding box — simpler (no async measure
        // needed) and reads as "you're holding this," which is the point.
        ghost.x.value = e.absoluteX - cardWidth.value / 2;
        ghost.y.value = e.absoluteY - cardHeight.value / 2;
        ghost.active.value = 1;
        runOnJS(ghost.setPayload)(payload);
      }
      runOnJS(triggerDragHaptic)();
    })
    .onUpdate((e) => {
      if (!ghost) return;
      ghost.x.value = e.absoluteX - cardWidth.value / 2;
      ghost.y.value = e.absoluteY - cardHeight.value / 2;
    })
    .onEnd((e) => {
      runOnJS(onDrop)(e.absoluteX, e.absoluteY);
    })
    .onFinalize(() => {
      opacity.value = withTiming(1, { duration: 150 });
      if (ghost) {
        ghost.active.value = 0;
        runOnJS(ghost.setPayload)(null);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View onLayout={handleLayout} style={[style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

// The single top-level ghost every DraggableCard drives — rendered last in
// CustomizeProgramScreen so it paints above the grid, the floating panel,
// and everything else, regardless of where on screen the drag is.
function DragGhostOverlay({
  payload,
  x, y, width, height, active,
  daySlots,
  isPro,
  columns,
}: {
  payload: DragPayload | null;
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
  active: SharedValue<number>;
  daySlots: DaySlot[];
  isPro: boolean;
  columns: 1 | 2;
}) {
  const { mode } = useTheme();
  const styles = getStyles(TC_COLORS[mode]);
  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    height: height.value,
    opacity: active.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: active.value ? 1.06 : 1 },
    ],
  }));

  let visual: React.ReactNode = null;
  if (payload?.type === 'workout') {
    visual = (
      <WorkoutCardVisual item={payload.workout} locked={false} showProBadge={!isPro} dayNumber={null} columns={columns} />
    );
  } else if (payload?.type === 'slot') {
    const workout = daySlots[payload.index];
    if (workout) {
      const [colorStart, colorEnd] = categoryGradient(workout.category);
      const coverSource = workout.cover_image_url ? { uri: workout.cover_image_url } : null;
      visual = coverSource ? (
        <ImageBackground source={coverSource} style={StyleSheet.absoluteFillObject} imageStyle={{ borderRadius: 14 }} />
      ) : (
        <LinearGradient colors={[colorStart, colorEnd]} style={StyleSheet.absoluteFillObject} />
      );
    }
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.dragGhost, animatedStyle]}>
      {visual}
    </Animated.View>
  );
}

// One day slot in Quick Build's day-count grid. Empty slots are a plain
// drop target (no gesture of their own — nothing to drag from a "+"); filled
// slots are themselves draggable so dragging one onto another swaps them.
// Every slot reports its on-screen rect (via measureInWindow, same
// coordinate space as the Pan gesture's absoluteX/absoluteY) so the parent
// can hit-test a drop point against it.
function DaySlotCard({
  index,
  workout,
  onLayoutRect,
  onClear,
  onDrop,
}: {
  index: number;
  workout: DaySlot;
  onLayoutRect: (index: number, rect: SlotRect) => void;
  onClear: () => void;
  onDrop: (absoluteX: number, absoluteY: number) => void;
}) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = getStyles(c);
  const ref = useRef<View>(null);
  const measure = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      onLayoutRect(index, { x, y, width, height });
    });
  };

  if (!workout) {
    return (
      <View ref={ref} onLayout={measure} style={styles.daySlotEmpty}>
        <MaterialCommunityIcons name="plus" size={20} color={c.textFaint2} />
        <Text style={styles.daySlotEmptyLabel}>DAY {index + 1}</Text>
      </View>
    );
  }

  const [colorStart, colorEnd] = categoryGradient(workout.category);
  const coverSource = workout.cover_image_url ? { uri: workout.cover_image_url } : null;

  return (
    <View ref={ref} onLayout={measure} style={styles.daySlotOuter}>
      <DraggableCard payload={{ type: 'slot', index }} style={styles.daySlotFilled} onTap={() => {}} onDrop={onDrop}>
        {coverSource ? (
          <ImageBackground source={coverSource} style={StyleSheet.absoluteFillObject} imageStyle={{ borderRadius: 14 }} />
        ) : (
          <LinearGradient colors={[colorStart, colorEnd]} style={StyleSheet.absoluteFillObject} />
        )}
        <View style={styles.daySlotOverlay}>
          <View style={styles.daySlotTopRow}>
            <Text style={styles.daySlotDayLabel}>DAY {index + 1}</Text>
            <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={16} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
          <Text style={styles.daySlotTitle} numberOfLines={2}>{workout.title.toUpperCase()}</Text>
          {!!workout.category && (
            <View style={styles.daySlotCategoryBadge}>
              <Text style={styles.daySlotCategoryBadgeText} numberOfLines={1}>{workout.category.replace('_', ' ')}</Text>
            </View>
          )}
        </View>
      </DraggableCard>
    </View>
  );
}

export function CustomizeProgramScreen() {
  const { user, profile, paywallEnabled } = useAuth();
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const isPro = canAccessCustomizeProgram(profile, paywallEnabled);

  const [workoutItems, setWorkoutItems] = useState<StandaloneWorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<1 | 2>(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyBand | 'all'>('all');
  const [currentProgramName, setCurrentProgramName] = useState<string | null>(null);

  const [workoutDetail, setWorkoutDetail] = useState<StandaloneWorkoutDetail | null>(null);
  const [workoutDetailLoading, setWorkoutDetailLoading] = useState(false);
  const workoutDetailRequestId = useRef(0);

  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<StandaloneWorkoutSummary[]>([]);
  const [buildSummaryVisible, setBuildSummaryVisible] = useState(false);
  const [creatingProgram, setCreatingProgram] = useState(false);
  // Which array feeds BuildSummaryModal — Browse's tap-order list or Quick
  // Build's slot-order list — kept separate so Quick Build never touches
  // selectedDayWorkouts/Browse mode's own state at all.
  const [buildSummarySource, setBuildSummarySource] = useState<'browse' | 'quickBuild'>('browse');
  // Free users hit this instead of BuildSummaryModal when they tap Create —
  // Customize Program is Pro/Max only, so this is the actual sell moment,
  // not just a confirm step. Pro/Max users skip straight to BuildSummaryModal
  // as before.
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  // Synchronous guard (state alone isn't reliable against a same-tick
  // double-tap, since a second tap could read stale state before the
  // first setState commits) — a ref, same idiom useSafeAsync's
  // executingRef uses. Confirmed live: without this, a fast double-tap on
  // "Upgrade to Save" fired router.push('/paywall') twice, stacking two
  // PaywallScreen instances that each independently called
  // RevenueCatUI.presentPaywall() — the actual cause of an indefinite
  // native-paywall hang reported as "loading loop."
  // Reset in handlePressCreate whenever the modal is reopened (not just
  // once here at mount) — this guard is only meant to survive one open/
  // close cycle, not the lifetime of the screen.
  const upgradingRef = useRef(false);

  // Quick Build — opt-in second mode, entered via its own toggle button.
  // Browse mode above (workoutItems/selectedDayWorkouts/addDay/removeDay) is
  // completely unaffected by any of this.
  const [builderMode, setBuilderMode] = useState<'browse' | 'quickBuild'>('browse');
  // Whether the floating panel is expanded (day-count/slots visible) or
  // minimized to a small status pill — independent of builderMode, so the
  // user can tuck the panel away to browse/scroll freely without losing
  // slot progress or leaving Quick Build mode entirely.
  const [quickBuildPanelOpen, setQuickBuildPanelOpen] = useState(false);
  const [daySlots, setDaySlots] = useState<DaySlot[]>([]);
  const slotRectsRef = useRef<Record<number, SlotRect>>({});

  // Drives DragGhostOverlay — see DragGhostContext above for why this needs
  // to live at this level (one ghost, shared by every DraggableCard,
  // rendered last so it paints above the floating panel).
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const ghostWidth = useSharedValue(0);
  const ghostHeight = useSharedValue(0);
  const ghostActive = useSharedValue(0);
  const [ghostPayload, setGhostPayload] = useState<DragPayload | null>(null);
  const dragGhostContextValue = useMemo<DragGhostContextValue>(
    () => ({ x: ghostX, y: ghostY, width: ghostWidth, height: ghostHeight, active: ghostActive, setPayload: setGhostPayload }),
    []
  );

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('warrior_programs')
      .select('program_templates:template_id ( name )')
      .eq('warrior_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        const templateInfo: any = data?.program_templates;
        const name = Array.isArray(templateInfo) ? templateInfo[0]?.name : templateInfo?.name;
        setCurrentProgramName(name || (data ? 'YOUR CURRENT PROGRAM' : null));
      });
  }, [user?.id]);

  // Fetched once on mount, then filtered client-side below — re-querying
  // the server on every chip tap swapped the whole list out from under
  // itself, which read as a full reload on every filter tap. Filtering
  // the same in-memory list instead is instant and never shows a spinner.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStandaloneWorkouts('workout')
      .then((items) => { if (!cancelled) setWorkoutItems(items); })
      .catch((err) => { console.error('CustomizeProgramScreen load failed:', err); if (!cancelled) setWorkoutItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const matchesFilters = (i: StandaloneWorkoutSummary) =>
    (categoryFilter === 'all' || i.category === categoryFilter) &&
    (difficultyFilter === 'all' || i.difficulty === difficultyFilter);
  const filteredWorkoutItems = workoutItems.filter(matchesFilters);

  const getDayNumber = (item: { id: string }): number | null => {
    const idx = selectedDayWorkouts.findIndex((w) => w.id === item.id);
    return idx === -1 ? null : idx + 1;
  };

  const openDetail = async (item: StandaloneWorkoutSummary) => {
    const requestId = ++workoutDetailRequestId.current;
    setWorkoutDetailLoading(true);
    try {
      const detail = await getStandaloneWorkoutDetail(item.id);
      if (workoutDetailRequestId.current !== requestId) return;
      if (!detail) {
        Alert.alert('NOT AVAILABLE', 'THAT WORKOUT COULD NOT BE FOUND — IT MAY HAVE BEEN REMOVED.');
        return;
      }
      setWorkoutDetail(detail);
    } catch (err: any) {
      console.error('openDetail failed:', err);
      if (workoutDetailRequestId.current === requestId) {
        Alert.alert('COULD NOT LOAD WORKOUT', (err?.message || 'SOMETHING WENT WRONG.').toUpperCase());
      }
    } finally {
      if (workoutDetailRequestId.current === requestId) setWorkoutDetailLoading(false);
    }
  };

  const closeDetail = () => {
    workoutDetailRequestId.current += 1;
    setWorkoutDetail(null);
    setWorkoutDetailLoading(false);
  };

  const addDay = (item: StandaloneWorkoutSummary) => {
    if (selectedDayWorkouts.length >= MAX_CUSTOM_PROGRAM_DAYS) {
      Alert.alert('DAY LIMIT REACHED', `A CUSTOM PROGRAM CAN HAVE AT MOST ${MAX_CUSTOM_PROGRAM_DAYS} DAYS.`);
      return;
    }
    setSelectedDayWorkouts((prev) => [...prev, item]);
    setWorkoutDetail(null);
  };

  const removeDay = (workoutId: string) => {
    setSelectedDayWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
  };

  // Real root cause of "tap Upgrade to Save, it spins, then dumps to the
  // paywall's fallback screen": RevenueCatUI.presentPaywall() presents a
  // native full-screen view controller on iOS. Calling that while THIS
  // screen's own RN <Modal> (BuildSummaryModal / UpgradeToSaveModal) is
  // still mid dismiss-animation races UIKit's own presentation/dismissal
  // lock — the new presentation can silently stall until the conflicting
  // transition clears, which is what the paywall's 25s timeout was
  // actually timing out on, not genuine SDK slowness. A guessed
  // setTimeout(300) before navigating narrowed the window but never closed
  // it (RN's default Modal fade is ~300-350ms, so it's a coin flip on a
  // busy JS thread or an older device). Modal's onDismiss fires from the
  // real native dismissal completion, not a guess, and is iOS-only (never
  // called on Android) — Android's Dialog-backed Modal doesn't share
  // iOS's exclusive-presentation constraint, so navigating immediately
  // there is fine. See PaywallScreen's own transitionEnd gating for the
  // second half of this same race (the push-into-/paywall transition
  // itself vs. presentPaywall()).
  const pendingPaywallNavRef = useRef(false);
  const requestPaywallAfterModalCloses = () => {
    if (Platform.OS === 'ios') {
      pendingPaywallNavRef.current = true;
    } else {
      router.push('/paywall');
    }
  };
  const handleModalDismissed = () => {
    if (!pendingPaywallNavRef.current) return;
    pendingPaywallNavRef.current = false;
    router.push('/paywall');
  };

  // Takes the day-ordered array explicitly rather than reading
  // selectedDayWorkouts directly, so Quick Build's daySlots-derived array can
  // go through this exact same gate/RPC-call/error-handling without Browse
  // mode's state ever being involved.
  const goToPaywallAfterClosingSummary = (workouts: StandaloneWorkoutSummary[]) => {
    setBuildSummaryVisible(false);
    persistPendingProgram(user?.id, workouts);
    requestPaywallAfterModalCloses();
  };

  const handleCreateCustomProgram = async (workouts: StandaloneWorkoutSummary[]) => {
    if (workouts.length === 0) return;
    // Only reachable via BuildSummaryModal's onStart now that handlePressCreate
    // routes free users to UpgradeToSaveModal instead — kept as defense-in-depth
    // in case this is ever called from elsewhere.
    if (!isPro) { goToPaywallAfterClosingSummary(workouts); return; }
    setCreatingProgram(true);
    try {
      await createCustomProgramFromWorkouts(workouts.map((w) => w.id));
      setBuildSummaryVisible(false);
      setSelectedDayWorkouts([]);
      setDaySlots([]);
      requestAnimationFrame(() => {
        router.replace('/warrior-program');
      });
    } catch (err: any) {
      if (isProRequiredError(err)) { goToPaywallAfterClosingSummary(workouts); return; }
      Alert.alert('COULD NOT CREATE PROGRAM', err.message?.toUpperCase() || 'SOMETHING WENT WRONG.');
    } finally {
      setCreatingProgram(false);
    }
  };

  // Picks up a build stashed by persistPendingProgram (see its comment near
  // pendingProgramStorageKey above) once workoutItems has loaded far enough
  // to resolve the saved IDs back into real objects. Runs once per mount —
  // pendingRestoreRef guards against firing twice if user?.id/workoutItems/
  // isPro all settle across more than one render. If the purchase actually
  // went through (isPro is now true), finish the job the modal promised:
  // show the restored days and create the program immediately, no extra
  // tap required. If it didn't (e.g. the user backed out and is just
  // navigating around free), just restore the selection so they aren't
  // stuck rebuilding it from memory.
  const pendingRestoreRef = useRef(false);
  useEffect(() => {
    if (!user?.id || workoutItems.length === 0 || pendingRestoreRef.current) return;
    pendingRestoreRef.current = true;
    (async () => {
      const key = pendingProgramStorageKey(user.id);
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;
        await AsyncStorage.removeItem(key);
        const ids: string[] = JSON.parse(raw);
        const restored = ids
          .map((id) => workoutItems.find((w) => w.id === id))
          .filter((w): w is StandaloneWorkoutSummary => !!w);
        if (restored.length === 0) return;
        if (isPro) {
          setBuildSummarySource('browse');
          setSelectedDayWorkouts(restored);
          setBuildSummaryVisible(true);
          handleCreateCustomProgram(restored);
        } else {
          setSelectedDayWorkouts(restored);
        }
      } catch (err) {
        console.error('Restoring pending custom program failed:', err);
      }
    })();
  }, [user?.id, workoutItems, isPro]);

  // Both CTA sites (Browse's "CREATE MY WORKOUT", Quick Build's "CREATE
  // PROGRAM") funnel through here — free users see UpgradeToSaveModal
  // instead of BuildSummaryModal, since Customize Program is Pro/Max only
  // and this is the moment that should actually sell the upgrade rather
  // than just confirm-and-create.
  const handlePressCreate = (source: 'browse' | 'quickBuild') => {
    setBuildSummarySource(source);
    if (!isPro) {
      // Reset the double-tap guard every time the modal is (re)opened, not
      // just on mount — without this, a user who taps "Upgrade to Save",
      // backs out of the paywall without buying, and comes back to try
      // again finds both buttons permanently disabled (upgradingRef never
      // cleared) with no on-screen way to dismiss a transparent fade Modal
      // on iOS. Confirmed live as a full soft-lock, not just a dead button.
      upgradingRef.current = false;
      setUpgrading(false);
      setUpgradeModalVisible(true);
      return;
    }
    setBuildSummaryVisible(true);
  };

  const handleEnterQuickBuild = () => {
    setBuilderMode('quickBuild');
    setColumns(2);
    setQuickBuildPanelOpen(true);
    // 3 days pre-selected so the panel opens ready to build instead of
    // forcing a day-count tap first — only on first entry though; if the
    // user already has slots from an earlier Quick Build pass (toggled to
    // Browse and back), leave that progress alone rather than resetting it.
    setDaySlots((prev) => (prev.length === 0 ? Array(3).fill(null) : prev));
  };

  const handleExitQuickBuild = () => {
    setBuilderMode('browse');
    setQuickBuildPanelOpen(false);
  };

  const handleSelectDayCount = (n: number) => {
    if (n === daySlots.length) return;
    if (n > daySlots.length) {
      setDaySlots((prev) => [...prev, ...Array(n - prev.length).fill(null)]);
      return;
    }
    const trailing = daySlots.slice(n);
    const filledCount = trailing.filter((w) => w !== null).length;
    const applyShrink = () => setDaySlots((prev) => prev.slice(0, n));
    if (filledCount === 0) { applyShrink(); return; }
    Alert.alert(
      'REMOVE FILLED DAYS?',
      `SWITCHING TO ${n} DAYS WILL REMOVE ${filledCount} ALREADY-FILLED DAY${filledCount === 1 ? '' : 'S'}.`,
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'CONTINUE', style: 'destructive', onPress: applyShrink },
      ]
    );
  };

  const registerSlotRect = (index: number, rect: SlotRect) => {
    slotRectsRef.current[index] = rect;
  };

  const clearSlot = (index: number) => {
    setDaySlots((prev) => { const next = [...prev]; next[index] = null; return next; });
  };

  const handleDropAtPoint = (payload: DragPayload, x: number, y: number) => {
    const rects = slotRectsRef.current;
    const targetEntry = Object.entries(rects).find(
      ([, r]) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
    );
    if (!targetEntry) return;
    const targetIndex = Number(targetEntry[0]);
    setDaySlots((prev) => {
      const next = [...prev];
      if (payload.type === 'workout') {
        // A workout already sitting in another day is a MOVE, not a
        // duplicate — dragging it onto a new slot without clearing its old
        // one used to leave the same workout occupying two days at once
        // (nothing else in Quick Build guarded against that; the "2× PUSH"
        // banner below only warns on category repeats, which are a
        // deliberate, allowed choice).
        const existingIndex = next.findIndex((w) => w?.id === payload.workout.id);
        if (existingIndex !== -1 && existingIndex !== targetIndex) next[existingIndex] = null;
        next[targetIndex] = payload.workout;
      } else if (payload.index !== targetIndex) {
        const tmp = next[targetIndex];
        next[targetIndex] = next[payload.index];
        next[payload.index] = tmp;
      }
      return next;
    });
  };

  const handleTapAssignFirstEmpty = (workout: StandaloneWorkoutSummary) => {
    if (daySlots.length === 0) {
      Alert.alert('PICK A DAY COUNT FIRST', 'CHOOSE HOW MANY DAYS YOU WANT ABOVE, THEN TAP OR DRAG A WORKOUT INTO A DAY.');
      return;
    }
    // Already placed — a repeat tap should never create a second entry for
    // the same workout (drag has the equivalent guard in handleDropAtPoint).
    if (daySlots.some((w) => w?.id === workout.id)) return;
    const idx = daySlots.findIndex((w) => w === null);
    if (idx === -1) {
      Alert.alert('ALL DAYS FILLED', 'CLEAR A DAY, OR PICK A HIGHER DAY COUNT TO ADD MORE.');
      return;
    }
    setDaySlots((prev) => { const next = [...prev]; next[idx] = workout; return next; });
  };

  const quickBuildDayNumberFor = (item: { id: string }): number | null => {
    const idx = daySlots.findIndex((w) => w?.id === item.id);
    return idx === -1 ? null : idx + 1;
  };

  const filledDaySlots = daySlots.filter((w): w is StandaloneWorkoutSummary => w !== null);
  const allSlotsFilled = daySlots.length > 0 && filledDaySlots.length === daySlots.length;

  // Non-blocking — same-category days (e.g. two PUSH days) are a valid,
  // intentional choice, this is a heads-up, not a gate.
  const duplicateCategoryWarning = (() => {
    const counts: Record<string, number> = {};
    daySlots.forEach((w) => {
      if (!w?.category) return;
      const key = w.category.toUpperCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    const dupes = Object.keys(counts).filter((k) => counts[k] >= 2);
    if (dupes.length === 0) return null;
    return `${dupes.map((d) => `${counts[d]}× ${d.replace('_', ' ')}`).join(', ')} — that's fine if it's intentional.`;
  })();

  return (
    <DragGhostContext.Provider value={dragGhostContextValue}>
    <View style={{ flex: 1, backgroundColor: c.screenBg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.headerTitle}>CUSTOMIZE YOUR PROGRAM</Text>
          <Text style={styles.headerSubline}>{filteredWorkoutItems.length} WORKOUTS · {selectedDayWorkouts.length} ADDED</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: TC_LAYOUT.screenPadding,
          // Extra bottom padding whenever a floating element is on screen
          // (Browse's "create" CTA, or Quick Build's floating trigger/panel)
          // so the last grid row never sits underneath it.
          paddingBottom: builderMode === 'quickBuild' ? (quickBuildPanelOpen ? 320 : 140) : selectedDayWorkouts.length > 0 ? 140 : 24,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ChipRow options={CATEGORY_OPTIONS} selected={categoryFilter} onSelect={setCategoryFilter} />
          </View>
          <View style={styles.layoutToggle}>
            <TouchableOpacity
              onPress={() => setColumns(1)}
              style={[styles.layoutToggleBtn, columns === 1 && styles.layoutToggleBtnActive]}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <MaterialCommunityIcons name="view-agenda-outline" size={16} color={columns === 1 ? '#000' : c.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setColumns(2)}
              style={[styles.layoutToggleBtn, columns === 2 && styles.layoutToggleBtnActive]}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <MaterialCommunityIcons name="view-grid-outline" size={16} color={columns === 2 ? '#000' : c.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ height: 8 }} />
        <ChipRow options={DIFFICULTY_OPTIONS} selected={difficultyFilter} onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')} />

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={c.coral} />
          </View>
        ) : builderMode === 'quickBuild' ? (
          <View style={[styles.grid, columns === 2 && styles.gridTwoUp]}>
            {/* Same "every card stays mounted, filter only toggles display"
                approach as Browse mode below — DraggableCard here just swaps
                in for WorkoutPhotoCard's TouchableOpacity so a long-press+
                drag (or a plain tap, which fills the first empty day) can
                target a day slot instead of opening the detail modal. */}
            {workoutItems.map((item) => (
              <DraggableCard
                key={item.id}
                payload={{ type: 'workout', workout: item }}
                style={[
                  styles.cardWrap,
                  columns === 1 ? styles.cardWrapWide : styles.cardWrapGrid,
                  quickBuildDayNumberFor(item) !== null && { borderColor: c.coral, borderWidth: 1.5 },
                  !matchesFilters(item) && { display: 'none' },
                ]}
                onTap={() => handleTapAssignFirstEmpty(item)}
                onDrop={(x, y) => handleDropAtPoint({ type: 'workout', workout: item }, x, y)}
              >
                <WorkoutCardVisual item={item} locked={false} showProBadge={!isPro} dayNumber={quickBuildDayNumberFor(item)} columns={columns} />
              </DraggableCard>
            ))}
            {filteredWorkoutItems.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>NO WORKOUTS MATCH THIS FILTER YET.</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.grid, columns === 2 && styles.gridTwoUp]}>
            {/* Every card stays mounted — a filter change only toggles
                `display` on the card's own root (not a wrapping View,
                which would break the 2-column grid's %-width children),
                it never adds/removes cards from the tree. Filtering the
                array instead unmounted cards that scroll back into view,
                forcing their cover image to load fresh each time, which
                is what read as "still reloading." */}
            {workoutItems.map((item) => (
              <WorkoutPhotoCard
                key={item.id}
                item={item}
                locked={false}
                showProBadge={!isPro}
                dayNumber={getDayNumber(item)}
                columns={columns}
                hidden={!matchesFilters(item)}
                onPress={() => openDetail(item)}
              />
            ))}
            {filteredWorkoutItems.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>NO WORKOUTS MATCH THIS FILTER YET.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {builderMode === 'browse' && selectedDayWorkouts.length > 0 && (
        <TouchableOpacity
          style={styles.buildCta}
          onPress={() => handlePressCreate('browse')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="calendar-check" size={16} color="#000" />
          <Text style={styles.buildCtaText}>CREATE MY WORKOUT ({selectedDayWorkouts.length})</Text>
        </TouchableOpacity>
      )}

      {builderMode === 'browse' ? (
        // Collapsed trigger — tapping it enters Quick Build and opens the
        // panel. Bumped up when buildCta is also showing (a Browse
        // selection in progress) so the two don't overlap; otherwise sits
        // directly above the tab bar.
        <TouchableOpacity
          style={[styles.quickBuildFab, selectedDayWorkouts.length > 0 && { bottom: TC_LAYOUT.bottomBarOffset + 62 }]}
          onPress={handleEnterQuickBuild}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="lightning-bolt" size={16} color="#000" />
          <Text style={styles.quickBuildFabText}>QUICK BUILD</Text>
        </TouchableOpacity>
      ) : quickBuildPanelOpen ? (
        <View style={styles.quickBuildPanel}>
          <View style={styles.quickBuildPanelHeader}>
            <Text style={styles.quickBuildPanelTitle}>QUICK BUILD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <TouchableOpacity onPress={() => setQuickBuildPanelOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="chevron-down" size={20} color={c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExitQuickBuild} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={20} color={c.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.quickBuildSectionLabel}>HOW MANY DAYS?</Text>
          <View style={{ height: 6 }} />
          <ChipRow
            options={DAY_COUNT_OPTIONS}
            selected={daySlots.length ? String(daySlots.length) : ''}
            onSelect={(v) => handleSelectDayCount(Number(v))}
          />

          {daySlots.length > 0 && (
            <>
              <View style={{ height: 12 }} />
              {/* Own scroll area, capped, so 6 slots + a warning banner can
                  never push the Create button off-screen on a smaller
                  device — header/day-count picker/Create stay pinned.
                  RNGH's ScrollView (not core RN's) for the same reason as
                  the main grid: filled slots are drag sources too, and a
                  plain ScrollView doesn't negotiate cleanly with RNGH's
                  separate gesture recognizer for that drag. */}
              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                <View style={styles.daySlotsRow}>
                  {daySlots.map((workout, i) => (
                    <DaySlotCard
                      key={i}
                      index={i}
                      workout={workout}
                      onLayoutRect={registerSlotRect}
                      onClear={() => clearSlot(i)}
                      onDrop={(x, y) => handleDropAtPoint({ type: 'slot', index: i }, x, y)}
                    />
                  ))}
                </View>
                {duplicateCategoryWarning && (
                  <View style={styles.quickBuildWarningBanner}>
                    <MaterialCommunityIcons name="alert-outline" size={14} color="#C8A040" />
                    <Text style={styles.quickBuildWarningText}>{duplicateCategoryWarning}</Text>
                  </View>
                )}
              </ScrollView>
              {allSlotsFilled && (
                <TouchableOpacity
                  style={styles.quickBuildCreateBtn}
                  onPress={() => handlePressCreate('quickBuild')}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="calendar-check" size={16} color="#000" />
                  <Text style={styles.buildCtaText}>CREATE PROGRAM ({daySlots.length})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      ) : (
        // Minimized while still in Quick Build mode — a compact status pill
        // so the panel doesn't block the grid while browsing/dragging.
        <TouchableOpacity style={styles.quickBuildFab} onPress={() => setQuickBuildPanelOpen(true)} activeOpacity={0.85}>
          <MaterialCommunityIcons name="lightning-bolt" size={16} color="#000" />
          <Text style={styles.quickBuildFabText}>
            {daySlots.length === 0 ? 'QUICK BUILD' : `${filledDaySlots.length}/${daySlots.length} DAYS`}
          </Text>
          <MaterialCommunityIcons name="chevron-up" size={16} color="#000" />
        </TouchableOpacity>
      )}

      <StandaloneWorkoutDetailModal
        visible={workoutDetail !== null || workoutDetailLoading}
        theme={StealthTheme.dark}
        detail={workoutDetail}
        loading={workoutDetailLoading}
        mode="select"
        isSelected={!!workoutDetail && getDayNumber(workoutDetail) !== null}
        nextDayNumber={selectedDayWorkouts.length + 1}
        onAdd={() => workoutDetail && addDay(workoutDetail)}
        onRemove={() => workoutDetail && removeDay(workoutDetail.id)}
        onClose={closeDetail}
        onStartWorkout={() => {}}
      />

      <BuildSummaryModal
        visible={buildSummaryVisible}
        theme={StealthTheme.dark}
        days={buildSummarySource === 'quickBuild' ? filledDaySlots : selectedDayWorkouts}
        switchWarning={
          currentProgramName
            ? `Starting this will mark "${currentProgramName}" as completed. Your logged workout history is kept.`
            : null
        }
        creating={creatingProgram}
        onRemove={(workoutId) => {
          if (buildSummarySource === 'quickBuild') {
            setDaySlots((prev) => prev.map((w) => (w?.id === workoutId ? null : w)));
          } else {
            removeDay(workoutId);
          }
        }}
        onAddAnother={() => setBuildSummaryVisible(false)}
        onStart={() => handleCreateCustomProgram(buildSummarySource === 'quickBuild' ? filledDaySlots : selectedDayWorkouts)}
        onClose={() => setBuildSummaryVisible(false)}
        onDismiss={handleModalDismissed}
      />

      <UpgradeToSaveModal
        visible={upgradeModalVisible}
        theme={StealthTheme.dark}
        title="START YOUR PROGRAM"
        body="Custom programs are a Pro and Max feature. Upgrade to start training with the days you just built — nothing is lost."
        cancelLabel="KEEP EDITING"
        pillLabel={`${buildSummarySource === 'quickBuild' ? daySlots.length : selectedDayWorkouts.length}-DAY PROGRAM BUILT`}
        upgrading={upgrading}
        onUpgrade={() => {
          if (upgradingRef.current) return;
          upgradingRef.current = true;
          setUpgrading(true);
          setUpgradeModalVisible(false);
          // Stash the build BEFORE navigating — a successful purchase routes
          // through PaywallScreen.goToProfile(), which dismisses this screen
          // entirely (see pendingProgramStorageKey's comment above), so this
          // is the only chance to save it. upgradingRef/upgrading are reset
          // in handlePressCreate the next time this modal is opened, not
          // here — the paywall route is about to push on top.
          persistPendingProgram(user?.id, buildSummarySource === 'quickBuild' ? filledDaySlots : selectedDayWorkouts);
          requestPaywallAfterModalCloses();
        }}
        onCancel={() => setUpgradeModalVisible(false)}
        onDismiss={handleModalDismissed}
      />

      <BottomTabBar activeTab="profile" strengthTier={profile?.strength_tier || 0} />

      {/* Last sibling in the tree on purpose — paints above the grid, the
          floating panel, and the tab bar, so a drag is always visible
          regardless of where on screen it crosses. */}
      <DragGhostOverlay
        payload={ghostPayload}
        x={ghostX} y={ghostY} width={ghostWidth} height={ghostHeight} active={ghostActive}
        daySlots={daySlots}
        isPro={isPro}
        columns={columns}
      />
    </View>
    </DragGhostContext.Provider>
  );
}

const getStyles = (c: TCPalette) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: TC_LAYOUT.screenPadding, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 17, letterSpacing: 1.6 },
  headerSubline: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 2, marginTop: 3 },

  emptyBox: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 24, alignItems: 'center', backgroundColor: c.cardFlat },
  emptyText: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center' },

  layoutToggle: { flexDirection: 'row', gap: 4, backgroundColor: c.cardFlat, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 10, padding: 3 },
  layoutToggleBtn: { width: 30, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  layoutToggleBtnActive: { backgroundColor: c.coral },

  // Floating trigger pill — sits directly above the tab bar by default.
  // buildCta only ever renders in Browse mode, so the one place this needs
  // to sit higher (avoid overlapping buildCta) is applied inline at the
  // call site, not baked in here — Quick Build's own minimized pill and
  // the expanded panel never coexist with buildCta at all.
  quickBuildFab: {
    position: 'absolute', alignSelf: 'center', bottom: TC_LAYOUT.bottomBarOffset,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: c.coral, borderRadius: 999, paddingHorizontal: 18, height: 44,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 10,
  },
  quickBuildFabText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.4 },

  // Expanded floating panel — buildCta never renders in Quick Build mode,
  // so this always sits directly above the tab bar, same anchor as the FAB.
  quickBuildPanel: {
    position: 'absolute', left: 16, right: 16, bottom: TC_LAYOUT.bottomBarOffset,
    backgroundColor: c.cardRaised, borderRadius: 20, borderWidth: 1, borderColor: c.borderStrong,
    padding: 16, maxHeight: '70%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.7, shadowRadius: 34, elevation: 12,
  },
  quickBuildPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  quickBuildPanelTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14, letterSpacing: 1.6 },
  quickBuildCreateBtn: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.coral, borderRadius: 14, height: 46,
  },
  quickBuildSectionLabel: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1.6 },

  // The single top-level drag ghost (see DragGhostContext/DragGhostOverlay)
  // — absolute + top:0/left:0 so its animated x/y translate directly in
  // screen-window coordinates, matching measureInWindow/absoluteX-Y used
  // for slot hit-testing everywhere else in this file.
  dragGhost: {
    position: 'absolute', top: 0, left: 0,
    borderRadius: 16, borderWidth: 1.5, borderColor: c.coral, overflow: 'hidden',
    backgroundColor: c.cardRaised,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20,
  },

  daySlotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  daySlotOuter: { width: '31%', aspectRatio: 1 },
  daySlotEmpty: {
    width: '31%', aspectRatio: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.borderStrong,
    backgroundColor: c.cardFlat, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  daySlotEmptyLabel: { color: c.textFaint2, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1 },
  daySlotFilled: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.coral },
  daySlotOverlay: { flex: 1, justifyContent: 'space-between', padding: 8, backgroundColor: 'rgba(0,0,0,0.28)' },
  daySlotTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  daySlotDayLabel: { color: '#fff', fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 1 },
  daySlotTitle: { color: '#fff', fontFamily: 'BarlowCondensed-Bold', fontSize: 11, lineHeight: 13 },
  daySlotCategoryBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  // Always light — badge sits on a photo/gradient day-slot card, not the page bg.
  daySlotCategoryBadgeText: { color: '#D4D4D4', fontFamily: 'BarlowCondensed-Bold', fontSize: 8, letterSpacing: 0.5 },

  quickBuildWarningBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12,
    backgroundColor: 'rgba(200,160,64,0.1)', borderWidth: 1, borderColor: 'rgba(200,160,64,0.35)', borderRadius: 10, padding: 10,
  },
  quickBuildWarningText: { flex: 1, color: '#C8A040', fontFamily: 'Barlow-Regular', fontSize: 12, lineHeight: 16 },

  grid: { marginTop: 16, gap: 14 },
  gridTwoUp: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, columnGap: 0 },
  cardWrap: { borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  cardWrapWide: { width: '100%', aspectRatio: 16 / 9 },
  cardWrapGrid: { width: '48%', aspectRatio: 3 / 4 },
  card: { flex: 1, justifyContent: 'space-between' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 10 },
  dayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.coral, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  dayBadgeText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 0.5 },
  lockBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  addBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5, borderColor: c.coral, alignItems: 'center', justifyContent: 'center',
  },
  topRightBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryBadge: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 140 },
  // Always light — badge sits on the workout's cover photo/gradient, not the page bg.
  categoryBadgeText: { color: '#D4D4D4', fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 0.5 },
  // Purely informational — Customize Program is browse-free, paywalled only
  // on Create, so this never blocks a card the way `lockBadge` does.
  proBadge: { backgroundColor: '#C9A227', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  proBadgeText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 0.8 },
  cardBottomGradient: { padding: 14, paddingTop: 32 },
  cardBottomGradientWide: { padding: 14, paddingTop: 32 },
  cardBottomGradientGrid: { padding: 10, paddingTop: 24 },
  // Always white — sits on the workout's cover photo/gradient, not the page bg.
  cardTitle: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold' },
  cardTitleWide: { fontSize: 17, lineHeight: 20 },
  cardTitleGrid: { fontSize: 13.5, lineHeight: 16 },
  cardMeta: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1.2, marginTop: 4 },
  cardMetaGrid: { fontSize: 9 },

  buildCta: {
    position: 'absolute', left: 16, right: 16, bottom: TC_LAYOUT.bottomBarOffset,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.coral, borderRadius: 16, height: 52,
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.7, shadowRadius: 34, elevation: 10,
  },
  buildCtaText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.6 },
});
