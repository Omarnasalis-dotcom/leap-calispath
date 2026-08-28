import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, ImageBackground, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import {
  getStandaloneWorkouts,
  getStandaloneWorkoutDetail,
  StandaloneWorkoutSummary,
  StandaloneWorkoutDetail,
} from '../lib/workoutLibrary';
import { DifficultyBand } from '../lib/templateLibrary';
import { canAccessPro } from '../lib/entitlement';
import { StealthTheme } from '../../constants/Theme';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { QuickWorkoutTimerModal } from '../components/workoutLibrary/QuickWorkoutTimerModal';
import { ChipRow } from '../components/trainingCenter/ChipRow';
import { TC_COLORS, TC_LAYOUT } from '../../constants/trainingCenterTokens';

// Browse standalone Quick Workouts and start one immediately — no preview
// screen. Design intent (handoff §7): "starts the session immediately —
// that's the point of Quick." Same principle already applied to My Active
// Program (Session Detail was removed as a forced interstitial). Full
// detail (blocks/exercises) is only fetched once a card is tapped, not
// upfront for every card in the list — a movement-pill preview per card
// would mean an N+1 fetch (StandaloneWorkoutSummary carries no exercise
// data) — but cover_image_url IS already on the summary, so the card can
// show its real cover photo with no extra fetch; duration/format/category
// stand in for the movement list instead.
//
// Category (focus) + difficulty filters, same options as the original
// WorkoutLibraryScreen quick_workout tab — but applied client-side over one
// fetch-on-mount, not as separate server queries per filter change.
// Re-querying the server on every chip tap swapped the whole list out from
// under itself, which read as a full reload on every filter tap. Filtering
// the same in-memory list instead is instant and never shows a spinner.
const CATEGORY_OPTIONS = ['all', 'PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY'] as const;
const DIFFICULTY_OPTIONS: (DifficultyBand | 'all')[] = ['all', 'beginner', 'intermediate', 'advanced'];

const FORMAT_LABELS: Record<string, string> = {
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'TABATA',
  fortime: 'FOR TIME',
};

function CardTrailingIcon({ locked, loadingDetail }: { locked: boolean; loadingDetail: boolean }) {
  if (locked) {
    return (
      <View style={styles.lockCircle}>
        <MaterialCommunityIcons name="lock" size={16} color={TC_COLORS.textPrimary} />
      </View>
    );
  }
  return (
    <View style={styles.playCircle}>
      {loadingDetail ? <ActivityIndicator size="small" color="#000" /> : <MaterialCommunityIcons name="play" size={18} color="#000" />}
    </View>
  );
}

function QuickWorkoutCard({
  item,
  locked,
  loadingDetail,
  hidden,
  onPress,
}: {
  item: StandaloneWorkoutSummary;
  locked: boolean;
  loadingDetail: boolean;
  hidden?: boolean;
  onPress: () => void;
}) {
  const metaLine = `${item.format ? (FORMAT_LABELS[item.format] ?? item.format.toUpperCase()) : 'QUICK WORKOUT'}${item.category ? ` · ${item.category.replace('_', ' ')}` : ''}`;

  if (item.cover_image_url) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.photoCardWrap, hidden && { display: 'none' }]}>
        <ImageBackground source={{ uri: item.cover_image_url }} style={styles.photoCard} imageStyle={{ borderRadius: 16 }}>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,.55)', 'rgba(0,0,0,.9)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.photoDurationBadge}>
            <Text style={styles.photoDurationText}>{item.duration_minutes ?? '–'} MIN</Text>
          </View>
          <View style={styles.photoBottomRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoCardTitle} numberOfLines={1}>{item.title.toUpperCase()}</Text>
              <Text style={styles.photoCardMeta} numberOfLines={1}>{metaLine}</Text>
            </View>
            <CardTrailingIcon locked={locked} loadingDetail={loadingDetail} />
          </View>
        </ImageBackground>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.card, hidden && { display: 'none' }]}>
      <View style={styles.durationBox}>
        <Text style={styles.durationValue}>{item.duration_minutes ?? '–'}</Text>
        <Text style={styles.durationUnit}>MIN</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title.toUpperCase()}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>{metaLine}</Text>
      </View>
      <CardTrailingIcon locked={locked} loadingDetail={loadingDetail} />
    </TouchableOpacity>
  );
}

export function QuickWorkoutScreen() {
  const { profile, paywallEnabled } = useAuth();
  const isPro = canAccessPro(profile, paywallEnabled);

  const [items, setItems] = useState<StandaloneWorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyBand | 'all'>('all');

  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<StandaloneWorkoutDetail | null>(null);
  const [timerVisible, setTimerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStandaloneWorkouts('quick_workout')
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => { console.error('QuickWorkoutScreen load failed:', err); if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const matchesFilters = (i: StandaloneWorkoutSummary) =>
    (categoryFilter === 'all' || i.category === categoryFilter) &&
    (difficultyFilter === 'all' || i.difficulty === difficultyFilter);
  const filteredItems = items.filter(matchesFilters);

  const handlePlay = async (item: StandaloneWorkoutSummary) => {
    if (!item.is_free && !isPro) { router.push('/paywall'); return; }
    if (loadingDetailId) return;
    setLoadingDetailId(item.id);
    try {
      const detail = await getStandaloneWorkoutDetail(item.id);
      if (!detail) {
        Alert.alert('NOT AVAILABLE', 'THAT WORKOUT COULD NOT BE FOUND — IT MAY HAVE BEEN REMOVED.');
        return;
      }
      setActiveWorkout(detail);
      setTimerVisible(true);
    } catch (err: any) {
      console.error('handlePlay failed:', err);
      Alert.alert('COULD NOT LOAD WORKOUT', (err?.message || 'SOMETHING WENT WRONG.').toUpperCase());
    } finally {
      setLoadingDetailId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: TC_COLORS.screenBg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={TC_COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.headerTitle}>QUICK WORKOUT</Text>
          <Text style={styles.headerSubline}>{filteredItems.length} READY SESSIONS</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: TC_LAYOUT.screenPadding, paddingBottom: 24 }}>
        <ChipRow options={CATEGORY_OPTIONS} selected={categoryFilter} onSelect={setCategoryFilter} />
        <View style={{ height: 8 }} />
        <ChipRow options={DIFFICULTY_OPTIONS} selected={difficultyFilter} onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')} />

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={TC_COLORS.coral} />
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 16 }}>
            {/* Every card stays mounted the whole time — a filter change
                only toggles `display` on the card's own root, it never
                adds/removes items from the tree. Filtering the array
                instead unmounted cards that scroll back into view, forcing
                their cover image to mount (and load) fresh each time,
                which is what read as "still reloading" even after the
                fetch itself was made one-shot. */}
            {items.map((item) => (
              <QuickWorkoutCard
                key={item.id}
                item={item}
                locked={!item.is_free && !isPro}
                loadingDetail={loadingDetailId === item.id}
                hidden={!matchesFilters(item)}
                onPress={() => handlePlay(item)}
              />
            ))}
            {filteredItems.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>NO QUICK WORKOUTS MATCH THIS FILTER YET.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <QuickWorkoutTimerModal
        visible={timerVisible}
        workout={activeWorkout}
        theme={StealthTheme.dark}
        onClose={() => {
          setTimerVisible(false);
          setActiveWorkout(null);
        }}
      />

      <BottomTabBar activeTab="profile" strengthTier={profile?.strength_tier || 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: TC_LAYOUT.screenPadding, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 17, letterSpacing: 1.6 },
  headerSubline: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 2, marginTop: 3 },

  emptyBox: { borderWidth: 1, borderColor: TC_COLORS.border, borderRadius: 12, padding: 24, alignItems: 'center', marginTop: 16, backgroundColor: TC_COLORS.cardFlat },
  emptyText: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: TC_COLORS.border, borderRadius: 16, backgroundColor: TC_COLORS.cardRaised, padding: 14,
  },
  durationBox: {
    width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: TC_COLORS.coral,
    alignItems: 'center', justifyContent: 'center',
  },
  durationValue: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19 },
  durationUnit: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 8, letterSpacing: 1 },
  cardTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 15 },
  cardMeta: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 0.6, marginTop: 3 },
  playCircle: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: TC_COLORS.coral, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 6,
  },
  lockCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },

  photoCardWrap: { borderRadius: 16, borderWidth: 1, borderColor: TC_COLORS.border, overflow: 'hidden' },
  photoCard: { height: 140, justifyContent: 'space-between' },
  photoDurationBadge: { alignSelf: 'flex-start', margin: 10, backgroundColor: 'rgba(0,0,0,.55)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  photoDurationText: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 0.8 },
  photoBottomRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 14, gap: 12 },
  photoCardTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  photoCardMeta: { color: TC_COLORS.textBody, fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 0.6, marginTop: 3 },
});
