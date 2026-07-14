import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Animated, ImageBackground, StyleSheet, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { LeapLogo } from '../components/LeapLogo';
import { supabase } from '../lib/supabase';
import { getRecommendations, getTemplateDetails, selectLibraryTemplate, LibraryTemplateRecommendation, TemplateDetailBlock } from '../lib/templateLibrary';
import { useTutorialTarget } from '../hooks/useTutorialTarget';

const bronzeGold = '#C8A040';

// Cover photos for the program cards. Real athlete photography keyed by
// tier range; anything without a dedicated shot cycles through the generic
// fallbacks so every card is always image-first, never blank.
function getCardImage(rec: LibraryTemplateRecommendation, index: number) {
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

interface Props {
  onClose?: () => void;
}

export function TemplateRecommendationsScreen({ onClose }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const { user, profile } = useAuth();

  const [recommendations, setRecommendations] = useState<LibraryTemplateRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [currentProgramName, setCurrentProgramName] = useState<string | null>(null);

  // Preview/confirm modal — shown when a card is tapped, before anything is
  // actually started. previewRec is the program awaiting confirmation;
  // previewWeek1 is its first-week structure, fetched lazily per tap rather
  // than upfront for every card.
  const [previewRec, setPreviewRec] = useState<LibraryTemplateRecommendation | null>(null);
  const [previewWeek1, setPreviewWeek1] = useState<TemplateDetailBlock[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadRecommendations();
    checkExistingProgram();
  }, [profile?.strength_tier, user?.id]);

  async function loadRecommendations() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const tier = profile ? profile.strength_tier : 0;
      const results = await getRecommendations(tier, 'strength');
      setRecommendations(results);
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD RECOMMENDATIONS.');
    } finally {
      setLoading(false);
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
  // from handleConfirmStart, once the user explicitly confirms.
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

  const handleConfirmStart = async () => {
    if (!previewRec) return;
    const rec = previewRec;
    setSelectingId(rec.id);
    try {
      await selectLibraryTemplate(rec.id);
      setPreviewRec(null);
      setPreviewWeek1([]);
      // Straight into the workout — not back to wherever this screen was
      // opened from (usually Profile). replace (not push) so the back
      // stack doesn't leave this recommendations screen sitting behind it.
      router.replace('/warrior-program');
    } catch (err: any) {
      Alert.alert('SELECTION FAILED', err.message?.toUpperCase() || 'FAILED TO START THIS PROGRAM.');
    } finally {
      setSelectingId(null);
    }
  };

  const { ref: backButtonRef, onLayout: onBackButtonLayout, reportInteraction: reportBackButton } = useTutorialTarget('templates.backButton');

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
        <Text style={[styles.title, { color: theme.text.primary }]}>RECOMMENDED PROGRAMS</Text>
        <Text style={[styles.subtitle, { color: bronzeGold }]}>MATCHED TO YOUR TIER</Text>
      </View>
      <View style={{ width: 44 }} />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        {headerBar}
        <View style={styles.centerContainer}>
          <LeapLogo size={40} animated />
          <Text style={[styles.loadingText, { color: theme.text.secondary }]}>FINDING YOUR PROGRAMS...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {headerBar}
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {currentProgramName && (
          <View style={[styles.currentProgramBanner, { borderColor: theme.card.border }]}>
            <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5 }}>
              CURRENTLY ACTIVE: <Text style={{ color: bronzeGold }}>{currentProgramName.toUpperCase()}</Text> — SELECTING A NEW ONE WILL SWITCH YOU OVER
            </Text>
          </View>
        )}

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {!errorMsg && recommendations.length === 0 && (
          <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
            <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center' }}>
              NO PROGRAMS PUBLISHED FOR YOUR TIER YET. CHECK BACK SOON.
            </Text>
          </View>
        )}

        {recommendations.map((rec, index) => (
          <ProgramCard
            key={rec.id}
            rec={rec}
            isFirst={index === 0}
            isCurrent={!!currentProgramName && rec.template_name === currentProgramName}
            imageSource={getCardImage(rec, index)}
            isSelecting={selectingId === rec.id}
            disabled={selectingId !== null}
            onSelect={() => openPreview(rec)}
          />
        ))}
      </ScrollView>

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
    </View>
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
  body: {
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
});

function ProgramCard({
  rec,
  isFirst,
  isCurrent,
  imageSource,
  isSelecting,
  disabled,
  onSelect,
}: {
  rec: LibraryTemplateRecommendation;
  isFirst: boolean;
  isCurrent: boolean;
  imageSource: any;
  isSelecting: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const { ref: startProgramRef, onLayout: onStartProgramLayout } = useTutorialTarget('templates.startProgram');

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 5 }).start();
  };

  return (
    <Animated.View style={[styles.cardWrap, { transform: [{ scale }] }]}>
      <LinearGradient
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardBorder}
      >
        <Pressable
          onPress={onSelect}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled || isCurrent}
          accessibilityRole="button"
          accessibilityLabel={isCurrent ? `${rec.template_name} is your current program` : `Start ${rec.template_name}`}
          style={styles.cardPressable}
        >
          <ImageBackground source={imageSource} style={styles.cardImage} imageStyle={styles.cardImageInner}>
            {/* Cinematic dark overlay: top fade (badge legibility), bottom
                fade (title/CTA legibility), and a soft side vignette. */}
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
              style={styles.topFade}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.32)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.94)']}
              style={styles.bottomFade}
              pointerEvents="none"
            />

            <View style={styles.cardTop}>
              {isCurrent ? (
                <View style={styles.currentBadge}>
                  <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                  <Text style={styles.currentBadgeText}>CURRENT PROGRAM</Text>
                </View>
              ) : isFirst ? (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
                </View>
              ) : null}
              <View style={styles.tierPill}>
                <MaterialCommunityIcons name="shield-outline" size={12} color={bronzeGold} />
                <Text style={styles.tierPillText}>TIER {rec.tier_range.min}–{rec.tier_range.max}</Text>
              </View>
            </View>

            <View style={styles.cardBottom}>
              <Text style={styles.cardTitle} numberOfLines={2}>{rec.template_name.toUpperCase()}</Text>
              {rec.description ? (
                <Text style={styles.cardTagline} numberOfLines={2}>{rec.description}</Text>
              ) : null}

              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="calendar-outline" size={13} color={bronzeGold} />
                  <Text style={styles.chipText}>{rec.training_days_per_week} DAY(S)/WK</Text>
                </View>
                <View style={styles.chip}>
                  <MaterialCommunityIcons
                    name={rec.equipment_tags.length > 0 ? 'dumbbell' : 'hand-back-left-outline'}
                    size={13}
                    color={bronzeGold}
                  />
                  <Text style={styles.chipText}>{rec.equipment_tags.length > 0 ? 'EQUIPMENT' : 'BODYWEIGHT'}</Text>
                </View>
                {rec.week_count > 1 && (
                  <View style={styles.chip}>
                    <MaterialCommunityIcons name="calendar-range" size={13} color={bronzeGold} />
                    <Text style={styles.chipText}>{rec.week_count} WEEKS</Text>
                  </View>
                )}
              </View>

              {isCurrent ? (
                <View style={styles.currentBtn}>
                  <MaterialCommunityIcons name="check-bold" size={16} color={bronzeGold} />
                  <Text style={styles.currentBtnText}>CURRENTLY ACTIVE</Text>
                </View>
              ) : (
                <View
                  ref={isFirst ? startProgramRef : undefined}
                  onLayout={isFirst ? onStartProgramLayout : undefined}
                  style={[styles.selectBtn, { opacity: isSelecting ? 0.6 : 1 }]}
                >
                  <Text style={styles.selectBtnText}>{isSelecting ? 'STARTING...' : 'START PROGRAM'}</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#000" />
                </View>
              )}
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

  // Card
  cardWrap: {
    borderRadius: 24,
    marginBottom: 22,
    shadowColor: '#FF7043',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  cardBorder: {
    padding: 1.5,
    borderRadius: 24,
  },
  cardPressable: {
    borderRadius: 22.5,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    minHeight: 460,
    justifyContent: 'space-between',
  },
  cardImageInner: {
    borderRadius: 22.5,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  cardTop: {
    padding: 18,
  },
  recommendedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: bronzeGold,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  recommendedBadgeText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(46, 204, 113, 0.85)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
    gap: 5,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(200,160,64,0.5)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 5,
  },
  tierPillText: {
    color: bronzeGold,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  cardBottom: {
    padding: 18,
    paddingBottom: 20,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 30,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  cardTagline: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 5,
  },
  chipText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: bronzeGold,
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 16,
    gap: 8,
  },
  currentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: bronzeGold,
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 16,
    gap: 8,
  },
  currentBtnText: {
    color: bronzeGold,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  selectBtnText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
});
