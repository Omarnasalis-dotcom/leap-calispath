import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import {
  getStandaloneWorkouts,
  getStandaloneWorkoutDetail,
  StandaloneWorkoutSummary,
  StandaloneWorkoutDetail,
} from '../lib/workoutLibrary';
import { canAccessPro } from '../lib/entitlement';
import { StealthTheme } from '../../constants/Theme';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { QuickWorkoutTimerModal } from '../components/workoutLibrary/QuickWorkoutTimerModal';
import { TC_COLORS, TC_LAYOUT } from '../../constants/trainingCenterTokens';

// Browse standalone Quick Workouts and start one immediately — no preview
// screen. Design intent (handoff §7): "starts the session immediately —
// that's the point of Quick." Same principle already applied to My Active
// Program (Session Detail was removed as a forced interstitial). Full
// detail (blocks/exercises) is only fetched once a card is tapped, not
// upfront for every card in the list — StandaloneWorkoutSummary carries no
// exercise data, so a movement-pill preview per card would mean an N+1
// fetch; duration/format/category (all real, already-loaded fields) stand
// in for it instead.
const DURATION_OPTIONS = [
  { key: 'all', label: 'ALL', test: () => true },
  { key: 'short', label: '≤10 MIN', test: (m: number) => m <= 10 },
  { key: 'mid', label: '15 MIN', test: (m: number) => m > 10 && m <= 15 },
  { key: 'long', label: '20+ MIN', test: (m: number) => m > 15 },
] as const;

const FORMAT_LABELS: Record<string, string> = {
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'TABATA',
  fortime: 'FOR TIME',
};

function QuickWorkoutCard({
  item,
  locked,
  loadingDetail,
  onPress,
}: {
  item: StandaloneWorkoutSummary;
  locked: boolean;
  loadingDetail: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <View style={styles.durationBox}>
        <Text style={styles.durationValue}>{item.duration_minutes ?? '–'}</Text>
        <Text style={styles.durationUnit}>MIN</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title.toUpperCase()}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.format ? (FORMAT_LABELS[item.format] ?? item.format.toUpperCase()) : 'QUICK WORKOUT'}
          {item.category ? ` · ${item.category.replace('_', ' ')}` : ''}
        </Text>
      </View>
      {locked ? (
        <View style={styles.lockCircle}>
          <MaterialCommunityIcons name="lock" size={16} color={TC_COLORS.textPrimary} />
        </View>
      ) : loadingDetail ? (
        <View style={styles.playCircle}>
          <ActivityIndicator size="small" color="#000" />
        </View>
      ) : (
        <View style={styles.playCircle}>
          <MaterialCommunityIcons name="play" size={18} color="#000" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function QuickWorkoutScreen() {
  const { profile, paywallEnabled } = useAuth();
  const isPro = canAccessPro(profile, paywallEnabled);

  const [items, setItems] = useState<StandaloneWorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [durationFilter, setDurationFilter] = useState<string>('all');

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

  const durationTest = DURATION_OPTIONS.find((o) => o.key === durationFilter)?.test ?? (() => true);
  const filteredItems = items.filter((i) => durationTest(i.duration_minutes ?? 0));

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
          {DURATION_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setDurationFilter(opt.key)}
              style={[
                styles.chip,
                durationFilter === opt.key ? { backgroundColor: TC_COLORS.chipActiveBg, borderColor: TC_COLORS.coral } : { borderColor: TC_COLORS.borderStrong },
              ]}
            >
              <Text style={[styles.chipText, { color: durationFilter === opt.key ? TC_COLORS.coral : TC_COLORS.textMuted }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={TC_COLORS.coral} />
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>NO QUICK WORKOUTS MATCH THIS FILTER YET.</Text>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 16 }}>
            {filteredItems.map((item) => (
              <QuickWorkoutCard
                key={item.id}
                item={item}
                locked={!item.is_free && !isPro}
                loadingDetail={loadingDetailId === item.id}
                onPress={() => handlePlay(item)}
              />
            ))}
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

  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 1 },

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
});
