import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Animated, ImageBackground, StyleSheet, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { LeapLogo } from '../components/LeapLogo';
import { supabase } from '../lib/supabase';
import {
  getRecommendations,
  getAllPublishedTemplates,
  getTemplateDetails,
  selectLibraryTemplate,
  tierRangeToDifficultyBand,
  LibraryTemplateRecommendation,
  TemplateDetailBlock,
  DifficultyBand,
} from '../lib/templateLibrary';
import {
  getStandaloneWorkouts,
  getStandaloneWorkoutDetail,
  createCustomProgramFromWorkouts,
  StandaloneWorkoutSummary,
  StandaloneWorkoutDetail,
  Difficulty,
} from '../lib/workoutLibrary';
import { canAccessPro } from '../lib/entitlement';
import { useTutorialTarget } from '../hooks/useTutorialTarget';
import { QuickWorkoutTimerModal } from '../components/workoutLibrary/QuickWorkoutTimerModal';

const bronzeGold = '#C8A040';

// Cover photos for the program cards. An admin-uploaded cover_image_url
// (set from admin-web's Library tab → Criteria → Upload cover) always
// takes priority; anything without one falls back to real athlete
// photography keyed by tier range, then the generic fallbacks, so every
// card is always image-first, never blank.
function getCardImage(rec: LibraryTemplateRecommendation, index: number) {
  if (rec.cover_image_url) return { uri: rec.cover_image_url };
  if (rec.tier_range.min === 4 && rec.tier_range.max === 5) return require('../../assets/backpose.png');
  if (rec.tier_range.min === 5 && rec.tier_range.max === 6) return require('../../assets/backmuscle.png');
  if (rec.tier_range.min === 2 && rec.tier_range.max === 3) return require('../../assets/parallet.png');
  if (rec.tier_range.min === 3 && rec.tier_range.max === 4) return require('../../assets/pushup.png');
  if (rec.tier_range.min === 7 && rec.tier_range.max === 9) return require('../../assets/Fronttouch.png');
  if (rec.tier_range.min === 6 && rec.tier_range.max === 7) return require('../../assets/Frontpose.png');
  return index % 2 === 0
    ? require('../../assets/programs/fallback-1.jpg')
    : require('../../assets/programs/fallback-2.jpg');
}

type Tab = 'all' | 'programs' | 'workout' | 'quick_workout';
const VALID_TABS: Tab[] = ['all', 'programs', 'workout', 'quick_workout'];
// Mirrors create_custom_program_from_workouts' own server-side cap.
const MAX_CUSTOM_PROGRAM_DAYS = 7;
const DIFFICULTY_OPTIONS: (DifficultyBand | 'all')[] = ['all', 'beginner', 'intermediate', 'advanced'];
const QUICK_FORMAT_OPTIONS = ['all', 'amrap', 'emom', 'fortime', 'tabata'] as const;

// Flat gradient tile style (Workouts/Quick Workouts, and the merged "All"
// grid) — Programs keep their existing photo-hero treatment, just resized.
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

// Legacy hardcoded fallback for the one cover photo added before admin
// authoring existed — new content should use the admin-web-uploaded
// cover_image_url instead (see WorkoutLibraryPage.tsx's Upload cover
// button), which takes priority whenever it's set. Anything with neither
// keeps the flat category-gradient tile (GradientWorkoutCard's original,
// still-default look).
const STANDALONE_WORKOUT_IMAGES: Record<string, any> = {
  '10000000-0000-0000-0000-000000000002': require('../../assets/workouts/push-power-circuit.png'), // Push Power Circuit
};
function getStandaloneWorkoutImage(item: StandaloneWorkoutSummary) {
  if (item.cover_image_url) return { uri: item.cover_image_url };
  return STANDALONE_WORKOUT_IMAGES[item.id] ?? null;
}

// Discriminated item for the merged "All" tab — Programs and Standalone
// Workouts render with different card components and tap handlers, but
// need to sit in one combined grid.
type LibraryItem =
  | { kind: 'program'; data: LibraryTemplateRecommendation; index: number }
  | { kind: 'standalone'; data: StandaloneWorkoutSummary };

interface Props {
  onClose?: () => void;
  // Training Center hub tiles land here on a specific tab (Templates /
  // Customize / Quick Workout) instead of always opening on "All" — falls
  // back to 'all' for anything not in the real Tab union.
  initialTab?: string;
}

export function WorkoutLibraryScreen({ onClose, initialTab }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const { user, profile, paywallEnabled } = useAuth();
  const isPro = canAccessPro(profile, paywallEnabled);

  const [activeTab, setActiveTab] = useState<Tab>(
    VALID_TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'all'
  );

  const [recommendations, setRecommendations] = useState<LibraryTemplateRecommendation[]>([]);
  const [allTemplates, setAllTemplates] = useState<LibraryTemplateRecommendation[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [currentProgramName, setCurrentProgramName] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyBand | 'all'>('all');

  // Preview/confirm modal — shown when a program card is tapped, before
  // anything is actually started. previewRec is the program awaiting
  // confirmation; previewWeek1 is its first-week structure, fetched lazily
  // per tap rather than upfront for every card.
  const [previewRec, setPreviewRec] = useState<LibraryTemplateRecommendation | null>(null);
  const [previewWeek1, setPreviewWeek1] = useState<TemplateDetailBlock[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [workoutItems, setWorkoutItems] = useState<StandaloneWorkoutSummary[]>([]);
  const [quickWorkoutItems, setQuickWorkoutItems] = useState<StandaloneWorkoutSummary[]>([]);
  const [standaloneLoading, setStandaloneLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [workoutDetail, setWorkoutDetail] = useState<StandaloneWorkoutDetail | null>(null);
  const [workoutDetailLoading, setWorkoutDetailLoading] = useState(false);
  // Bumped on every open/close so a fetch that's still in flight when the
  // user closes the modal can't repopulate it once it resolves — without
  // this, tapping CLOSE while loading only cleared workoutDetail, but
  // visible is also driven by workoutDetailLoading, which the in-flight
  // request's own finally block would flip back to true->false on its own
  // schedule, reopening (or never actually dismissing) the modal.
  const workoutDetailRequestId = useRef(0);

  // Quick Workout live-timer modal — only ever opened with an already-
  // fetched workoutDetail (kind='quick_workout'), same data the preview
  // modal is already showing.
  const [quickWorkoutTimerVisible, setQuickWorkoutTimerVisible] = useState(false);

  // "Build your week" day-picker state — Workouts tab only. Each selected
  // workout is one training day, in selection order; cleared on unmount
  // (no persistence needed, same lifetime as previewRec/workoutDetail).
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<StandaloneWorkoutSummary[]>([]);
  const [buildSummaryVisible, setBuildSummaryVisible] = useState(false);
  const [creatingProgram, setCreatingProgram] = useState(false);

  useEffect(() => {
    loadTemplates();
    checkExistingProgram();
  }, [profile?.strength_tier, user?.id]);

  // Both kinds are needed simultaneously for the merged "All" tab, so both
  // are always fetched together on any filter change rather than only
  // fetching whichever single tab is active.
  useEffect(() => {
    loadStandaloneWorkouts();
  }, [categoryFilter, difficultyFilter, formatFilter]);

  async function loadTemplates() {
    setTemplatesLoading(true);
    setErrorMsg(null);
    try {
      const tier = profile ? profile.strength_tier : 0;
      const [recs, all] = await Promise.all([
        getRecommendations(tier, 'strength'),
        getAllPublishedTemplates(),
      ]);
      setRecommendations(recs);
      setAllTemplates(all);
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD PROGRAMS.');
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function loadStandaloneWorkouts() {
    setStandaloneLoading(true);
    const baseFilters = {
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      difficulty: difficultyFilter === 'all' ? undefined : (difficultyFilter as Difficulty),
    };
    try {
      const [workouts, quickWorkouts] = await Promise.all([
        getStandaloneWorkouts('workout', baseFilters),
        getStandaloneWorkouts('quick_workout', {
          ...baseFilters,
          format: formatFilter === 'all' ? undefined : (formatFilter as any),
        }),
      ]);
      setWorkoutItems(workouts);
      setQuickWorkoutItems(quickWorkouts);
    } catch (err) {
      console.error('loadStandaloneWorkouts failed:', err);
      setWorkoutItems([]);
      setQuickWorkoutItems([]);
    } finally {
      setStandaloneLoading(false);
    }
  }

  // Lets the confirmation prompt name what's about to be replaced. Absence
  // of a row here (not just an error) is what tells handleSelect it's safe
  // to skip the confirmation entirely for a first-time selection.
  async function checkExistingProgram() {
    if (!user?.id) return;
    const { data } = await supabase
      .from('warrior_programs')
      .select('program_templates:template_id (name)')
      .eq('warrior_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    const templateInfo: any = data?.program_templates;
    const name = Array.isArray(templateInfo) ? templateInfo[0]?.name : templateInfo?.name;
    setCurrentProgramName(name || (data ? 'YOUR CURRENT PROGRAM' : null));
  }

  // Tapping a card opens the preview/confirm modal instead of starting
  // anything immediately — the actual selectLibraryTemplate call only runs
  // from handleConfirmStart, once the user explicitly confirms. Locked
  // (Pro-only) cards never reach this — they route straight to the paywall.
  const openPreview = async (rec: LibraryTemplateRecommendation) => {
    setPreviewRec(rec);
    setPreviewWeek1([]);
    setPreviewLoading(true);
    try {
      const weeks = await getTemplateDetails(rec.id);
      const week1 = weeks.find(w => w.weekNumber === 1);
      setPreviewWeek1(week1?.blocks || []);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (selectingId) return; // don't let a dismiss race an in-flight start
    setPreviewRec(null);
    setPreviewWeek1([]);
  };

  // Only the single best-matched recommendation for this user's tier is
  // free to try — every other program template, wherever it's shown
  // (lower-ranked Recommended picks, Browse All, the merged All tab), is
  // Pro-only. This replaces the is_free-column-driven gating for Programs
  // specifically: the "free demo" is which template best fits you right
  // now, not a fixed set of templates an admin flagged in advance.
  //
  // isProItem vs. locked are deliberately separate: isProItem is a content
  // label (does this template belong to the Pro tier at all?) shown to
  // EVERY viewer, Pro or not — a Pro subscriber should still see which
  // templates their subscription is unlocking. locked is viewer-specific
  // (isProItem AND this viewer lacks access) and drives the actual
  // dimmed/lock-overlay treatment and the tap-to-paywall behavior.
  const topPickId = recommendations[0]?.id ?? null;
  const isProItem = (rec: LibraryTemplateRecommendation) => rec.id !== topPickId;
  const isProgramLocked = (rec: LibraryTemplateRecommendation) => isProItem(rec) && !isPro;

  const handleCardPress = (rec: LibraryTemplateRecommendation) => {
    if (isProgramLocked(rec)) {
      router.push('/paywall');
      return;
    }
    openPreview(rec);
  };

  const startProgram = async (rec: LibraryTemplateRecommendation) => {
    setSelectingId(rec.id);
    try {
      await selectLibraryTemplate(rec.id);
      setPreviewRec(null);
      setPreviewWeek1([]);
      setSelectedDayWorkouts([]);
      // Closing this Modal and replacing the whole screen were landing in the
      // same commit — the Modal's native view tears down at the exact moment
      // the navigator mounts the next screen, which is the live-reproduced
      // crash: "ReactClippingViewManager.addView / the specified child
      // already has a parent". Deferring one frame lets the Modal's unmount
      // finish before the navigation transition starts its own mount.
      //
      // Straight into the workout — not back to wherever this screen was
      // opened from (usually Profile). replace (not push) so the back
      // stack doesn't leave this recommendations screen sitting behind it.
      requestAnimationFrame(() => {
        router.replace('/warrior-program');
      });
    } catch (err: any) {
      Alert.alert('SELECTION FAILED', err.message?.toUpperCase() || 'FAILED TO START THIS PROGRAM.');
    } finally {
      setSelectingId(null);
    }
  };

  const handleConfirmStart = async () => {
    if (!previewRec) return;
    const rec = previewRec;

    // Starting a full pre-built Program replaces the active program
    // outright — it has nothing to do with the Workouts-tab day-picker, so
    // any in-progress custom-day selection would otherwise just vanish
    // silently once this navigates away. Confirm before throwing it out.
    if (selectedDayWorkouts.length > 0) {
      const n = selectedDayWorkouts.length;
      Alert.alert(
        'DISCARD YOUR CUSTOM DAYS?',
        `YOU HAVE ${n} DAY${n === 1 ? '' : 'S'} PICKED FOR A CUSTOM PROGRAM. STARTING "${rec.template_name.toUpperCase()}" WILL DISCARD ${n === 1 ? 'IT' : 'THEM'}.`,
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'START ANYWAY', style: 'destructive', onPress: () => startProgram(rec) },
        ]
      );
      return;
    }

    await startProgram(rec);
  };

  const openStandaloneDetail = async (item: StandaloneWorkoutSummary) => {
    if (!item.is_free && !isPro) {
      router.push('/paywall');
      return;
    }
    const requestId = ++workoutDetailRequestId.current;
    setWorkoutDetailLoading(true);
    try {
      const detail = await getStandaloneWorkoutDetail(item.id);
      if (workoutDetailRequestId.current !== requestId) return; // closed (or superseded) while in flight
      if (!detail) {
        Alert.alert('NOT AVAILABLE', 'THAT WORKOUT COULD NOT BE FOUND — IT MAY HAVE BEEN REMOVED.');
        return;
      }
      setWorkoutDetail(detail);
    } catch (err: any) {
      // Found live: this had no catch at all — a failed fetch (network
      // blip, anything) reset workoutDetailLoading back to false in the
      // finally block below with nothing ever shown, which reads as the
      // card tap having done literally nothing.
      console.error('openStandaloneDetail failed:', err);
      if (workoutDetailRequestId.current === requestId) {
        Alert.alert('COULD NOT LOAD WORKOUT', (err?.message || 'SOMETHING WENT WRONG.').toUpperCase());
      }
    } finally {
      if (workoutDetailRequestId.current === requestId) setWorkoutDetailLoading(false);
    }
  };

  const closeStandaloneDetail = () => {
    workoutDetailRequestId.current += 1; // invalidate any in-flight fetch
    setWorkoutDetail(null);
    setWorkoutDetailLoading(false);
  };

  // 1-indexed day number for a workout already in the build, or null if
  // it hasn't been picked yet — drives both the grid badge and the detail
  // modal's ADD/REMOVE footer.
  const getDayNumber = (item: { id: string }): number | null => {
    const idx = selectedDayWorkouts.findIndex((w) => w.id === item.id);
    return idx === -1 ? null : idx + 1;
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

  const handleCreateCustomProgram = async () => {
    if (selectedDayWorkouts.length === 0) return;
    setCreatingProgram(true);
    try {
      await createCustomProgramFromWorkouts(selectedDayWorkouts.map((w) => w.id));
      setBuildSummaryVisible(false);
      setSelectedDayWorkouts([]);
      // Same deferred-navigation pattern as handleConfirmStart — see its
      // comment for why the extra frame matters (Modal-teardown vs.
      // navigator-mount race).
      requestAnimationFrame(() => {
        router.replace('/warrior-program');
      });
    } catch (err: any) {
      Alert.alert('COULD NOT CREATE PROGRAM', err.message?.toUpperCase() || 'SOMETHING WENT WRONG.');
    } finally {
      setCreatingProgram(false);
    }
  };

  // useScreenMeasure=true: this button sits in the header, outside the
  // screen's ScrollView — see useTutorialTarget's own comment for why that
  // needs the pageX/pageY measurement path on Android.
  const { ref: backButtonRef, onLayout: onBackButtonLayout, reportInteraction: reportBackButton } = useTutorialTarget('templates.backButton', undefined, true);

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const headerBar = (
    <View style={styles.headerBar}>
      <TouchableOpacity
        ref={backButtonRef}
        onLayout={onBackButtonLayout}
        onPress={() => {
          handleClose();
          reportBackButton();
        }}
        style={styles.backBtn}
      >
        <MaterialCommunityIcons name="chevron-left" size={30} color={bronzeGold} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[styles.title, { color: theme.text.primary }]}>WORKOUT LIBRARY</Text>
        <Text style={[styles.subtitle, { color: bronzeGold }]}>PROGRAMS · WORKOUTS · QUICK WORKOUTS</Text>
      </View>
      <View style={{ width: 44 }} />
    </View>
  );

  const TAB_LABELS: Record<Tab, string> = {
    all: 'ALL',
    programs: 'PROGRAMS',
    workout: 'WORKOUTS',
    quick_workout: 'QUICK WORKOUTS',
  };

  const tabBar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabBarScroll}
      contentContainerStyle={styles.tabBar}
    >
      {(['all', 'programs', 'workout', 'quick_workout'] as Tab[]).map((tab) => (
        <TouchableOpacity
          key={tab}
          onPress={() => setActiveTab(tab)}
          style={[
            styles.tabPill,
            { backgroundColor: activeTab === tab ? bronzeGold : theme.card.background, borderColor: theme.card.border },
          ]}
        >
          <Text style={[styles.tabPillText, { color: activeTab === tab ? '#000' : theme.text.secondary }]}>
            {TAB_LABELS[tab]}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const filteredAllTemplates = allTemplates.filter(
    (t) => difficultyFilter === 'all' || tierRangeToDifficultyBand(t.tier_range) === difficultyFilter
  );

  const isLoading = (activeTab === 'programs' || activeTab === 'all') && templatesLoading;

  // Unified item list for the "All" tab — Programs (browse-all, not the
  // separate tier-matched "Recommended" section, which is Program-tab-only
  // onboarding logic) plus both standalone kinds, merged into one grid.
  const allItems: LibraryItem[] = activeTab === 'all'
    ? [
        ...filteredAllTemplates.map((data, index): LibraryItem => ({ kind: 'program', data, index })),
        ...workoutItems.map((data): LibraryItem => ({ kind: 'standalone', data })),
        ...quickWorkoutItems.map((data): LibraryItem => ({ kind: 'standalone', data })),
      ]
    : [];

  const renderLibraryItem = (item: LibraryItem, key: string) => {
    if (item.kind === 'program') {
      const rec = item.data;
      return (
        <ProgramCard
          key={key}
          rec={rec}
          isFirst={false}
          isCurrent={!!currentProgramName && rec.template_name === currentProgramName}
          imageSource={getCardImage(rec, item.index)}
          isSelecting={selectingId === rec.id}
          disabled={selectingId !== null}
          isProItem={isProItem(rec)}
          locked={isProgramLocked(rec)}
          onSelect={() => handleCardPress(rec)}
        />
      );
    }
    return (
      <GradientWorkoutCard
        key={key}
        item={item.data}
        isProItem={!item.data.is_free}
        locked={!item.data.is_free && !isPro}
        onPress={() => openStandaloneDetail(item.data)}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {headerBar}
      {tabBar}

      {isLoading ? (
        <View style={styles.centerContainer}>
          <LeapLogo size={40} animated />
          <Text style={[styles.loadingText, { color: theme.text.secondary }]}>LOADING THE LIBRARY...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {currentProgramName && (activeTab === 'programs' || activeTab === 'all') && (
            <View style={[styles.currentProgramBanner, { borderColor: theme.card.border }]}>
              <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5 }}>
                CURRENTLY ACTIVE: <Text style={{ color: bronzeGold }}>{currentProgramName.toUpperCase()}</Text> — SELECTING A NEW PROGRAM WILL SWITCH YOU OVER
              </Text>
            </View>
          )}

          {errorMsg && (activeTab === 'programs' || activeTab === 'all') && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {activeTab === 'all' && (
            <>
              <FilterChipRow
                theme={theme}
                options={DIFFICULTY_OPTIONS}
                selected={difficultyFilter}
                onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')}
              />
              {allItems.length === 0 ? (
                <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
                  <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center' }}>
                    NOTHING MATCHES THIS FILTER YET.
                  </Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {allItems.map((item, i) =>
                    renderLibraryItem(item, item.kind === 'program' ? item.data.id : item.data.id + String(i))
                  )}
                </View>
              )}
            </>
          )}

          {activeTab === 'programs' && (
            <>
              {recommendations.length > 0 && (
                <>
                  <SectionLabel theme={theme} text="RECOMMENDED FOR YOU" />
                  <View style={styles.grid}>
                    {recommendations.map((rec, index) => (
                      <ProgramCard
                        key={rec.id}
                        rec={rec}
                        isFirst={index === 0}
                        isCurrent={!!currentProgramName && rec.template_name === currentProgramName}
                        imageSource={getCardImage(rec, index)}
                        isSelecting={selectingId === rec.id}
                        disabled={selectingId !== null}
                        isProItem={isProItem(rec)}
          locked={isProgramLocked(rec)}
                        onSelect={() => handleCardPress(rec)}
                      />
                    ))}
                  </View>
                </>
              )}

              <SectionLabel theme={theme} text="BROWSE ALL PROGRAMS" />
              <FilterChipRow
                theme={theme}
                options={DIFFICULTY_OPTIONS}
                selected={difficultyFilter}
                onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')}
              />

              {!errorMsg && filteredAllTemplates.length === 0 ? (
                <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
                  <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center' }}>
                    NO PROGRAMS MATCH THIS FILTER YET.
                  </Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {filteredAllTemplates.map((rec, index) => (
                    <ProgramCard
                      key={rec.id}
                      rec={rec}
                      isFirst={false}
                      isCurrent={!!currentProgramName && rec.template_name === currentProgramName}
                      imageSource={getCardImage(rec, index)}
                      isSelecting={selectingId === rec.id}
                      disabled={selectingId !== null}
                      isProItem={isProItem(rec)}
          locked={isProgramLocked(rec)}
                      onSelect={() => handleCardPress(rec)}
                    />
                  ))}
                </View>
              )}
            </>
          )}

          {(activeTab === 'workout' || activeTab === 'quick_workout') && (
            <>
              <FilterChipRow
                theme={theme}
                options={['all', 'PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY']}
                selected={categoryFilter}
                onSelect={setCategoryFilter}
              />
              <FilterChipRow
                theme={theme}
                options={DIFFICULTY_OPTIONS}
                selected={difficultyFilter}
                onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')}
              />
              {activeTab === 'quick_workout' && (
                <FilterChipRow
                  theme={theme}
                  options={[...QUICK_FORMAT_OPTIONS]}
                  selected={formatFilter}
                  onSelect={setFormatFilter}
                />
              )}

              {standaloneLoading ? (
                <View style={styles.centerContainer}>
                  <LeapLogo size={40} animated />
                </View>
              ) : (activeTab === 'workout' ? workoutItems : quickWorkoutItems).length === 0 ? (
                <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
                  <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center' }}>
                    NO {activeTab === 'workout' ? 'WORKOUTS' : 'QUICK WORKOUTS'} MATCH THIS FILTER YET.
                  </Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {(activeTab === 'workout' ? workoutItems : quickWorkoutItems).map((item) => (
                    <GradientWorkoutCard
                      key={item.id}
                      item={item}
                      isProItem={!item.is_free}
                      locked={!item.is_free && !isPro}
                      selectedDayNumber={activeTab === 'workout' ? getDayNumber(item) : null}
                      onPress={() => openStandaloneDetail(item)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <ProgramPreviewModal
        visible={previewRec !== null}
        theme={theme}
        templateName={previewRec?.template_name || ''}
        weekCount={previewRec?.week_count || 1}
        week1={previewWeek1}
        loading={previewLoading}
        starting={!!previewRec && selectingId === previewRec.id}
        switchWarning={
          currentProgramName
            ? `Switching will mark "${currentProgramName}" as completed. Your logged workout history is kept.`
            : null
        }
        onCancel={closePreview}
        onConfirm={handleConfirmStart}
      />

      <StandaloneWorkoutDetailModal
        visible={(workoutDetail !== null || workoutDetailLoading) && !quickWorkoutTimerVisible}
        theme={theme}
        detail={workoutDetail}
        loading={workoutDetailLoading}
        mode={activeTab === 'workout' ? 'select' : 'browse'}
        isSelected={!!workoutDetail && getDayNumber(workoutDetail) !== null}
        nextDayNumber={selectedDayWorkouts.length + 1}
        onAdd={() => workoutDetail && addDay(workoutDetail)}
        onRemove={() => workoutDetail && removeDay(workoutDetail.id)}
        onClose={closeStandaloneDetail}
        onStartWorkout={() => setQuickWorkoutTimerVisible(true)}
      />

      <QuickWorkoutTimerModal
        visible={quickWorkoutTimerVisible}
        workout={workoutDetail}
        theme={theme}
        onClose={() => {
          setQuickWorkoutTimerVisible(false);
          closeStandaloneDetail();
        }}
      />

      {activeTab === 'workout' && selectedDayWorkouts.length > 0 && (
        <TouchableOpacity
          style={styles.buildCta}
          onPress={() => setBuildSummaryVisible(true)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="calendar-check" size={16} color="#000" />
          <Text style={styles.buildCtaText}>CREATE MY WORKOUT ({selectedDayWorkouts.length})</Text>
        </TouchableOpacity>
      )}

      <BuildSummaryModal
        visible={buildSummaryVisible}
        theme={theme}
        days={selectedDayWorkouts}
        switchWarning={
          currentProgramName
            ? `Starting this will mark "${currentProgramName}" as completed. Your logged workout history is kept.`
            : null
        }
        creating={creatingProgram}
        onRemove={removeDay}
        onAddAnother={() => setBuildSummaryVisible(false)}
        onStart={handleCreateCustomProgram}
        onClose={() => setBuildSummaryVisible(false)}
      />
    </View>
  );
}

function SectionLabel({ theme, text }: { theme: any; text: string }) {
  return <Text style={[styles.sectionLabel, { color: theme.text.tertiary }]}>{text}</Text>;
}

function FilterChipRow({
  theme,
  options,
  selected,
  onSelect,
}: {
  theme: any;
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ gap: 8 }}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          onPress={() => onSelect(opt)}
          style={[
            styles.filterChip,
            {
              backgroundColor: selected === opt ? bronzeGold : 'transparent',
              borderColor: selected === opt ? bronzeGold : theme.card.border,
            },
          ]}
        >
          <Text style={[styles.filterChipText, { color: selected === opt ? '#000' : theme.text.secondary }]}>
            {opt.toUpperCase().replace('_', ' ')}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// Flat gradient tile, 3-per-row grid item. Category-colored gradient, a
// dark category badge top-left, a small "L" mark top-right, and a bold
// title bottom-left over a short accent underline — no cover photos exist
// for this content type, so this is a distinct (deliberately simpler)
// visual language from ProgramCard's photo-hero treatment.
function GradientWorkoutCard({
  item,
  isProItem,
  locked,
  selectedDayNumber = null,
  onPress,
}: {
  item: StandaloneWorkoutSummary;
  isProItem: boolean;
  locked: boolean;
  selectedDayNumber?: number | null;
  onPress: () => void;
}) {
  const [colorStart, colorEnd] = categoryGradient(item.category);
  const coverImage = getStandaloneWorkoutImage(item);
  const isSelected = selectedDayNumber !== null;

  const overlayContent = (
    <>
      {locked && <View style={styles.lockOverlay} pointerEvents="none" />}
      {/* Content label, same as ProgramCard's proCorner — always shown for
          Pro-tier items regardless of the viewer's own access; `locked`
          (not `isProItem`) drives the dark overlay above. */}
      {isProItem && (
        <View style={styles.proCorner}>
          <MaterialCommunityIcons name="crown" size={7} color="#FFFFFF" />
          <Text style={styles.proCornerText}>PRO</Text>
        </View>
      )}
      {isSelected && <View style={styles.selectedBorder} pointerEvents="none" />}
      <View style={styles.gradientCardTop}>
        {isSelected ? (
          <View style={styles.dayBadge}>
            <MaterialCommunityIcons name="check-circle" size={10} color="#FFFFFF" />
            <Text style={styles.dayBadgeText}>DAY {selectedDayNumber}</Text>
          </View>
        ) : locked ? (
          <View style={styles.gradientLogoBadge}>
            <MaterialCommunityIcons name="lock" size={12} color="#FFFFFF" />
          </View>
        ) : (
          <View style={styles.gradientLogoBadge}>
            <Text style={styles.gradientLogoBadgeText}>L</Text>
          </View>
        )}
        {/* Moved to the right — the PRO ribbon (proCorner, absolutely
            positioned top-left) was overlapping this badge when it sat on
            the left side of this row. */}
        <View style={styles.gradientCategoryBadge}>
          <Text style={styles.gradientCategoryBadgeText} numberOfLines={1}>
            {(item.category ?? (item.kind === 'quick_workout' ? item.format?.toUpperCase() : 'WORKOUT') ?? 'WORKOUT').replace('_', ' ')}
          </Text>
        </View>
      </View>
      <View style={styles.gradientCardBottom}>
        <View style={styles.gradientCardAccent} />
        <Text style={styles.gradientCardTitle} numberOfLines={1}>{item.title.toUpperCase()}</Text>
        {item.format && item.duration_minutes && (
          <Text style={styles.gradientCardSubtitle} numberOfLines={1}>{item.format.toUpperCase()} · {item.duration_minutes} MIN</Text>
        )}
      </View>
    </>
  );

  if (coverImage) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.gridCardWrap} activeOpacity={0.85}>
        <ImageBackground source={coverImage} style={styles.gradientCard} imageStyle={styles.cardImageInner}>
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.85)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {overlayContent}
        </ImageBackground>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} style={styles.gridCardWrap} activeOpacity={0.85}>
      <LinearGradient colors={[colorStart, colorEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientCard}>
        {overlayContent}
      </LinearGradient>
    </TouchableOpacity>
  );
}

function StandaloneWorkoutDetailModal({
  visible,
  theme,
  detail,
  loading,
  mode,
  isSelected,
  nextDayNumber,
  onAdd,
  onRemove,
  onClose,
  onStartWorkout,
}: {
  visible: boolean;
  theme: any;
  detail: StandaloneWorkoutDetail | null;
  loading: boolean;
  mode: 'browse' | 'select';
  isSelected: boolean;
  nextDayNumber: number;
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
  onStartWorkout: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          {loading || !detail ? (
            <View style={previewStyles.loadingBox}>
              <LeapLogo size={32} animated />
            </View>
          ) : (
            <>
              <View style={previewStyles.header}>
                <Text style={[previewStyles.title, { color: theme.text.primary }]} numberOfLines={2}>{detail.title.toUpperCase()}</Text>
                {detail.format && detail.duration_minutes && (
                  <Text style={previewStyles.subtitle}>{detail.format.toUpperCase()} · {detail.duration_minutes} MIN CAP</Text>
                )}
              </View>
              {detail.description && (
                <Text style={{ color: theme.text.secondary, fontFamily: 'Barlow-Regular', fontSize: 13, marginBottom: 12 }}>
                  {detail.description}
                </Text>
              )}
              <ScrollView style={previewStyles.body}>
                {detail.blocks.map((block) => (
                  <View key={block.id} style={{ marginBottom: 14 }}>
                    <Text style={[styles.sectionLabel, { color: bronzeGold, marginTop: 0, marginBottom: 8 }]}>
                      {block.name.toUpperCase()}
                    </Text>
                    {block.exercises.map((ex) => (
                      <View key={ex.exercise_id + String(ex.order_index)} style={[previewStyles.dayRow, { borderColor: theme.card.border }]}>
                        <Text style={[previewStyles.dayRowText, { color: theme.text.primary }]}>{ex.name}</Text>
                        <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, marginTop: 2 }}>
                          {ex.sets && ex.reps ? `${ex.sets} × ${ex.reps}` : ex.work_seconds ? `${ex.work_seconds}S WORK` : ex.hold_seconds ? `${ex.hold_seconds}S HOLD` : ''}
                          {ex.rest_seconds ? ` · ${ex.rest_seconds}S REST` : ''}
                          {ex.is_weighted ? ' · WEIGHTED' : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </>
          )}
          {mode === 'select' ? (
            <View style={[previewStyles.actions, { marginTop: 12 }]}>
              <TouchableOpacity style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]} onPress={onClose}>
                <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CANCEL</Text>
              </TouchableOpacity>
              {isSelected ? (
                <TouchableOpacity style={previewStyles.removeBtn} onPress={onRemove}>
                  <MaterialCommunityIcons name="close-circle-outline" size={16} color="#FF6B6B" />
                  <Text style={previewStyles.removeBtnText}>REMOVE FROM PROGRAM</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={previewStyles.startBtn} onPress={onAdd}>
                  <Text style={previewStyles.startBtnText}>ADD AS DAY {nextDayNumber}</Text>
                  <MaterialCommunityIcons name="plus" size={16} color="#000" />
                </TouchableOpacity>
              )}
            </View>
          ) : detail?.kind === 'quick_workout' ? (
            <View style={[previewStyles.actions, { marginTop: 12 }]}>
              <TouchableOpacity style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]} onPress={onClose}>
                <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CLOSE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={previewStyles.startBtn} onPress={onStartWorkout}>
                <Text style={previewStyles.startBtnText}>START WORKOUT</Text>
                <MaterialCommunityIcons name="play" size={16} color="#000" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[previewStyles.cancelBtn, { borderColor: theme.card.border, marginTop: 12 }]} onPress={onClose}>
              <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CLOSE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Reviews the day-picker's current selection before committing — matches
// ProgramPreviewModal's card/overlay chrome (reuses previewStyles) since
// this is the same "confirm before you write anything" moment, just for a
// caller-assembled program instead of a pre-authored one.
function BuildSummaryModal({
  visible,
  theme,
  days,
  switchWarning,
  creating,
  onRemove,
  onAddAnother,
  onStart,
  onClose,
}: {
  visible: boolean;
  theme: any;
  days: StandaloneWorkoutSummary[];
  switchWarning: string | null;
  creating: boolean;
  onRemove: (workoutId: string) => void;
  onAddAnother: () => void;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          <View style={previewStyles.header}>
            <Text style={[previewStyles.title, { color: theme.text.primary }]}>YOUR CUSTOM WEEK</Text>
            <Text style={previewStyles.subtitle}>
              {days.length} DAY{days.length === 1 ? '' : 'S'} SELECTED
            </Text>
          </View>

          {switchWarning && (
            <View style={previewStyles.warningBanner}>
              <MaterialCommunityIcons name="alert-outline" size={14} color={bronzeGold} />
              <Text style={previewStyles.warningText}>{switchWarning}</Text>
            </View>
          )}

          <ScrollView style={previewStyles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {days.length === 0 ? (
              <Text style={[previewStyles.emptyText, { color: theme.text.tertiary }]}>
                NO DAYS SELECTED YET.
              </Text>
            ) : (
              days.map((d, i) => (
                <View
                  key={d.id + String(i)}
                  style={[previewStyles.dayRow, { borderColor: theme.card.border, justifyContent: 'space-between' }]}
                >
                  <Text style={[previewStyles.dayRowText, { color: theme.text.primary, flex: 1 }]} numberOfLines={1}>
                    DAY {i + 1} — {d.title.toUpperCase()}
                  </Text>
                  <TouchableOpacity onPress={() => onRemove(d.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={18} color={theme.text.tertiary} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          <View style={previewStyles.actions}>
            <TouchableOpacity
              style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]}
              onPress={onAddAnother}
              disabled={creating}
            >
              <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>ADD ANOTHER DAY</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[previewStyles.startBtn, { opacity: creating || days.length === 0 ? 0.7 : 1 }]}
              onPress={onStart}
              disabled={creating || days.length === 0}
            >
              {creating ? (
                <LeapLogo size={22} animated />
              ) : (
                <>
                  <Text style={previewStyles.startBtnText}>START MY PROGRAM</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#000" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Library template days are authored as "{FOCUS} DAY {N} | {Section}" (e.g.
// "PUSH DAY 1 | Strength - 1", "FULL BODY DAY 3 | Warm-Up") — getTemplateDetails
// already splits off the "| Section" part into blockName, so block.day here is
// "PUSH DAY 1" etc. This pulls the day number and focus back out of that so the
// preview can show just "DAY 1 — PUSH" once per day, not once per section.
function parseDayLabel(day: string): { dayNumber: number; focus: string } | null {
  const match = day.match(/^(.*?)\s*DAY\s*(\d+)\s*$/i);
  if (!match) return null;
  return { focus: match[1].trim(), dayNumber: parseInt(match[2], 10) };
}

function summarizeWeek1Days(week1: TemplateDetailBlock[]): { key: string; label: string; sortOrder: number }[] {
  const seen = new Map<string, { label: string; sortOrder: number }>();
  week1.forEach((block, i) => {
    if (seen.has(block.day)) return;
    const parsed = parseDayLabel(block.day);
    const label = parsed ? `DAY ${parsed.dayNumber} — ${parsed.focus.toUpperCase()}` : block.day.toUpperCase();
    seen.set(block.day, { label, sortOrder: parsed?.dayNumber ?? i });
  });
  return Array.from(seen.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function ProgramPreviewModal({
  visible,
  theme,
  templateName,
  weekCount,
  week1,
  loading,
  starting,
  switchWarning,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  theme: any;
  templateName: string;
  weekCount: number;
  week1: TemplateDetailBlock[];
  loading: boolean;
  starting: boolean;
  switchWarning: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const days = summarizeWeek1Days(week1);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          <View style={previewStyles.header}>
            <Text style={[previewStyles.title, { color: theme.text.primary }]} numberOfLines={2}>
              {templateName.toUpperCase()}
            </Text>
            <Text style={previewStyles.subtitle}>
              WEEK 1 OF {weekCount} — WHAT YOU'LL START WITH
            </Text>
          </View>

          {switchWarning && (
            <View style={previewStyles.warningBanner}>
              <MaterialCommunityIcons name="alert-outline" size={14} color={bronzeGold} />
              <Text style={previewStyles.warningText}>{switchWarning}</Text>
            </View>
          )}

          <ScrollView style={previewStyles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {loading ? (
              <View style={previewStyles.loadingBox}>
                <LeapLogo size={32} animated />
                <Text style={[previewStyles.loadingText, { color: theme.text.tertiary }]}>LOADING PREVIEW...</Text>
              </View>
            ) : days.length === 0 ? (
              <Text style={[previewStyles.emptyText, { color: theme.text.tertiary }]}>
                PREVIEW UNAVAILABLE — YOU CAN STILL START THE PROGRAM.
              </Text>
            ) : (
              days.map(d => (
                <View key={d.key} style={[previewStyles.dayRow, { borderColor: theme.card.border }]}>
                  <Text style={[previewStyles.dayRowText, { color: theme.text.primary }]} numberOfLines={1}>
                    {d.label}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={previewStyles.actions}>
            <TouchableOpacity
              style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]}
              onPress={onCancel}
              disabled={starting}
            >
              <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[previewStyles.startBtn, { opacity: starting ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={starting}
            >
              {starting ? (
                <LeapLogo size={22} animated />
              ) : (
                <>
                  <Text style={previewStyles.startBtnText}>START NOW</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#000" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: '82%',
    padding: 20,
    overflow: 'hidden',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 22,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: bronzeGold,
    marginTop: 4,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(200,160,64,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,160,64,0.35)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    color: bronzeGold,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  // flex:1 (not just marginBottom) is required for this to actually
  // scroll internally — without it, the ScrollView sizes to its full
  // content height instead of the space remaining under the card's
  // maxHeight, pushing the footer buttons (CLOSE / ADD AS DAY N) below the
  // visible card for any workout with enough exercises to overflow.
  body: {
    flex: 1,
    marginBottom: 16,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  emptyText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingVertical: 24,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  dayRowText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 15,
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
  startBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: bronzeGold,
    borderRadius: 10,
    paddingVertical: 15,
    gap: 8,
  },
  startBtnText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  removeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 10,
    paddingVertical: 15,
    gap: 6,
  },
  removeBtnText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});

function ProgramCard({
  rec,
  isFirst,
  isCurrent,
  imageSource,
  isSelecting,
  disabled,
  isProItem,
  locked,
  onSelect,
}: {
  rec: LibraryTemplateRecommendation;
  isFirst: boolean;
  isCurrent: boolean;
  imageSource: any;
  isSelecting: boolean;
  disabled: boolean;
  isProItem: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  // useScreenMeasure=true: see useTutorialTarget's own comment.
  const { ref: startProgramRef, onLayout: onStartProgramLayout } = useTutorialTarget('templates.startProgram', undefined, true);

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 5 }).start();
  };

  return (
    <Animated.View style={[styles.gridCardWrap, { transform: [{ scale }] }]}>
      <LinearGradient
        colors={locked ? ['#3A3A3A', '#2A2A2A', '#3A3A3A'] : ['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardBorder}
      >
        <Pressable
          ref={isFirst ? startProgramRef : undefined}
          onLayout={isFirst ? onStartProgramLayout : undefined}
          onPress={onSelect}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled || isCurrent}
          accessibilityRole="button"
          accessibilityLabel={isCurrent ? `${rec.template_name} is your current program` : locked ? `${rec.template_name} requires Pro` : `Start ${rec.template_name}`}
          style={styles.cardPressable}
        >
          <ImageBackground source={imageSource} style={styles.programGridImage} imageStyle={styles.cardImageInner}>
            <LinearGradient
              colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {locked && <View style={styles.lockOverlay} pointerEvents="none" />}

            {/* Corner ribbon, pinned flush to the card edge rather than
                sitting inline in the badge row — a content label shown to
                every viewer regardless of their own access (a Pro
                subscriber should still see which templates their
                subscription unlocks). The dark gradient/overlay above
                (driven by `locked`, not `isProItem`) is what actually
                conveys "you can't open this" for non-Pro viewers. */}
            {isProItem && !isCurrent && (
              <View style={styles.proCorner}>
                <MaterialCommunityIcons name="crown" size={7} color="#FFFFFF" />
                <Text style={styles.proCornerText}>PRO</Text>
              </View>
            )}

            <View style={styles.gradientCardTop}>
              {isCurrent ? (
                <View style={styles.miniBadge}>
                  <MaterialCommunityIcons name="check-circle" size={10} color="#2ECC71" />
                </View>
              ) : isFirst && !isProItem ? (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedBadgeText}>TOP PICK</Text>
                </View>
              ) : <View />}
              <View style={styles.tierPillSmall}>
                <Text style={styles.tierPillText}>T{rec.tier_range.min}–{rec.tier_range.max}</Text>
              </View>
            </View>

            <View style={styles.gradientCardBottom}>
              <View style={styles.gradientCardAccent} />
              <Text style={styles.gradientCardTitle} numberOfLines={1}>{rec.template_name.toUpperCase()}</Text>
              {isCurrent ? (
                <Text style={styles.programGridStatusText}>ACTIVE</Text>
              ) : isSelecting ? (
                <Text style={styles.programGridStatusText}>STARTING...</Text>
              ) : null}
            </View>
          </ImageBackground>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The ScrollView itself needs a bounded height (flexGrow: 0, explicit
  // height matching the pill) — without it, an unconstrained horizontal
  // ScrollView can stretch to fill available flex space, and its row
  // content defaults to alignItems:'stretch', making each pill balloon to
  // that full height instead of staying a compact tab.
  tabBarScroll: {
    flexGrow: 0,
    height: 40,
    marginBottom: 14,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  tabPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  tabPillText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 12,
  },
  filterScroll: {
    marginBottom: 16,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  scrollContainer: {
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  title: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 28,
    letterSpacing: 3,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 12,
    letterSpacing: 2.5,
    textAlign: 'center',
    marginTop: 2,
  },
  currentProgramBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },

  // 3-per-row grid — shared by Program cards (photo-hero, resized) and the
  // new flat gradient cards (Workouts/Quick Workouts/All).
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 16,
  },
  gridCardWrap: {
    width: '31%',
    aspectRatio: 4 / 3,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // Program card (photo-hero, resized to fit the grid). overflow:'hidden'
  // deliberately duplicated on both this layer and cardPressable below —
  // belt-and-suspenders after a real bug where 2-line titles bled past the
  // rounded corners onto the page background at this tile's tight height.
  cardBorder: {
    flex: 1,
    padding: 1.5,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardPressable: {
    flex: 1,
    borderRadius: 12.5,
    overflow: 'hidden',
  },
  cardImageInner: {
    borderRadius: 12.5,
  },
  programGridImage: {
    flex: 1,
    justifyContent: 'space-between',
  },
  programGridStatusText: {
    color: bronzeGold,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  miniBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: bronzeGold,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8,
    letterSpacing: 0.3,
  },
  // Premium "PRO" corner ribbon for Pro-tier program templates — Strength
  // World's own accent red (#FF5252, constants/worldThemes.ts), pinned
  // flush to the card's top-left corner rather than sitting inline with
  // the other badges, small and out of the way of the title/tier pill.
  proCorner: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5252',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderTopLeftRadius: 12.5,
    borderBottomRightRadius: 8,
    gap: 2,
  },
  proCornerText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 7,
    letterSpacing: 0.4,
  },
  tierPillSmall: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tierPillText: {
    color: bronzeGold,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },

  // Flat gradient card (Workouts / Quick Workouts / merged All)
  gradientCard: {
    flex: 1,
    borderRadius: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  gradientCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 6,
  },
  gradientCategoryBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: '70%',
  },
  gradientCategoryBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8,
    letterSpacing: 0.4,
  },
  gradientLogoBadge: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientLogoBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 9,
  },
  gradientCardBottom: {
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  gradientCardAccent: {
    width: 14,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginBottom: 3,
  },
  gradientCardTitle: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 12,
    letterSpacing: 0.3,
    lineHeight: 14,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  gradientCardSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8,
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // "Build your week" day-picker (Workouts tab)
  selectedBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#2ECC71',
  },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46,204,113,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  dayBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 8,
    letterSpacing: 0.3,
  },
  buildCta: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: bronzeGold,
    borderRadius: 12,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buildCtaText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
});
