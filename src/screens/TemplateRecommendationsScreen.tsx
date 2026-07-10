import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { LeapLogo } from '../components/LeapLogo';
import { supabase } from '../lib/supabase';
import { getRecommendations, getTemplateDetails, selectLibraryTemplate, LibraryTemplateRecommendation, TemplateDetailWeek } from '../lib/templateLibrary';

const bronzeGold = '#C8A040';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, TemplateDetailWeek[]>>({});

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

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const handleToggleDetails = async (rec: LibraryTemplateRecommendation) => {
    if (expandedId === rec.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(rec.id);
    if (detailsById[rec.id]) return;

    setDetailsLoadingId(rec.id);
    try {
      const weeks = await getTemplateDetails(rec.id);
      setDetailsById(prev => ({ ...prev, [rec.id]: weeks }));
    } catch (err: any) {
      Alert.alert('FAILED TO LOAD DETAILS', err.message?.toUpperCase() || 'PLEASE TRY AGAIN.');
      setExpandedId(null);
    } finally {
      setDetailsLoadingId(null);
    }
  };

  const headerBar = (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
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
        <LinearGradient
          colors={['#7E57C2', '#FF5252', '#FF7043']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerLine}
        />

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
          <LinearGradient
            key={rec.id}
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardBorder}
          >
            <View style={[styles.card, { backgroundColor: theme.card.background }]}>
              {index === 0 && (
                <View style={[styles.recommendedBadge, { backgroundColor: bronzeGold }]}>
                  <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
                </View>
              )}
              <Text style={[styles.cardTitle, { color: theme.text.primary }]}>{rec.template_name.toUpperCase()}</Text>
              {rec.description ? (
                <Text style={{ color: theme.text.secondary, fontFamily: 'Barlow-Regular', fontSize: 13, marginTop: 6 }}>
                  {rec.description}
                </Text>
              ) : null}
              <Text style={[styles.cardMeta, { color: bronzeGold }]}>
                TIER {rec.tier_range.min}-{rec.tier_range.max} • {rec.training_days_per_week} DAY(S)/WEEK
                {rec.week_count > 1 ? ` • ${rec.week_count} WEEKS` : ''}
              </Text>
              {rec.equipment_tags.length > 0 && (
                <Text style={{ color: theme.text.tertiary, fontFamily: 'Barlow-Regular', fontSize: 12, marginTop: 6 }}>
                  EQUIPMENT: {rec.equipment_tags.join(', ')}
                </Text>
              )}

              <TouchableOpacity
                style={styles.detailsBtn}
                onPress={() => handleToggleDetails(rec)}
                activeOpacity={0.7}
              >
                <Text style={[styles.detailsBtnText, { color: theme.text.secondary }]}>
                  {expandedId === rec.id ? 'HIDE DETAILS ▲' : 'VIEW DETAILS ▼'}
                </Text>
              </TouchableOpacity>

              {expandedId === rec.id && (
                <View style={[styles.detailsPanel, { borderColor: theme.card.border }]}>
                  {detailsLoadingId === rec.id ? (
                    <LeapLogo size={28} animated />
                  ) : (detailsById[rec.id] || []).map((week, weekIdx) => (
                    <View key={week.weekNumber} style={weekIdx > 0 ? { marginTop: 16 } : undefined}>
                      {(detailsById[rec.id] || []).length > 1 && (
                        <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 13, letterSpacing: 1, marginBottom: 6 }}>
                          WEEK {week.weekNumber}
                        </Text>
                      )}
                      {week.blocks.map((block, blockIdx) => (
                        <View key={blockIdx} style={blockIdx > 0 ? { marginTop: 12 } : undefined}>
                          <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
                            {block.day.toUpperCase()}{block.blockName ? ` — ${block.blockName.toUpperCase()}` : ''}
                          </Text>
                          {block.exercises.map((ex, exIdx) => (
                            <Text key={exIdx} style={{ color: theme.text.secondary, fontFamily: 'Barlow-Regular', fontSize: 12, marginTop: 4 }}>
                              • {ex.name}{ex.sets != null && ex.reps != null ? `  ${ex.sets}×${ex.reps}` : ''}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.selectBtn, { backgroundColor: bronzeGold, opacity: selectingId === rec.id ? 0.6 : 1 }]}
                onPress={() => handleSelect(rec)}
                disabled={selectingId !== null}
              >
                <Text style={styles.selectBtnText}>
                  {selectingId === rec.id ? 'STARTING...' : 'START THIS PROGRAM'}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        ))}
      </ScrollView>
    </View>
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
  headerLine: {
    height: 1.5,
    width: '100%',
    marginBottom: 20,
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
  cardBorder: {
    padding: 1.2,
    borderRadius: 12,
    marginBottom: 16,
  },
  card: {
    borderRadius: 11,
    padding: 20,
  },
  recommendedBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  recommendedBadgeText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  cardTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    letterSpacing: 1,
  },
  cardMeta: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  detailsBtn: {
    marginTop: 12,
    alignItems: 'center',
  },
  detailsBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  detailsPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  selectBtn: {
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  selectBtnText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
});
