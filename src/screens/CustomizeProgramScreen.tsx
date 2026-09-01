import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ImageBackground, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
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
import { StandaloneWorkoutDetailModal, BuildSummaryModal } from '../components/workoutLibrary/SharedWorkoutModals';
import { ChipRow } from '../components/trainingCenter/ChipRow';
import { TC_COLORS, TC_LAYOUT } from '../../constants/trainingCenterTokens';

// Browse standalone Workouts, pick up to MAX_CUSTOM_PROGRAM_DAYS as your
// custom program's days, then create it. The preview/build modals are
// shared with ProgramTemplatesScreen (StandaloneWorkoutDetailModal /
// BuildSummaryModal, from ../components/workoutLibrary/SharedWorkoutModals)
// rather than rebuilt, so the actual add/remove/create behavior stays
// consistent everywhere it's used.
const MAX_CUSTOM_PROGRAM_DAYS = 7;
const CATEGORY_OPTIONS = ['all', 'PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY'] as const;
const DIFFICULTY_OPTIONS: (DifficultyBand | 'all')[] = ['all', 'beginner', 'intermediate', 'advanced'];

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

function WorkoutPhotoCard({
  item,
  locked,
  dayNumber,
  columns,
  hidden,
  onPress,
}: {
  item: StandaloneWorkoutSummary;
  locked: boolean;
  dayNumber: number | null;
  columns: 1 | 2;
  hidden?: boolean;
  onPress: () => void;
}) {
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
            <MaterialCommunityIcons name="lock" size={12} color={TC_COLORS.textPrimary} />
          </View>
        ) : (
          <View style={styles.addBadge}>
            <MaterialCommunityIcons name="plus" size={14} color={TC_COLORS.coral} />
          </View>
        )}
        {!!item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText} numberOfLines={1}>{item.category.replace('_', ' ')}</Text>
          </View>
        )}
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

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.cardWrap,
        isWide ? styles.cardWrapWide : styles.cardWrapGrid,
        isSelected && { borderColor: TC_COLORS.coral, borderWidth: 1.5 },
        hidden && { display: 'none' },
      ]}
    >
      {coverSource ? (
        <ImageBackground source={coverSource} style={styles.card} imageStyle={{ borderRadius: 16 }}>
          {overlay}
        </ImageBackground>
      ) : (
        <LinearGradient colors={[colorStart, colorEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          {overlay}
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

export function CustomizeProgramScreen() {
  const { user, profile, paywallEnabled } = useAuth();
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

  const handleCreateCustomProgram = async () => {
    if (selectedDayWorkouts.length === 0) return;
    if (!isPro) { router.push('/paywall'); return; }
    setCreatingProgram(true);
    try {
      await createCustomProgramFromWorkouts(selectedDayWorkouts.map((w) => w.id));
      setBuildSummaryVisible(false);
      setSelectedDayWorkouts([]);
      requestAnimationFrame(() => {
        router.replace('/warrior-program');
      });
    } catch (err: any) {
      if (isProRequiredError(err)) { router.push('/paywall'); return; }
      Alert.alert('COULD NOT CREATE PROGRAM', err.message?.toUpperCase() || 'SOMETHING WENT WRONG.');
    } finally {
      setCreatingProgram(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: TC_COLORS.screenBg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={TC_COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.headerTitle}>CUSTOMIZE YOUR PROGRAM</Text>
          <Text style={styles.headerSubline}>{filteredWorkoutItems.length} WORKOUTS · {selectedDayWorkouts.length} ADDED</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: TC_LAYOUT.screenPadding, paddingBottom: selectedDayWorkouts.length > 0 ? 140 : 24 }}>
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
              <MaterialCommunityIcons name="view-agenda-outline" size={16} color={columns === 1 ? '#000' : TC_COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setColumns(2)}
              style={[styles.layoutToggleBtn, columns === 2 && styles.layoutToggleBtnActive]}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <MaterialCommunityIcons name="view-grid-outline" size={16} color={columns === 2 ? '#000' : TC_COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ height: 8 }} />
        <ChipRow options={DIFFICULTY_OPTIONS} selected={difficultyFilter} onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')} />

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={TC_COLORS.coral} />
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

      {selectedDayWorkouts.length > 0 && (
        <TouchableOpacity style={styles.buildCta} onPress={() => setBuildSummaryVisible(true)} activeOpacity={0.85}>
          <MaterialCommunityIcons name="calendar-check" size={16} color="#000" />
          <Text style={styles.buildCtaText}>CREATE MY WORKOUT ({selectedDayWorkouts.length})</Text>
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

      <BottomTabBar activeTab="profile" strengthTier={profile?.strength_tier || 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: TC_LAYOUT.screenPadding, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 17, letterSpacing: 1.6 },
  headerSubline: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 2, marginTop: 3 },

  emptyBox: { borderWidth: 1, borderColor: TC_COLORS.border, borderRadius: 12, padding: 24, alignItems: 'center', backgroundColor: TC_COLORS.cardFlat },
  emptyText: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center' },

  layoutToggle: { flexDirection: 'row', gap: 4, backgroundColor: TC_COLORS.cardFlat, borderWidth: 1, borderColor: TC_COLORS.borderStrong, borderRadius: 10, padding: 3 },
  layoutToggleBtn: { width: 30, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  layoutToggleBtnActive: { backgroundColor: TC_COLORS.coral },

  grid: { marginTop: 16, gap: 14 },
  gridTwoUp: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, columnGap: 0 },
  cardWrap: { borderRadius: 16, borderWidth: 1, borderColor: TC_COLORS.border, overflow: 'hidden' },
  cardWrapWide: { width: '100%', aspectRatio: 16 / 9 },
  cardWrapGrid: { width: '48%', aspectRatio: 3 / 4 },
  card: { flex: 1, justifyContent: 'space-between' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 10 },
  dayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: TC_COLORS.coral, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  dayBadgeText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 0.5 },
  lockBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  addBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5, borderColor: TC_COLORS.coral, alignItems: 'center', justifyContent: 'center',
  },
  categoryBadge: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 140 },
  categoryBadgeText: { color: TC_COLORS.textBody, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 0.5 },
  cardBottomGradient: { padding: 14, paddingTop: 32 },
  cardBottomGradientWide: { padding: 14, paddingTop: 32 },
  cardBottomGradientGrid: { padding: 10, paddingTop: 24 },
  cardTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold' },
  cardTitleWide: { fontSize: 17, lineHeight: 20 },
  cardTitleGrid: { fontSize: 13.5, lineHeight: 16 },
  cardMeta: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1.2, marginTop: 4 },
  cardMetaGrid: { fontSize: 9 },

  buildCta: {
    position: 'absolute', left: 16, right: 16, bottom: TC_LAYOUT.bottomBarOffset,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: TC_COLORS.coral, borderRadius: 16, height: 52,
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.7, shadowRadius: 34, elevation: 10,
  },
  buildCtaText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.6 },
});
