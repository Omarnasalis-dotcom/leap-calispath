import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ImageBackground, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
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
import { canAccessPro } from '../lib/entitlement';
import { StealthTheme } from '../../constants/Theme';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { ProgramPreviewModal } from '../components/workoutLibrary/SharedWorkoutModals';
import { ChipRow } from '../components/trainingCenter/ChipRow';
import { TC_COLORS, TC_LAYOUT } from '../../constants/trainingCenterTokens';

// getRecommendations/getAllPublishedTemplates/selectLibraryTemplate own the
// data/mutations; the preview/confirm step is ProgramPreviewModal, shared
// with CustomizeProgramScreen's other modals via
// ../components/workoutLibrary/SharedWorkoutModals. Browse UI, per handoff
// §5 (design_handoff_training_center):
// Recommended stays a 3-up photo grid; Browse All switches to one wide
// photo-cover card per row (index-mark + meta-pill-row + SELECT direction
// from the handoff, cover photos kept per the "keep covers" instruction —
// getCardImage always resolves to a real image, so there's no gradient
// fallback branch needed here, unlike Workouts/Quick Workouts).
const DIFFICULTY_OPTIONS: (DifficultyBand | 'all')[] = ['all', 'beginner', 'intermediate', 'advanced'];
const LEVEL_LABEL: Record<DifficultyBand, string> = { beginner: 'BEGINNER', intermediate: 'INTERMEDIATE', advanced: 'ADVANCED' };

// Same cover-photo resolution as WorkoutLibraryScreen's getCardImage — an
// admin-uploaded cover_image_url always wins; otherwise real athlete
// photography keyed by tier range, then a generic fallback. Always
// resolves to something real, never blank.
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

function CardBadge({ isCurrent, isFirst, isProItem }: { isCurrent: boolean; isFirst: boolean; isProItem: boolean }) {
  if (isCurrent) {
    return (
      <View style={styles.activeBadge}>
        <MaterialCommunityIcons name="check-circle" size={10} color="#000" />
        <Text style={styles.activeBadgeText}>ACTIVE</Text>
      </View>
    );
  }
  if (isFirst && !isProItem) {
    return (
      <View style={styles.topPickBadge}>
        <Text style={styles.topPickBadgeText}>TOP PICK</Text>
      </View>
    );
  }
  if (isProItem) {
    return (
      <View style={styles.proBadge}>
        <MaterialCommunityIcons name="crown" size={9} color="#FFFFFF" />
        <Text style={styles.proBadgeText}>PRO</Text>
      </View>
    );
  }
  return <View />;
}

// Recommended section — 3-up photo grid (handoff §5's own card language is
// written for the wide list card below; the grid direction here matches
// what the hub tile already promises — "3 cards in a row" — and reuses the
// same badge/tier-pill/lock vocabulary as the row card for visual unity).
function RecommendedCard({
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
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onSelect}
      disabled={disabled || isCurrent}
      style={styles.gridCardWrap}
    >
      <ImageBackground source={imageSource} style={styles.gridCard} imageStyle={styles.cardImageInner}>
        <LinearGradient colors={['rgba(0,0,0,.45)', 'rgba(0,0,0,.05)', 'rgba(0,0,0,.9)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        {locked && <View style={styles.lockOverlay} pointerEvents="none" />}
        <View style={styles.gridTopRow}>
          <CardBadge isCurrent={isCurrent} isFirst={isFirst} isProItem={isProItem} />
          <View style={styles.tierPill}>
            <Text style={styles.tierPillText}>T{rec.tier_range.min}–{rec.tier_range.max}</Text>
          </View>
        </View>
        <View style={styles.gridBottom}>
          <Text style={styles.gridTitle} numberOfLines={2}>{rec.template_name.toUpperCase()}</Text>
          {isSelecting && <Text style={styles.gridStatus}>STARTING...</Text>}
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

// Browse All / Other Templates — one wide photo-cover card per row, per
// handoff §5's "index mark / name / meta pill row / SELECT button pushed
// right" direction, adapted to keep the real cover photo (the handoff's
// own card has no cover slot at all — flat bg only — but the athlete asked
// to keep covers, so the photo stands in for the index mark here and the
// meta row + SELECT button carry the rest of the spec).
function TemplateRowCard({
  rec,
  imageSource,
  isCurrent,
  isSelecting,
  disabled,
  isProItem,
  locked,
  onSelect,
}: {
  rec: LibraryTemplateRecommendation;
  imageSource: any;
  isCurrent: boolean;
  isSelecting: boolean;
  disabled: boolean;
  isProItem: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const level = tierRangeToDifficultyBand(rec.tier_range);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onSelect}
      disabled={disabled || isCurrent}
      style={styles.rowCardWrap}
    >
      <ImageBackground source={imageSource} style={styles.rowCard} imageStyle={styles.cardImageInner}>
        <LinearGradient colors={['rgba(0,0,0,.4)', 'rgba(0,0,0,.1)', 'rgba(0,0,0,.92)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        {locked && <View style={styles.lockOverlay} pointerEvents="none" />}

        <View style={styles.rowTopRow}>
          <CardBadge isCurrent={isCurrent} isFirst={false} isProItem={isProItem} />
          <View style={styles.tierPill}>
            <Text style={styles.tierPillText}>T{rec.tier_range.min}–{rec.tier_range.max}</Text>
          </View>
        </View>

        <View style={styles.rowBottom}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{rec.template_name.toUpperCase()}</Text>
            <View style={styles.rowMetaLine}>
              <Text style={styles.rowMetaText}>{rec.week_count} WEEK{rec.week_count === 1 ? '' : 'S'}</Text>
              <View style={styles.rowMetaDot} />
              <Text style={styles.rowMetaText}>{rec.training_days_per_week}×/WK</Text>
              <View style={styles.rowMetaDot} />
              <Text style={styles.rowMetaText}>{LEVEL_LABEL[level]}</Text>
            </View>
          </View>

          {isCurrent ? (
            <View style={styles.selectBtnGhost}>
              <Text style={styles.selectBtnGhostText}>ACTIVE</Text>
            </View>
          ) : locked ? (
            <View style={styles.lockCircle}>
              <MaterialCommunityIcons name="lock" size={16} color={TC_COLORS.textPrimary} />
            </View>
          ) : (
            <View style={styles.selectBtn}>
              {isSelecting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Text style={styles.selectBtnText}>SELECT</Text>
                  <MaterialCommunityIcons name="arrow-right" size={13} color="#000" />
                </>
              )}
            </View>
          )}
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

export function ProgramTemplatesScreen() {
  const { user, profile, paywallEnabled } = useAuth();
  const isPro = canAccessPro(profile, paywallEnabled);

  const [recommendations, setRecommendations] = useState<LibraryTemplateRecommendation[]>([]);
  const [allTemplates, setAllTemplates] = useState<LibraryTemplateRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyBand | 'all'>('all');
  const [currentProgramName, setCurrentProgramName] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const [previewRec, setPreviewRec] = useState<LibraryTemplateRecommendation | null>(null);
  const [previewWeek1, setPreviewWeek1] = useState<TemplateDetailBlock[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

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
    setErrorMsg(null);
    const tier = profile ? profile.strength_tier : 0;
    Promise.all([getRecommendations(tier, 'strength'), getAllPublishedTemplates()])
      .then(([recs, all]) => {
        if (cancelled) return;
        setRecommendations(recs);
        setAllTemplates(all);
      })
      .catch((err: any) => { if (!cancelled) setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD PROGRAMS.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.strength_tier]);

  const topPickId = recommendations[0]?.id ?? null;
  const isProItem = (rec: LibraryTemplateRecommendation) => rec.id !== topPickId;
  const isProgramLocked = (rec: LibraryTemplateRecommendation) => isProItem(rec) && !isPro;

  const openPreview = async (rec: LibraryTemplateRecommendation) => {
    setPreviewRec(rec);
    setPreviewWeek1([]);
    setPreviewLoading(true);
    try {
      const weeks = await getTemplateDetails(rec.id);
      const week1 = weeks.find((w) => w.weekNumber === 1);
      setPreviewWeek1(week1?.blocks || []);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (selectingId) return;
    setPreviewRec(null);
    setPreviewWeek1([]);
  };

  const handleCardPress = (rec: LibraryTemplateRecommendation) => {
    if (isProgramLocked(rec)) { router.push('/paywall'); return; }
    openPreview(rec);
  };

  const handleConfirmStart = async () => {
    if (!previewRec) return;
    const rec = previewRec;
    setSelectingId(rec.id);
    try {
      await selectLibraryTemplate(rec.id);
      setPreviewRec(null);
      setPreviewWeek1([]);
      // Same deferred-navigation pattern as the other Training Center
      // screens — see CustomizeProgramScreen's handleCreateCustomProgram
      // comment for why the extra frame matters.
      requestAnimationFrame(() => {
        router.replace('/warrior-program');
      });
    } catch (err: any) {
      Alert.alert('SELECTION FAILED', err.message?.toUpperCase() || 'FAILED TO START THIS PROGRAM.');
    } finally {
      setSelectingId(null);
    }
  };

  const filteredAllTemplates = allTemplates.filter(
    (t) => difficultyFilter === 'all' || tierRangeToDifficultyBand(t.tier_range) === difficultyFilter
  );

  return (
    <View style={{ flex: 1, backgroundColor: TC_COLORS.screenBg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={TC_COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.headerTitle}>PROGRAM TEMPLATES</Text>
          <Text style={styles.headerSubline}>{filteredAllTemplates.length} OF {allTemplates.length} SHOWN</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={TC_COLORS.coral} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: TC_LAYOUT.screenPadding, paddingBottom: 24 }}>
          {currentProgramName && (
            <View style={styles.currentProgramBanner}>
              <Text style={styles.currentProgramText}>
                CURRENTLY ACTIVE: <Text style={{ color: TC_COLORS.coral }}>{currentProgramName.toUpperCase()}</Text> — SELECTING A NEW PROGRAM WILL SWITCH YOU OVER
              </Text>
            </View>
          )}

          {errorMsg && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {recommendations.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>RECOMMENDED FOR YOU</Text>
              <View style={styles.grid}>
                {recommendations.map((rec, index) => (
                  <RecommendedCard
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

          <Text style={styles.sectionLabel}>OTHER TEMPLATES</Text>
          <ChipRow options={DIFFICULTY_OPTIONS} selected={difficultyFilter} onSelect={(v) => setDifficultyFilter(v as DifficultyBand | 'all')} />
          <View style={{ height: 14 }} />

          {!errorMsg && filteredAllTemplates.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>NO PROGRAMS MATCH THIS FILTER YET.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {filteredAllTemplates.map((rec, index) => (
                <TemplateRowCard
                  key={rec.id}
                  rec={rec}
                  imageSource={getCardImage(rec, index)}
                  isCurrent={!!currentProgramName && rec.template_name === currentProgramName}
                  isSelecting={selectingId === rec.id}
                  disabled={selectingId !== null}
                  isProItem={isProItem(rec)}
                  locked={isProgramLocked(rec)}
                  onSelect={() => handleCardPress(rec)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <ProgramPreviewModal
        visible={previewRec !== null}
        theme={StealthTheme.dark}
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

      <BottomTabBar activeTab="profile" strengthTier={profile?.strength_tier || 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: TC_LAYOUT.screenPadding, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 17, letterSpacing: 1.6 },
  headerSubline: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 2, marginTop: 3 },

  sectionLabel: { color: TC_COLORS.textFaint3, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 12, letterSpacing: 1.8, marginTop: 4, marginBottom: 12 },

  currentProgramBanner: { borderWidth: 1, borderColor: TC_COLORS.border, borderRadius: 10, padding: 12, marginBottom: 16, backgroundColor: TC_COLORS.cardFlat },
  currentProgramText: { color: TC_COLORS.textFaint3, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5 },

  errorBanner: { backgroundColor: 'rgba(255,107,107,0.1)', borderColor: '#FF6B6B', borderWidth: 1, padding: 12, borderRadius: 8, marginBottom: 16 },
  errorText: { color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center' },

  emptyBox: { borderWidth: 1, borderColor: TC_COLORS.border, borderRadius: 12, padding: 24, alignItems: 'center', backgroundColor: TC_COLORS.cardFlat },
  emptyText: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center' },

  cardImageInner: { borderRadius: 16 },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },

  tierPill: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  tierPillText: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 0.5 },

  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#2ECC71', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  activeBadgeText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5 },
  topPickBadge: { backgroundColor: TC_COLORS.coral, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  topPickBadgeText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.4 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FF5252', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  proBadgeText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 8, letterSpacing: 0.4 },

  // Recommended — 3-up grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 24 },
  gridCardWrap: { width: '31%', aspectRatio: 3 / 4, borderRadius: 16, borderWidth: 1, borderColor: TC_COLORS.border, overflow: 'hidden' },
  gridCard: { flex: 1, justifyContent: 'space-between' },
  gridTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 8 },
  gridBottom: { padding: 10, paddingTop: 20 },
  gridTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12.5, lineHeight: 15 },
  gridStatus: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.8, marginTop: 3 },

  // Browse All — one wide row card per template
  rowCardWrap: { borderRadius: 16, borderWidth: 1, borderColor: TC_COLORS.border, overflow: 'hidden' },
  rowCard: { height: 150, justifyContent: 'space-between' },
  rowTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'flex-end', padding: 14, gap: 12 },
  rowTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 17 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  rowMetaText: { color: TC_COLORS.textBody, fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 0.6 },
  rowMetaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: TC_COLORS.textMuted },

  selectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: TC_COLORS.coral, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 5,
  },
  selectBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 11.5, letterSpacing: 1 },
  selectBtnGhost: { borderWidth: 1, borderColor: 'rgba(46,204,113,0.5)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  selectBtnGhostText: { color: '#2ECC71', fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 1 },
  lockCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
});
