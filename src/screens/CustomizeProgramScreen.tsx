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
  Difficulty,
} from '../lib/workoutLibrary';
import { DifficultyBand } from '../lib/templateLibrary';
import { canAccessPro } from '../lib/entitlement';
import { StealthTheme } from '../../constants/Theme';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { StandaloneWorkoutDetailModal, BuildSummaryModal } from './WorkoutLibraryScreen';
import { TC_COLORS, TC_LAYOUT } from '../../constants/trainingCenterTokens';

// Same underlying flow as WorkoutLibraryScreen's "workout" tab — browse
// standalone Workouts, pick up to MAX_CUSTOM_PROGRAM_DAYS as your custom
// program's days, then create it. Only the browse UI (card grid + filters)
// is new here, restyled to match the Training Center design system; the
// preview/build modals are reused as-is (StandaloneWorkoutDetailModal /
// BuildSummaryModal, exported from WorkoutLibraryScreen.tsx) rather than
// rebuilt, so the actual add/remove/create behavior is unchanged.
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

function ChipRow({ options, selected, onSelect }: { options: readonly string[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          onPress={() => onSelect(opt)}
          style={[
            styles.chip,
            selected === opt ? { backgroundColor: TC_COLORS.chipActiveBg, borderColor: TC_COLORS.coral } : { borderColor: TC_COLORS.borderStrong },
          ]}
        >
          <Text style={[styles.chipText, { color: selected === opt ? TC_COLORS.coral : TC_COLORS.textMuted }]}>
            {opt.toUpperCase().replace('_', ' ')}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function WorkoutPhotoCard({
  item,
  locked,
  dayNumber,
  onPress,
}: {
  item: StandaloneWorkoutSummary;
  locked: boolean;
  dayNumber: number | null;
  onPress: () => void;
}) {
  const [colorStart, colorEnd] = categoryGradient(item.category);
  const coverSource = item.cover_image_url ? { uri: item.cover_image_url } : null;
  const isSelected = dayNumber !== null;

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
          <View />
        )}
        {!!item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText} numberOfLines={1}>{item.category.replace('_', ' ')}</Text>
          </View>
        )}
      </View>
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']} style={styles.cardBottomGradient}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title.toUpperCase()}</Text>
        {!!item.difficulty && <Text style={styles.cardMeta}>{item.difficulty.toUpperCase()}</Text>}
      </LinearGradient>
    </>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.cardWrap, isSelected && { borderColor: TC_COLORS.coral, borderWidth: 1.5 }]}
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
  const isPro = canAccessPro(profile, paywallEnabled);

  const [workoutItems, setWorkoutItems] = useState<StandaloneWorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStandaloneWorkouts('workout', {
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      difficulty: difficultyFilter === 'all' ? undefined : (difficultyFilter as Difficulty),
    })
      .then((items) => { if (!cancelled) setWorkoutItems(items); })
      .catch((err) => { console.error('CustomizeProgramScreen load failed:', err); if (!cancelled) setWorkoutItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [categoryFilter, difficultyFilter]);

  const getDayNumber = (item: { id: string }): number | null => {
    const idx = selectedDayWorkouts.findIndex((w) => w.id === item.id);
    return idx === -1 ? null : idx + 1;
  };

  const openDetail = async (item: StandaloneWorkoutSummary) => {
    if (!item.is_free && !isPro) { router.push('/paywall'); return; }
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
    setCreatingProgram(true);
    try {
      await createCustomProgramFromWorkouts(selectedDayWorkouts.map((w) => w.id));
      setBuildSummaryVisible(false);
      setSelectedDayWorkouts([]);
      requestAnimationFrame(() => {
        router.replace('/warrior-program');
      });
    } catch (err: any) {
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
          <Text style={styles.headerSubline}>{workoutItems.length} WORKOUTS · {selectedDayWorkouts.length} ADDED</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: TC_LAYOUT.screenPadding, paddingBottom: selectedDayWorkouts.length > 0 ? 140 : 24 }}>
        <ChipRow options={CATEGORY_OPTIONS} selected={categoryFilter} onSelect={setCategoryFilter} />
        <View style={{ height: 8 }} />
        <ChipRow options={DIFFICULTY_OPTIONS} selected={difficultyFilter} onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')} />

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={TC_COLORS.coral} />
          </View>
        ) : workoutItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>NO WORKOUTS MATCH THIS FILTER YET.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {workoutItems.map((item) => (
              <WorkoutPhotoCard
                key={item.id}
                item={item}
                locked={!item.is_free && !isPro}
                dayNumber={getDayNumber(item)}
                onPress={() => openDetail(item)}
              />
            ))}
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

  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 1 },

  emptyBox: { borderWidth: 1, borderColor: TC_COLORS.border, borderRadius: 12, padding: 24, alignItems: 'center', marginTop: 16, backgroundColor: TC_COLORS.cardFlat },
  emptyText: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 16 },
  cardWrap: { width: '48%', aspectRatio: 3 / 4, borderRadius: 16, borderWidth: 1, borderColor: TC_COLORS.border, overflow: 'hidden' },
  card: { flex: 1, justifyContent: 'space-between' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 8 },
  dayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: TC_COLORS.coral, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  dayBadgeText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 0.5 },
  lockBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  categoryBadge: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 90 },
  categoryBadgeText: { color: TC_COLORS.textBody, fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 0.5 },
  cardBottomGradient: { padding: 10, paddingTop: 24 },
  cardTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13.5, lineHeight: 16 },
  cardMeta: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 1, marginTop: 3 },

  buildCta: {
    position: 'absolute', left: 16, right: 16, bottom: TC_LAYOUT.bottomBarOffset,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: TC_COLORS.coral, borderRadius: 16, height: 52,
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.7, shadowRadius: 34, elevation: 10,
  },
  buildCtaText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.6 },
});
