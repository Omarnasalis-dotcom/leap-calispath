import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Animated, ImageBackground, StyleSheet, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { LeapLogo } from '../components/LeapLogo';
import { supabase } from '../lib/supabase';
import { getRecommendations, selectLibraryTemplate, LibraryTemplateRecommendation } from '../lib/templateLibrary';
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

  const handleSelect = (rec: LibraryTemplateRecommendation) => {
    const proceed = async () => {
      setSelectingId(rec.id);
      try {
        await selectLibraryTemplate(rec.id);
        Alert.alert('PROGRAM STARTED', `"${rec.template_name}" is now your active program.`);
        if (onClose) onClose();
        else router.back();
      } catch (err: any) {
        Alert.alert('SELECTION FAILED', err.message?.toUpperCase() || 'FAILED TO START THIS PROGRAM.');
      } finally {
        setSelectingId(null);
      }
    };

    if (!currentProgramName) {
      proceed();
      return;
    }

    const warning = `Switching will mark "${currentProgramName}" as completed and start "${rec.template_name}" instead. Your logged workout history is kept.`;
    if (Platform.OS === 'web') {
      if (window.confirm(warning)) proceed();
    } else {
      Alert.alert('SWITCH PROGRAM?', warning, [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'SWITCH', style: 'destructive', onPress: proceed },
      ]);
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
            onSelect={() => handleSelect(rec)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

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
