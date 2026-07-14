import { useRouter } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal,
  Dimensions, Vibration, AppState, Keyboard } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCountryFlag } from '../constants/countries';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  STATIC_MOVEMENTS, STATIC_LEVELS, STATIC_CATEGORIES,
  getCategoryMovements, getLevelMovements, StaticMovement
} from '../lib/staticLogic';
import { StaticService, StaticLeaderboardEntry, StaticLevelLeaderboardEntry } from '../services/StaticService';
import { useTimer } from '../hooks/useTimer';
import { WarriorButton } from '../components/atoms/WarriorButton';
import { WarriorCard } from '../components/atoms/WarriorCard';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import { LeapLogo } from '../components/LeapLogo';
import { useSafeAsync } from '../hooks/useSafeAsync';
import { useMountedRef } from '../hooks/useMountedRef';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { useTutorialTarget } from '../hooks/useTutorialTarget';
import { PBOverwriteConfirmModal } from '../components/PBOverwriteConfirmModal';


const { width } = Dimensions.get('window');

interface StaticWorldScreenProps {
  onClose?: () => void;
}

// Map categories to professional icons
const CATEGORY_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  handstand: 'hand-pointing-up',
  front_lever: 'angle-right',
  back_lever: 'rotate-right',
  planche: 'diamond-stone',
};

export function StaticWorldScreen({ onClose }: StaticWorldScreenProps) {
  const { theme, mode } = useTheme();
  const isDark = mode === 'dark';
  const { user, profile, refreshProfile } = useAuth();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave } = useSafeAsync();
  const { ref: scoreCircleRef, onLayout: onScoreCircleLayout } = useTutorialTarget('static.scoreCircle');
  const { ref: movementRowRef, onLayout: onMovementRowLayout } = useTutorialTarget('static.movementRow');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StaticMovement | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | null>(null);
  const [entries, setEntries] = useState<StaticLeaderboardEntry[]>([]);
  const [levelEntries, setLevelEntries] = useState<StaticLevelLeaderboardEntry[]>([]);
  const [wellRoundedEntries, setWellRoundedEntries] = useState<any[]>([]);
  const [personalBest, setPersonalBest] = useState<StaticLeaderboardEntry | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<number | null>(null);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  // Community scope — must trigger a server-side refetch (RPCs cap at 100
  // rows before any filter), unlike genderFilter which filters client-side
  // on the already-fetched, already-limited data. Derived fresh each render
  // from profile.community_id rather than mirrored into its own useState
  // via a syncing useEffect — that version fetched once at mount with the
  // stale 'public' default (profile hadn't loaded yet) and again once the
  // sync effect corrected it, and whichever in-flight request resolved
  // last won, regardless of which was actually current. A derived value is
  // correct on the very first render that has real profile data, so the
  // fetch effects below only fire once for that transition.
  const [manualStaticScope, setManualStaticScope] = useState<'public' | 'community' | null>(null);
  const staticScope: 'public' | 'community' = manualStaticScope ?? (profile?.community_id ? 'community' : 'public');
  const setStaticScope = setManualStaticScope;

  const filteredWellRoundedEntries = React.useMemo(() => {
    let list = wellRoundedEntries;
    if (genderFilter !== 'ALL') {
      list = wellRoundedEntries.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [wellRoundedEntries, genderFilter]);
  const [loading, setLoading] = useState(false);
  const [showGlobalMastery, setShowGlobalMastery] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'overall' | 'handstand' | 'front_lever' | 'back_lever' | 'planche'>('overall');
  const [selectedExerciseCategory, setSelectedExerciseCategory] = useState<'handstand' | 'front_lever' | 'back_lever' | 'planche'>('handstand');
  
  const [showLogModal, setShowLogModal] = useState(false);
  const [userHolds, setUserHolds] = useState<Record<string, number>>({});
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ stat: '', movement: '' });

  useEffect(() => {
    loadAllData();
  }, [user]);

  useEffect(() => {
    fetchLeaderboard();
  }, [leaderboardTab, selectedLevel, staticScope]);

  useEffect(() => {
    if (selectedLevel) {
      loadLevelData();
    }
  }, [selectedLevel, staticScope]);

  useEffect(() => {
    if (selectedMovement && showLogModal) {
      loadMovementData();
    }
  }, [selectedMovement, showLogModal, staticScope]);

  async function loadAllData() {
    if (!user) return;
    setLoading(true);
    try {
      const holds = await StaticService.getUserHolds(user.id);
      const holdMap: Record<string, number> = {};
      holds.forEach(h => { holdMap[h.movement_id] = h.hold_seconds; });
      if (!isMounted.current) return;
      setUserHolds(holdMap);

      const scopeCommunityId = staticScope === 'community' ? profile?.community_id : null;
      const elite = await StaticService.getWellRoundedLeaderboard(user.id, scopeCommunityId);
      if (!isMounted.current) return;
      setWellRoundedEntries(elite);
    } catch (error) {
      console.error('[StaticWorld] Error loading data:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  async function fetchLeaderboard() {
    if (!user) return;
    try {
      if (leaderboardTab === 'overall') {
        const scopeCommunityId = staticScope === 'community' ? profile?.community_id : null;
        const elite = await StaticService.getWellRoundedLeaderboard(user.id, scopeCommunityId);
        if (!isMounted.current) return;
        setWellRoundedEntries(elite);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMovementData() {
    if (!selectedMovement || !user) return;
    try {
      const scopeCommunityId = staticScope === 'community' ? profile?.community_id : null;
      const { entries: e, personalBest: pb } = await StaticService.getMovementLeaderboard(selectedMovement.id, user.id, scopeCommunityId);
      if (!isMounted.current) return;
      setEntries(e);
      setPersonalBest(pb);
    } catch (e) {
      console.error('Error loading movement data:', e);
    }
  }

  async function loadLevelData() {
    if (!selectedLevel || !user) return;
    setLoading(true);
    try {
      const scopeCommunityId = staticScope === 'community' ? profile?.community_id : null;
      const e = await StaticService.getLevelLeaderboard(selectedLevel, user.id, scopeCommunityId);
      if (!isMounted.current) return;
      setLevelEntries(e);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  async function refreshUserHolds() {
    if (user) {
      const holds = await StaticService.getUserHolds(user.id);
      const holdMap: Record<string, number> = {};
      holds.forEach(h => { holdMap[h.movement_id] = h.hold_seconds; });
      if (!isMounted.current) return;
      setUserHolds(holdMap);
    }
  }

  // Preparation intervals and control handlers moved to StaticWorkoutLogModal

  async function handleSaveHold(seconds: number, force: boolean = false) {
    if (!selectedMovement || !user || seconds <= 0) return;

    // Below the current best — ask before silently discarding it (or, if
    // force is true, this IS the user's confirmed choice to overwrite).
    // Strictly less-than (not <=): submit_static_hold treats a tied time as
    // "not a new PB" but also not worse — a tie should just no-op silently
    // like before, not surface a misleading "below your best" prompt.
    if (!force && personalBest && seconds < personalBest.best_time_seconds) {
      // Manual-entry mode leaves the keyboard open when this fires — the
      // overwrite overlay renders inside this same modal, but the native
      // keyboard sits above everything regardless of RN zIndex, so without
      // an explicit dismiss it can cover the overlay's buttons with no way
      // to close it (no input on the overlay itself to blur).
      Keyboard.dismiss();
      setPendingOverwrite(seconds);
      return;
    }

    let shouldCelebrate = false;

    setLoading(true);
    runSafeSave(async () => {
      const isPB = await StaticService.saveHold(user.id, selectedMovement.id, seconds, force);

      if (isPB) {
        if (isMounted.current) {
          setCelebrationData({
            stat: `${seconds}s`,
            movement: selectedMovement?.name || 'Movement'
          });
          shouldCelebrate = true;
        }
      }

      if (!isPB) {
        if (Platform.OS === 'web') alert('Hold logged successfully');
        else Alert.alert('Success', 'Hold logged successfully');
      }

      const scopeCommunityId = staticScope === 'community' ? profile?.community_id : null;
      await Promise.all([
        loadMovementData(),
        refreshUserHolds(),
        StaticService.getWellRoundedLeaderboard(user.id, scopeCommunityId)
          .then(elite => { if (isMounted.current) setWellRoundedEntries(elite); })
          .catch(e => console.error('Error refreshing elite leaderboard:', e)),
        selectedLevel ? loadLevelData() : Promise.resolve(),
        refreshProfile ? refreshProfile() : Promise.resolve(),
      ]);
    }, {
      onSuccess: () => {
        setLoading(false);
        setPendingOverwrite(null);
        if (isMounted.current) setShowLogModal(false);

        // Defer celebration after log modal fully dismisses (iOS overlapping modal bug)
        if (shouldCelebrate && isMounted.current) {
          setTimeout(() => {
            if (isMounted.current) {
              setShowCelebration(true);
            }
          }, 400);
        }
      },
      onError: (error: any) => {
        setLoading(false);
        setPendingOverwrite(null);
        // P1001-P1004 are submit_static_hold's own anti-cheat validation
        // (negative time / invalid movement / ceiling exceeded / cooldown
        // active) - expected outcomes, not bugs, so skip the console noise
        // and just show the message. Mirrors TrialScreen's DISHONOR handling.
        const isAntiCheatRejection = ['P1001', 'P1002', 'P1003', 'P1004'].includes(error.code);
        if (!isAntiCheatRejection) {
          console.error('Error saving hold:', error);
        }
        const msg = error.message || 'Failed to save hold';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Error', msg);
      }
    });
  }

  const MasteryRings = ({ size = 180, centerText, topText, bottomText, subText, showCrown = false, active = false, rankMode = false }: any) => {
    return (
      <View style={[styles.ringsContainer, { width: size, height: size }]}>
        <View
          style={[
            styles.masteryRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: active ? 2 : 1,
              borderColor: '#7E57C2',
              backgroundColor: active ? '#7E57C215' : 'transparent',
              opacity: active ? 1 : 0.4
            }
          ]}
        />
        <View style={styles.ringsCenter}>
          {!rankMode && topText && (
            <Text style={[styles.heroTopText, { color: '#7E57C2', fontSize: size * 0.06 }]}>
              {topText?.toUpperCase()}
            </Text>
          )}
          
          <View style={{ alignItems: 'center', gap: 2 }}>
            {showCrown && (
               <MaterialCommunityIcons name="crown" size={size * 0.12} color="#7E57C2" style={{ marginBottom: -2 }} />
            )}
            
            <Text style={[styles.ringsValue, { color: theme.text.primary, fontSize: size * 0.25 }]}>{centerText}</Text>
            
            {subText && (
               <Text style={{ color: '#7E57C2', fontSize: size * 0.12, fontWeight: '900', marginTop: -2 }}>
                 {subText}
               </Text>
            )}
          </View>

          {!rankMode && bottomText && (
            <Text style={[styles.heroBottomText, { color: '#7E57C2', fontSize: size * 0.06 }]}>
              {bottomText?.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderLapHeader = () => (
    <View style={styles.header}>
      <View style={{ width: 40 }} />

      <TouchableOpacity
        onPress={() => setShowGlobalMastery(true)}
        style={[
          styles.headerTitleContainer,
          { 
            borderColor: '#7E57C2', 
            borderWidth: 1,
            backgroundColor: '#7E57C220'
          }
        ]}
      >
        <Text style={[
          styles.headerTitle, 
          { color: theme.text.primary }
        ]}>STATIC WORLD</Text>
      </TouchableOpacity>
      
      <View style={{ width: 40 }} />
    </View>
  );

  const peakData = React.useMemo(() => {
    const peaks: Record<string, number> = {
      handstand: 0,
      front_lever: 0,
      back_lever: 0,
      planche: 0
    };

    STATIC_MOVEMENTS.forEach(m => {
      const seconds = userHolds[m.id] || 0;
      const points = seconds * m.multiplier;
      if (points > peaks[m.category]) {
        peaks[m.category] = points;
      }
    });

    const total = Object.values(peaks).reduce((sum, p) => sum + p, 0);
    return { ...peaks, total };
  }, [userHolds]);

  const personalEntry = wellRoundedEntries.find(e => e.user_id === user?.id);
  const userRank = personalEntry?.rank || 0;
  const displayScore = personalEntry ? Number(personalEntry.total_points) : Number(peakData.total);
  
  let gapToNext = 0;
  if (userRank > 1 && wellRoundedEntries.length > 0) {
    const targetRank = userRank - 1;
    const personAbove = wellRoundedEntries.find(e => e.rank === targetRank);
    if (personAbove) {
      gapToNext = Math.ceil(personAbove.total_points - displayScore);
    }
  }

  return (
    <GlobalErrorBoundary>
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {renderLapHeader()}
      
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.dashboard}>
          <View style={{ alignItems: 'center', marginBottom: -10 }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: '#7E57C2', letterSpacing: 3 }}>OVERALL STATIC</Text>
          </View>

          <View style={styles.heroRow}>
             <MasteryRings 
                size={80} 
                topText="STATIC RANK" 
                centerText={`#${personalEntry?.rank || '--'}`} 
                bottomText="OF WORLD"
                showCrown={personalEntry?.rank === 1}
             />
             <TouchableOpacity
                ref={scoreCircleRef}
                onLayout={onScoreCircleLayout}
                onPress={() => setShowGlobalMastery(true)}
                activeOpacity={0.8}
             >
               <View style={{ position: 'relative' }}>
                   <MasteryRings 
                     size={100} 
                     topText="STATIC SCORE" 
                     centerText={typeof displayScore === 'number' ? displayScore.toFixed(2) : displayScore} 
                     bottomText="TOTAL PTS"
                     active
                     showCrown={true}
                  />
                 <View style={[styles.heroAddIcon, { backgroundColor: '#7E57C2' }]}>
                   <MaterialCommunityIcons name="chart-bar" size={14} color="#000" />
                 </View>
               </View>
             </TouchableOpacity>
             <MasteryRings 
                size={80} 
                topText="GAP TO" 
                centerText={userRank === 1 ? 'KING' : `+${gapToNext}`} 
                bottomText="RANK UP"
             />
          </View>

          <Text style={[styles.sectionHeader, { color: '#7E57C2' }]}>YOUR PEAK PERFORMANCE</Text>
          
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            <TouchableOpacity 
              onPress={() => setSelectedLevel(null)}
              style={{
                flex: 1.6,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: selectedLevel === null ? '#7E57C2' : 'rgba(126,87,194,0.3)',
                backgroundColor: selectedLevel === null ? '#7E57C220' : 'rgba(255,255,255,0.02)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4
              }}
            >
              <Text style={{ fontSize: 9, fontWeight: '900', color: theme.text.primary, letterSpacing: 1 }}>OVERALL STATIC</Text>
              <MaterialCommunityIcons name="crown" size={12} color={selectedLevel === null ? '#7E57C2' : theme.text.tertiary} />
            </TouchableOpacity>

            {([1, 2, 3] as const).map(lvl => {
              const isActive = selectedLevel === lvl;
              const lvlInfo = (STATIC_LEVELS as any)[lvl];
              return (
                <TouchableOpacity 
                  key={lvl}
                  onPress={() => setSelectedLevel(isActive ? null : lvl)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: isActive ? '#7E57C2' : 'rgba(126,87,194,0.3)',
                    backgroundColor: isActive ? '#7E57C220' : 'rgba(255,255,255,0.02)',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '900', color: theme.text.primary, letterSpacing: 1 }}>
                    {lvlInfo.name.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.exerciseFilter, { marginBottom: 20 }]}>
            {['handstand', 'front_lever', 'back_lever', 'planche'].map(cat => {
              const isActive = selectedExerciseCategory === cat;
              return (
                <TouchableOpacity 
                  key={cat}
                  onPress={() => setSelectedExerciseCategory(cat as any)}
                  style={[
                    styles.exerciseFilterTab,
                    isActive && { backgroundColor: '#7E57C2', borderColor: '#7E57C2' }
                  ]}
                >
                  <Text style={[styles.exerciseFilterText, { color: isActive ? '#000' : theme.text.tertiary }]}>
                    {cat.toUpperCase().replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.peakGrid} ref={movementRowRef} onLayout={onMovementRowLayout}>
            {STATIC_MOVEMENTS.filter(m => m.category === selectedExerciseCategory).map(m => {
              const pb = userHolds[m.id] || 0;
              return (
                <TouchableOpacity 
                  key={m.id} 
                  style={styles.peakItem}
                  onPress={() => {
                    setSelectedMovement(m);
                    setShowLogModal(true);
                  }}
                >
                  <View style={styles.peakCircleWrapper}>
                    <MasteryRings 
                      size={width * 0.15}
                      centerText={pb > 0 ? Math.round(pb) : '0'}
                      subText="SEC"
                      rankMode
                    />
                    <View style={[styles.peakAddIcon, { backgroundColor: '#7E57C2' }]}>
                      <MaterialCommunityIcons name="timer-outline" size={12} color="#000" />
                    </View>
                  </View>
                  <Text style={[styles.peakNameText, { color: theme.text.primary, height: 30 }]} numberOfLines={2}>
                    {m.name.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.leaderboardSection}>
            {selectedLevel ? (
              <View style={styles.lbSection}>
                <Text style={[styles.lbTitle, { color: '#7E57C2' }]}>
                  {STATIC_LEVELS[selectedLevel].name.toUpperCase()} ELITE
                </Text>
                <Text style={[styles.lbSub, { color: theme.text.tertiary }]}>THE HIGHEST TIER WARRIOR</Text>
              </View>
            ) : (
              <View style={{
                marginTop: 20,
                padding: 24,
                borderRadius: 24,
                backgroundColor: 'rgba(126, 87, 194, 0.05)',
                borderWidth: 1,
                borderColor: 'rgba(126, 87, 194, 0.2)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <MaterialCommunityIcons name={userRank === 1 ? "crown" : "sword-cross"} size={28} color="#7E57C2" />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ color: isDark ? '#FFF' : '#7E57C2', fontSize: 18, fontWeight: '800' }}>
                      {userRank === 1 
                        ? 'STATIC KING ACHIEVED'
                        : userRank > 0 ? `${gapToNext} Points to steal Rank #${userRank - 1}` : 'LOG A HOLD TO RANK UP'}
                    </Text>
                    <Text style={{ color: theme.text.secondary, fontSize: 12, marginTop: 2, fontWeight: '600' }}>
                      {userRank === 1 ? 'YOU ARE AT THE PEAK' : 'YOUR NEXT TARGET'}
                    </Text>
                  </View>
                </View>
                <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ 
                    height: '100%', 
                    backgroundColor: '#7E57C2', 
                    width: userRank <= 1 ? '100%' : `${Math.min(100, Math.max(0, (displayScore / (displayScore + gapToNext)) * 100))}%`
                  }} />
                </View>
                {userRank > 1 && (
                  <Text style={{ color: '#7E57C2', fontSize: 12, marginTop: 8, textAlign: 'right', fontWeight: '800', letterSpacing: 1 }}>
                    +{gapToNext} PTS TO DETHRONE
                  </Text>
                )}
              </View>
            )}

            {!!selectedLevel && !!profile?.community_id && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 12 }}>
                {(['public', 'community'] as const).map((scope) => (
                  <TouchableOpacity
                    key={scope}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 16,
                      borderRadius: 20,
                      backgroundColor: staticScope === scope ? '#7E57C2' : 'rgba(255,255,255,0.05)',
                      borderWidth: 1,
                      borderColor: staticScope === scope ? '#7E57C2' : 'rgba(255,255,255,0.1)'
                    }}
                    onPress={() => setStaticScope(scope)}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '900',
                      color: staticScope === scope ? '#FFF' : theme.text.secondary
                    }}>
                      {scope === 'public' ? 'PUBLIC' : 'MY COMMUNITY'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!selectedLevel ? null : (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, marginTop: 8, gap: 12 }}>
                {['ALL', 'MALE', 'FEMALE'].map((filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 16,
                      borderRadius: 20,
                      backgroundColor: genderFilter === filter ? '#7E57C2' : 'rgba(255,255,255,0.05)',
                      borderWidth: 1,
                      borderColor: genderFilter === filter ? '#7E57C2' : 'rgba(255,255,255,0.1)'
                    }}
                    onPress={() => setGenderFilter(filter as any)}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '900',
                      color: genderFilter === filter ? '#FFF' : theme.text.secondary
                    }}>
                      {filter}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            {selectedLevel && levelEntries.map((item, i) => (
              <View key={item.user_id} style={[styles.lbRow, { backgroundColor: item.user_id === user?.id ? '#7E57C220' : 'transparent' }]}>
                <View style={[styles.lbRank, { backgroundColor: i < 3 ? '#7E57C230' : 'transparent' }]}>
                  <Text style={{ color: i === 0 ? '#7E57C2' : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
                </View>
                <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                  {item.display_name.toUpperCase()}
                </Text>
                <View style={[styles.lbPointsFrame, { backgroundColor: '#7E57C2' }]}>
                  <Text style={[styles.lbPointsText, { color: '#000' }]}>{Number(item.total_points || 0).toFixed(2)}</Text>
                </View>
              </View>
            ))}

            {/* Ambient Quote */}
            {!selectedLevel && (
              <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 40 }}>
                <Text style={{ 
                  color: theme.text.tertiary, 
                  fontSize: 10, 
                  fontFamily: 'PlusJakartaSans-SemiBold',
                  letterSpacing: 3,
                  textTransform: 'uppercase'
                }}>
                  LEAP INTO THE HOLD. DEFY GRAVITY.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <BottomTabBar activeTab="static" strengthTier={profile?.strength_tier || 0} />

      <Modal visible={showGlobalMastery} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, maxHeight: '85%' }]}>
             <View style={styles.modalHeader}>
                <View style={styles.modalTitleBox}>
                   <MaterialCommunityIcons name="crown" size={24} color="#7E57C2" />
                   <Text style={[styles.modalTitle, { color: theme.text.primary, marginLeft: 8 }]}>
                     STATIC MASTERY
                   </Text>
                </View>
                <TouchableOpacity onPress={() => setShowGlobalMastery(false)}>
                  <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
                </TouchableOpacity>
             </View>
             
             <Text style={[styles.modalSub, { color: theme.text.tertiary }]}>GLOBAL STATIC RANKINGS</Text>

             {!!profile?.community_id && (
               <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 12 }}>
                 {(['public', 'community'] as const).map((scope) => (
                   <TouchableOpacity
                     key={scope}
                     style={{
                       paddingVertical: 6,
                       paddingHorizontal: 16,
                       borderRadius: 20,
                       backgroundColor: staticScope === scope ? '#7E57C2' : 'rgba(255,255,255,0.05)',
                       borderWidth: 1,
                       borderColor: staticScope === scope ? '#7E57C2' : 'rgba(255,255,255,0.1)'
                     }}
                     onPress={() => setStaticScope(scope)}
                   >
                     <Text style={{
                       fontSize: 12,
                       fontWeight: '900',
                       color: staticScope === scope ? '#FFF' : theme.text.secondary
                     }}>
                       {scope === 'public' ? 'PUBLIC' : 'MY COMMUNITY'}
                     </Text>
                   </TouchableOpacity>
                 ))}
               </View>
             )}

             <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, marginTop: 16, gap: 12 }}>
               {['ALL', 'MALE', 'FEMALE'].map((filter) => (
                 <TouchableOpacity
                   key={filter}
                   style={{
                     paddingVertical: 6,
                     paddingHorizontal: 16,
                     borderRadius: 20,
                     backgroundColor: genderFilter === filter ? '#7E57C2' : 'rgba(255,255,255,0.05)',
                     borderWidth: 1,
                     borderColor: genderFilter === filter ? '#7E57C2' : 'rgba(255,255,255,0.1)'
                   }}
                   onPress={() => setGenderFilter(filter as any)}
                 >
                   <Text style={{ 
                     fontSize: 12, 
                     fontWeight: '900', 
                     color: genderFilter === filter ? '#FFF' : theme.text.secondary 
                   }}>
                     {filter}
                   </Text>
                 </TouchableOpacity>
               ))}
             </View>

             <ScrollView style={{ marginTop: 20 }}>
                {filteredWellRoundedEntries.map((item, i) => (
                  <View key={item.user_id} style={[styles.lbRow, item.user_id === user?.id && { backgroundColor: '#7E57C220', borderColor: '#7E57C2', borderWidth: 1 }]}>
                    <View style={[styles.lbRank, { backgroundColor: i < 3 ? '#7E57C230' : 'transparent' }]}>
                      <Text style={{ color: i === 0 ? '#7E57C2' : theme.text.secondary, fontWeight: '900' }}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                      <Text style={{ fontSize: 16 }}>{getCountryFlag((item as any).country)} </Text>
                      {item.display_name.toUpperCase()}
                    </Text>
                    <View style={[styles.lbPointsFrame, { backgroundColor: '#7E57C2' }]}>
                      <Text style={[styles.lbPointsText, { color: '#000' }]}>{Number(item.total_points || 0).toFixed(2)} PTS</Text>
                    </View>
                  </View>
                ))}
             </ScrollView>
          </View>
        </View>
      </Modal>

      {showLogModal && (
        <StaticWorkoutLogModal
          visible={showLogModal}
          onClose={() => setShowLogModal(false)}
          selectedMovement={selectedMovement}
          personalBest={personalBest}
          entries={entries}
          user={user}
          theme={theme}
          onSaveHold={handleSaveHold}
          overwriteOverlay={
            <PBOverwriteConfirmModal
              visible={pendingOverwrite !== null}
              theme={theme}
              accentColor="#7E57C2"
              movementName={selectedMovement?.name || ''}
              unitLabel="s"
              currentBest={personalBest?.best_time_seconds ?? 0}
              attemptValue={pendingOverwrite ?? 0}
              saving={loading}
              onKeepBest={() => setPendingOverwrite(null)}
              onSaveAnyway={() => {
                const seconds = pendingOverwrite;
                if (seconds !== null) handleSaveHold(seconds, true);
              }}
            />
          }
        />
      )}

      <CelebrationBanner
        visible={showCelebration}
        title={celebrationData.movement?.toUpperCase()}
        subtitle="NEW PR"
        stat={celebrationData.stat}
        emoji="💎"
        userName={profile?.display_name || user?.email?.split('@')[0] || 'Warrior'}
        onDismiss={() => setShowCelebration(false)}
        headerText="STATIC WORLD"
        showLeapLogo={true}
        accentColor="#7E57C2"
      />
      </View>
    </GlobalErrorBoundary>
  );
}

interface StaticWorkoutLogModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMovement: any;
  personalBest: any;
  entries: any[];
  user: any;
  theme: any;
  onSaveHold: (seconds: number) => Promise<void>;
  // Rendered as the last child inside this modal's own content — NOT a
  // second <Modal>, since two simultaneously-open native Modals on iOS can
  // freeze the app (see PBOverwriteConfirmModal's own comment).
  overwriteOverlay?: React.ReactNode;
}

const StaticWorkoutLogModal: React.FC<StaticWorkoutLogModalProps> = ({
  visible,
  onClose,
  selectedMovement,
  personalBest,
  entries,
  user,
  theme,
  onSaveHold,
  overwriteOverlay
}) => {
  const { seconds: timerSeconds, isRunning: timerRunning, start: startTimer, stop: stopTimer, reset: resetTimer } = useTimer();
  const [isPreparing, setIsPreparing] = useState(false);
  const [preCountdown, setPreCountdown] = useState(0);
  const [saving, setSaving] = useState(false);
  // Lets a user skip the live timer entirely (manualMode) and type a known
  // hold time directly, or adjust the captured value after stopping the
  // timer before it's logged — both feed the same enteredSeconds field
  // that actually gets saved, rather than the raw timer reading.
  const [manualMode, setManualMode] = useState(false);
  const [enteredSeconds, setEnteredSeconds] = useState('');
  const isMounted = useMountedRef();
  const prepStartTimeRef = useRef<number | null>(null);
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-fill the review field with the captured time the moment the timer
  // stops, so the user can adjust it before logging rather than only ever
  // seeing a read-only number.
  useEffect(() => {
    if (!timerRunning && timerSeconds > 0 && !manualMode) {
      setEnteredSeconds(String(timerSeconds));
    }
  }, [timerRunning, timerSeconds, manualMode]);

  useEffect(() => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);

    if (isPreparing) {
      if (!prepStartTimeRef.current) {
        prepStartTimeRef.current = Date.now();
      }
      SoundService.playTick();

      const sub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active' && prepStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - prepStartTimeRef.current) / 1000);
          if (elapsed >= 5) {
            setIsPreparing(false);
            setPreCountdown(0);
            SoundService.playBoxingBell();
            Vibration.vibrate(100);
            startTimer(elapsed - 5);
            if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          }
        }
      });

      prepTimerRef.current = setInterval(() => {
        if (prepStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - prepStartTimeRef.current) / 1000);
          const remaining = 5 - elapsed;

          if (remaining <= 0) {
            setIsPreparing(false);
            setPreCountdown(0);
            SoundService.playBoxingBell();
            Vibration.vibrate(100);
            startTimer(elapsed - 5);
            if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          } else {
            setPreCountdown(prev => {
              if (prev !== remaining) {
                SoundService.playTick();
              }
              return remaining;
            });
          }
        }
      }, 250);

      return () => {
        sub.remove();
        if (prepTimerRef.current) clearInterval(prepTimerRef.current);
      };
    } else {
      prepStartTimeRef.current = null;
    }
  }, [isPreparing]);

  const handleStartWithLeadIn = () => {
    setPreCountdown(5);
    prepStartTimeRef.current = Date.now();
    setIsPreparing(true);
    resetTimer();
    setEnteredSeconds('');
  };

  const cancelPreparation = () => {
    setIsPreparing(false);
    setPreCountdown(0);
    prepStartTimeRef.current = null;
    if (prepTimerRef.current) {
      clearInterval(prepTimerRef.current);
      prepTimerRef.current = null;
    }
    resetTimer();
  };

  const handleReset = () => {
    resetTimer();
    setEnteredSeconds('');
  };

  const handleEnterManually = () => {
    setManualMode(true);
    setEnteredSeconds('');
  };

  const handleUseTimerInstead = () => {
    setManualMode(false);
    resetTimer();
    setEnteredSeconds('');
  };

  const handleClose = () => {
    if (timerRunning || isPreparing) {
      Alert.alert(
        'Cancel Test?',
        'You have a timer currently running. Are you sure you want to cancel and exit?',
        [
          { text: 'Keep Going', style: 'cancel' },
          { text: 'Cancel Test', style: 'destructive', onPress: () => {
            if (timerRunning) stopTimer();
            setIsPreparing(false);
            setPreCountdown(0);
            prepStartTimeRef.current = null;
            if (prepTimerRef.current) {
              clearInterval(prepTimerRef.current);
              prepTimerRef.current = null;
            }
            resetTimer();
            setEnteredSeconds('');
            setManualMode(false);
            onClose();
          }}
        ]
      );
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    const seconds = parseInt(enteredSeconds, 10);
    if (isNaN(seconds) || seconds <= 0) {
      Alert.alert('Invalid', 'Please enter a valid hold time in seconds.');
      return;
    }
    setSaving(true);
    try {
      await onSaveHold(seconds);
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.background.primary, maxHeight: '90%' }]}>
           <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.modalTitle, { color: theme.text.primary }]} numberOfLines={2}>
                  {selectedMovement?.name.toUpperCase()}
                </Text>
                {personalBest ? (
                  <Text style={{ color: '#7E57C2', fontSize: 11, fontWeight: '900', marginTop: 4, letterSpacing: 1 }}>
                    YOUR BEST: {personalBest.best_time_seconds}s (RANK #{personalBest.rank})
                  </Text>
                ) : (
                  <Text style={{ color: theme.text.tertiary, fontSize: 11, fontWeight: '900', marginTop: 4, letterSpacing: 1 }}>
                    YOUR BEST: -- (UNRANKED)
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={handleClose}>
                 <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
           </View>

           <View style={styles.timerContainer}>
              {manualMode ? (
                <>
                  <View style={styles.timerInputRow}>
                    <TextInput
                      style={[styles.timerText, styles.timerInput, { color: theme.text.primary, borderColor: '#7E57C2' }]}
                      keyboardType="numeric"
                      value={enteredSeconds}
                      onChangeText={setEnteredSeconds}
                      placeholder="0"
                      placeholderTextColor={theme.text.tertiary}
                      autoFocus
                    />
                    <Text style={[styles.timerText, { color: theme.text.primary }]}>s</Text>
                  </View>
                  <Text style={[styles.timerSub, { color: theme.text.tertiary }]}>ENTER HOLD TIME MANUALLY</Text>
                </>
              ) : !isPreparing && !timerRunning && timerSeconds > 0 ? (
                <>
                  <View style={styles.timerInputRow}>
                    <TextInput
                      style={[styles.timerText, styles.timerInput, { color: theme.text.primary, borderColor: '#7E57C2' }]}
                      keyboardType="numeric"
                      value={enteredSeconds}
                      onChangeText={setEnteredSeconds}
                    />
                    <Text style={[styles.timerText, { color: theme.text.primary }]}>s</Text>
                  </View>
                  <Text style={[styles.timerSub, { color: theme.text.tertiary }]}>ADJUST IF NEEDED, THEN LOG</Text>
                </>
              ) : (
                <>
                  <Text style={[
                    styles.timerText,
                    { color: isPreparing ? '#7E57C2' : theme.text.primary }
                  ]}>
                    {isPreparing ? `${preCountdown}s` : `${timerSeconds}s`}
                  </Text>
                  <Text style={[styles.timerSub, { color: theme.text.tertiary }]}>
                    {isPreparing ? 'GET READY' : 'ACTIVE HOLD TIME'}
                  </Text>
                </>
              )}
           </View>

           {isPreparing ? (
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: theme.text.tertiary }]}
                onPress={cancelPreparation}
              >
                <Text style={[styles.cancelBtnText, { color: theme.text.tertiary }]}>CANCEL PREPARATION</Text>
              </TouchableOpacity>
           ) : manualMode ? (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#7E57C2' }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? <LeapLogo size={40} animated /> : <Text style={styles.saveBtnText}>LOG PERFORMANCE</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: theme.text.tertiary }]}
                  onPress={handleUseTimerInstead}
                >
                  <Text style={[styles.cancelBtnText, { color: theme.text.tertiary }]}>USE TIMER INSTEAD</Text>
                </TouchableOpacity>
              </View>
           ) : (
              <View style={{ gap: 10 }}>
                {!timerRunning ? (
                  <>
                    <TouchableOpacity
                      style={[styles.startBtn, { backgroundColor: "#7E57C2" }]}
                      onPress={handleStartWithLeadIn}
                    >
                      <Text style={styles.startBtnText}>{timerSeconds > 0 ? "RESTART TEST" : "START TIMER"}</Text>
                    </TouchableOpacity>

                    {timerSeconds > 0 && (
                      <>
                        <TouchableOpacity
                          style={[styles.saveBtn, { backgroundColor: '#7E57C2' }]}
                          onPress={handleSave}
                          disabled={saving}
                        >
                          {saving ? <LeapLogo size={40} animated /> : <Text style={styles.saveBtnText}>LOG PERFORMANCE</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.cancelBtn, { borderColor: theme.text.tertiary }]}
                          onPress={handleReset}
                        >
                          <Text style={[styles.cancelBtnText, { color: theme.text.tertiary }]}>RESET / DISCARD</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {timerSeconds === 0 && (
                      <TouchableOpacity style={styles.manualEntryLink} onPress={handleEnterManually}>
                        <Text style={[styles.manualEntryLinkText, { color: theme.text.tertiary }]}>ENTER TIME MANUALLY INSTEAD</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.startBtn, { backgroundColor: "#FF5252" }]}
                      onPress={stopTimer}
                    >
                      <Text style={styles.startBtnText}>STOP & LOG</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.cancelBtn, { borderColor: "#FF5252" }]}
                      onPress={() => {
                        stopTimer();
                        handleReset();
                      }}
                    >
                      <Text style={[styles.cancelBtnText, { color: "#FF5252" }]}>CANCEL TEST</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
           )}

           <View style={{ marginTop: 30, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 20 }}>
              <Text style={[styles.sectionHeader, { fontSize: 9, marginBottom: 15, letterSpacing: 3 }]}>
                TOP PERFORMERS
              </Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }} contentContainerStyle={{ paddingBottom: 20 }}>
                 {entries.length > 0 ? entries.map((item, i) => (
                    <View key={item.user_id} style={[styles.lbRow, { paddingVertical: 8 }, item.user_id === user?.id && { backgroundColor: `${theme.accent}15`, borderColor: theme.accent, borderWidth: 1 }]}>
                       <View style={[styles.lbRank, { width: 24, height: 24, borderRadius: 12, backgroundColor: i < 3 ? `${theme.accent}20` : 'transparent' }]}>
                          <Text style={{ color: i === 0 ? theme.accent : theme.text.secondary, fontWeight: '900', fontSize: 10 }}>{i + 1}</Text>
                       </View>
                       <Text style={[styles.lbName, { color: theme.text.primary, fontSize: 11 }]} numberOfLines={1} ellipsizeMode="tail">
                         {item.display_name.toUpperCase()}
                       </Text>
                       <View style={[styles.lbPointsFrame, { backgroundColor: '#7E57C2', paddingHorizontal: 8 }]}>
                          <Text style={[styles.lbPointsText, { color: '#000', fontSize: 11 }]}>{Math.round(item.best_time_seconds)}s</Text>
                       </View>
                    </View>
                 )) : (
                    <Text style={{ textAlign: 'center', color: theme.text.tertiary, fontSize: 10, marginTop: 20 }}>
                      NO HOLD TIMES RECORDED YET
                    </Text>
                 )}
              </ScrollView>
           </View>
           {overwriteOverlay}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: { padding: 4 },
  headerTitleContainer: { 
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 25, 
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10
  },
  headerTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 2, fontFamily: 'PlusJakartaSans-ExtraBold' },
  dashboard: { paddingHorizontal: 16, paddingTop: 20, gap: 24 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%' },
  ringsContainer: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  masteryRing: { position: 'absolute' },
  ringsCenter: { alignItems: 'center', justifyContent: 'center', zIndex: 10, paddingBottom: 4 },
  ringsValue: { fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold', letterSpacing: -0.5 },
  heroTopText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5, marginBottom: 2 },
  heroBottomText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  modalTitleBox: { flexDirection: 'row', alignItems: 'center' },
  modalSub: { fontSize: 10, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginTop: -20 },
  lbSection: { marginTop: 10, alignItems: 'center', gap: 4, marginBottom: 20 },
  lbTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 3, fontFamily: 'PlusJakartaSans-ExtraBold' },
  lbSub: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, opacity: 0.6 },
  sectionHeader: { fontSize: 13, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginTop: 20, marginBottom: 10 },
  exerciseFilter: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  exerciseFilterTab: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: 'rgba(126,87,194,0.4)', 
    backgroundColor: 'rgba(255,255,255,0.02)'
  },
  exerciseFilterText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  peakGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 10, gap: 20 },
  peakItem: { alignItems: 'center', gap: 8, width: width * 0.22, marginBottom: 10 },
  peakCircleWrapper: { position: 'relative' },
  peakNameText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },
  peakAddIcon: { 
    position: 'absolute', 
    bottom: 0, 
    right: 0, 
    width: 20, 
    height: 20, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
    elevation: 4,
  },
  heroAddIcon: { 
    position: 'absolute', 
    bottom: -2, 
    right: -2, 
    width: 30, 
    height: 30, 
    borderRadius: 15, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 8,
    zIndex: 20,
  },
  leaderboardSection: { marginTop: 20 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, gap: 12 },
  lbRank: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lbName: { flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  lbPointsFrame: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 },
  lbPointsText: { fontSize: 13, fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, borderWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  modalTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  timerContainer: { alignItems: 'center', marginVertical: 40 },
  timerText: { fontSize: 80, fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold' },
  timerSub: { fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 10 },
  timerInputRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  timerInput: { minWidth: 110, textAlign: 'center', borderBottomWidth: 2, paddingVertical: 0 },
  manualEntryLink: { paddingVertical: 10, alignItems: 'center' },
  manualEntryLinkText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textDecorationLine: 'underline' },
  startBtn: { paddingVertical: 20, borderRadius: 12, alignItems: 'center' },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  saveBtn: { paddingVertical: 20, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  cancelBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 10,
  },
  cancelBtnText: {
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
  }
});
