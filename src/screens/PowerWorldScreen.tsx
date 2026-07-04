import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal,
  Dimensions, RefreshControl, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  POWER_MOVEMENTS, 
  POWER_LEVELS, 
  calculateTotalPowerScore, 
  getPowerLevel,
  calculatePowerPoints
} from '../lib/powerLogic';
import { PowerService, PowerUserStats } from '../services/PowerService';
import { useSafeAsync } from '../hooks/useSafeAsync';
import { useMountedRef } from '../hooks/useMountedRef';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { WarriorCard } from '../components/atoms/WarriorCard';
import { getCountryFlag } from '../constants/countries';
import { LeapLogo } from '../components/LeapLogo';
import { Skeleton } from '../components/Skeleton';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { BottomTabBar } from '../components/profile/BottomTabBar';


const { width } = Dimensions.get('window');

export function PowerWorldScreen({ onBack }: { onBack: () => void }) {
  const { theme, toggleTheme, mode } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave } = useSafeAsync();
  
  const [stats, setStats] = useState<PowerUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leaderboard'>('dashboard');
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [leaderboardTab, setLeaderboardTab] = useState<'glory' | 'level_1' | 'level_2' | 'level_3' | 'pull_up' | 'dip' | 'squat' | 'muscle_up'>('glory');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [modalLeaderboardData, setModalLeaderboardData] = useState<any[]>([]);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');

  const filteredLeaderboardData = React.useMemo(() => {
    let list = leaderboardData;
    if (leaderboardTab === 'glory' && genderFilter !== 'ALL') {
      list = leaderboardData.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    // Re-rank them locally based on the filtered list
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [leaderboardData, genderFilter, leaderboardTab]);
  
  // Log Modal State
  const [showLogModal, setShowLogModal] = useState(false);
  const [showOverallModal, setShowOverallModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Celebration State
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationProps, setCelebrationProps] = useState<any>({});

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const s = await PowerService.getUserStats(user.id);
      if (!isMounted.current) return;
      setStats(s);
    } catch (error) {
      console.error('Fetch error:', error);
      if (!isMounted.current) return;
      Alert.alert('Error', 'Failed to load power stats. Please check your connection.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user, isMounted]);

  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardData([]);
    try {
      const data = await PowerService.getLeaderboard(leaderboardTab as any);
      if (!isMounted.current) return;
      setLeaderboardData(data);
    } catch (error) {
      console.error('Leaderboard error:', error);
      if (!isMounted.current) return;
      Alert.alert('Error', 'Failed to load leaderboard data.');
    }
  }, [leaderboardTab, isMounted]);

  // Derive the user's glory rank from the leaderboard list already fetched above instead
  // of a separate count query. Only falls back to a direct query if they're outside the
  // top 50 the list returns.
  useEffect(() => {
    if (leaderboardTab !== 'glory' || !user || !stats || leaderboardData.length === 0) return;
    if (stats.ranks.glory) return;

    const userIdx = leaderboardData.findIndex((e: any) => e.user_id === user.id);
    if (userIdx !== -1) {
      setStats(prev => prev ? { ...prev, ranks: { ...prev.ranks, glory: userIdx + 1 } } : prev);
    } else {
      PowerService.getGloryRank(stats.totalPoints).then(rank => {
        if (!isMounted.current) return;
        setStats(prev => prev ? { ...prev, ranks: { ...prev.ranks, glory: rank } } : prev);
      });
    }
  }, [leaderboardData, leaderboardTab, user, stats, isMounted]);

  const fetchModalLeaderboard = useCallback(async (moveId: string) => {
    setModalLeaderboardData([]);
    try {
      const data = await PowerService.getLeaderboard(moveId as any);
      if (!isMounted.current) return;
      setModalLeaderboardData(data);
    } catch (error) {
      console.error('Modal Leaderboard error:', error);
      if (!isMounted.current) return;
      Alert.alert('Error', 'Failed to load movement rankings.');
    }
  }, [isMounted]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (stats) {
      setSelectedLevel(stats.level.id);
    }
  }, [stats]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
    fetchLeaderboard();
  };

  const handleSaveWeight = async () => {
    if (!user || !selectedMovement || !manualInput || saving) return;
    const kg = parseFloat(manualInput);
    if (isNaN(kg) || kg <= 0 || kg > 500) {
      Alert.alert('Invalid', 'Please enter a valid weight (0.1 - 500 kg).');
      return;
    }

    let shouldShowCelebration = false;

    setSaving(true);
    runSafeSave(async () => {
      const { isNewPB, isPromotion } = await PowerService.savePB(user.id, selectedMovement, kg);
      
      if (isNewPB) {
        const movement = POWER_MOVEMENTS.find(m => m.id === selectedMovement);
        const points = calculatePowerPoints(selectedMovement, kg);
        
        if (isMounted.current) {
          setCelebrationProps({
            title: isPromotion ? 'LEVEL PROMOTED!' : `${movement?.name?.toUpperCase()}`,
            subtitle: isPromotion ? `WELCOME TO ${getPowerLevel(stats?.totalPoints || 0).name}` : 'NEW PR',
            stat: `${kg} KG`,
            emoji: isPromotion ? '⚡' : '🔥',
            userName: profile?.display_name || 'WARRIOR',
            rank: isPromotion ? `LEVEL ${getPowerLevel(stats?.totalPoints || 0).id}` : undefined,
            headerText: 'POWER WORLD',
            showLeapLogo: true,
            accentColor: '#FF5252',
          });
          shouldShowCelebration = true;
        }
      }

      await Promise.all([
        fetchData(),
        fetchLeaderboard(),
        refreshProfile ? refreshProfile() : Promise.resolve(),
      ]);
    }, {
      onSuccess: () => {
        setSaving(false);
        setShowLogModal(false);
        setManualInput('');
        
        // Defer the celebration modal to prevent iOS multiple overlapping modals bug 
        // which causes the screen to freeze and become unresponsive
        if (shouldShowCelebration && isMounted.current) {
          setTimeout(() => {
            if (isMounted.current) {
              setShowCelebration(true);
            }
          }, 400);
        }
      },
      onError: (error: any) => {
        setSaving(false);
        console.error('Save error:', error);
        Alert.alert('Error', 'Failed to save PR.');
      }
    });
  };

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
              borderColor: '#FF5252',
              backgroundColor: active ? '#FF525210' : 'transparent',
              opacity: active ? 1 : 0.4
            }
          ]}
        />
        <View style={styles.ringsCenter}>
          {!rankMode && topText && (
            <Text style={[styles.heroTopText, { color: '#FF5252', fontSize: size * 0.06 }]}>
              {topText?.toUpperCase()}
            </Text>
          )}
          
          <View style={{ alignItems: 'center', gap: 2 }}>
            {showCrown && (
               <MaterialCommunityIcons name="crown" size={size * 0.12} color="#FF5252" style={{ marginBottom: -2 }} />
            )}
            
            <Text style={[styles.ringsValue, { color: theme.text.primary, fontSize: size * 0.25 }]}>{centerText}</Text>
            
            {rankMode && subText && (
              <Text style={{ color: '#FF5252', fontSize: size * 0.12, fontWeight: '900', marginTop: -2 }}>
                {subText}
              </Text>
            )}
          </View>

          {!rankMode && bottomText && (
            <Text style={[styles.heroBottomText, { color: '#FF5252', fontSize: size * 0.06 }]}>
              {bottomText?.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={{ width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' }}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text.primary} />
      </TouchableOpacity>

      <View style={[
        styles.headerTitleContainer,
        {
          borderColor: '#FF5252',
          borderWidth: 1,
          backgroundColor: '#FF525220'
        }
      ]}>
        <MaterialCommunityIcons name="lightning-bolt" size={14} color="#FF5252" style={{ marginRight: 6 }} />
        <Text style={[styles.headerTitle, { color: theme.text.primary }]}>POWER WORLD</Text>
      </View>

      <View style={{ width: 40 }} />
    </View>
  );

  const renderSkeleton = () => {
    return (
      <View style={styles.dashboard}>
        <View style={{ alignItems: 'center', marginBottom: 15, marginTop: 10 }}>
          <Skeleton width={100} height={12} borderRadius={4} />
        </View>

        <View style={[styles.heroRow, { justifyContent: 'space-around', alignItems: 'center', marginBottom: 20 }]}>
          <Skeleton width={90} height={90} borderRadius={45} />
          <Skeleton width={110} height={110} borderRadius={55} />
          <Skeleton width={90} height={90} borderRadius={45} />
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Skeleton width={150} height={16} borderRadius={4} />
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 20, gap: 10 }}>
          <Skeleton width={90} height={32} borderRadius={16} />
          <Skeleton width={70} height={32} borderRadius={16} />
          <Skeleton width={70} height={32} borderRadius={16} />
        </View>

        <View style={[styles.peakGrid, { paddingHorizontal: 16 }]}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <View key={idx} style={[styles.peakItem, { alignItems: 'center', marginVertical: 10 }]}>
              <Skeleton width={60} height={60} borderRadius={30} style={{ marginBottom: 8 }} />
              <Skeleton width={75} height={12} borderRadius={4} />
            </View>
          ))}
        </View>

        <View style={{
          marginTop: 20,
          padding: 24,
          borderRadius: 24,
          backgroundColor: 'rgba(255, 82, 82, 0.05)',
          borderWidth: 1,
          borderColor: 'rgba(255, 82, 82, 0.1)',
          marginHorizontal: 16,
          gap: 12
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={28} height={28} borderRadius={14} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="80%" height={16} borderRadius={4} />
              <Skeleton width="50%" height={12} borderRadius={4} />
            </View>
          </View>
          <Skeleton width="100%" height={8} borderRadius={4} />
        </View>
      </View>
    );
  };

  const renderDashboard = () => {
    if (!stats) return null;
    const lbTitle = leaderboardTab === 'glory' ? 'POWER GLOBAL ELITE' : `${POWER_LEVELS[parseInt(leaderboardTab.split('_')[1])].name.toUpperCase()} MASTERY`;

    return (
      <View style={styles.dashboard}>
        <View style={{ alignItems: 'center', marginBottom: -10 }}>
          <Text style={{ fontSize: 9, fontWeight: '900', color: '#FF5252', letterSpacing: 3 }}>OVERALL POWER</Text>
        </View>

        {/* HERO SECTION - COMPACT TRI-CIRCLE DASHBOARD */}
        <View style={styles.heroRow}>
           <MasteryRings 
              size={90} 
              topText="GLOBAL RANK"
              centerText={`#${stats.ranks.glory || '--'}`} 
              bottomText="OF WORLD" 
           />

            <TouchableOpacity
            onPress={() => setShowOverallModal(true)}
            activeOpacity={0.8}
           >
            <View style={{ position: 'relative' }}>
              <MasteryRings 
                  size={110} 
                  active
                  topText="POWER SCORE"
                  centerText={typeof stats.totalPoints === 'number' ? stats.totalPoints.toFixed(2) : stats.totalPoints} 
                  bottomText="TOTAL"
                  showCrown={stats.ranks.glory === 1}
              />
              <View style={[styles.heroAddIcon, { backgroundColor: '#FF5252' }]}>
                <MaterialCommunityIcons name="chart-bar" size={14} color="#000" />
              </View>
            </View>
           </TouchableOpacity>

           <MasteryRings 
              size={90} 
              topText="LEVEL GAP"
              centerText={stats.level.id < 3 ? Number(POWER_LEVELS[stats.level.id + 1].minPoints - stats.totalPoints).toFixed(2) : 'MAX'} 
              bottomText={stats.level.id < 3 ? `PTS TO ${POWER_LEVELS[stats.level.id + 1].name}` : "MAX TIER"} 
           />
        </View>

        <Text style={[styles.sectionHeader, { color: '#FF5252' }]}>YOUR PEAK PERFORMANCE</Text>

        {/* MASTERY TABS MOVED ABOVE PEAKS */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.masteryTabsScroll}
          contentContainerStyle={styles.masteryTabsContent}
        >
          {['glory', 'level_1', 'level_2', 'level_3'].map(lvl => {
            const isActive = leaderboardTab === lvl;
            const levelNum = lvl.startsWith('level') ? parseInt(lvl.split('_')[1]) : 0;
            
            return (
              <TouchableOpacity 
                key={lvl}
                onPress={() => setLeaderboardTab(lvl as any)}
                style={[
                  styles.tabBtnModern, 
                  isActive && { backgroundColor: '#FF525220', borderColor: '#FF5252' }
                ]}
              >
                <Text style={[styles.tabTextModern, { color: isActive ? '#FF5252' : theme.text.tertiary }]}>
                  {lvl === 'glory' ? 'OVERALL POWER' : POWER_LEVELS[levelNum].name.toUpperCase()}
                </Text>
                {lvl === 'glory' && <MaterialCommunityIcons name="crown" size={10} color={isActive ? '#FF5252' : theme.text.tertiary} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* PEAK GRID - 4 IN ONE ROW */}
        <View style={styles.peakGrid}>
          {POWER_MOVEMENTS.map(m => {
            const pb = stats.pbs[m.id] || 0;
            const rank = stats.ranks[m.id] || '--';
            return (
              <TouchableOpacity 
                key={m.id} 
                style={styles.peakItem}
                onPress={() => {
                  setSelectedMovement(m.id);
                  fetchModalLeaderboard(m.id);
                  setShowLogModal(true);
                }}
              >
                <View style={styles.peakCircleWrapper}>
                  <MasteryRings 
                    size={width * 0.15}
                    centerText={pb || '-'}
                    subText={`#${rank}`}
                    rankMode
                  />
                  <View style={[styles.peakAddIcon, { backgroundColor: '#FF5252' }]}>
                    <MaterialCommunityIcons name="plus" size={12} color="#000" />
                  </View>
                </View>
                <Text style={[styles.peakNameText, { color: theme.text.primary }]}>
                  {m.name.split(' ').pop()?.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* DYNAMIC LEADERBOARD (LEVELS ONLY) */}
        {leaderboardTab !== 'glory' && (
          <View style={styles.lbSection}>
            <Text style={[styles.lbTitle, { color: '#FF5252' }]}>{lbTitle}</Text>
            <Text style={[styles.lbSub, { color: theme.text.tertiary }]}>
              THE HIGHEST TIER WARRIOR
            </Text>

            <View style={styles.lbList}>
              {filteredLeaderboardData.slice(0, 10).map((item, i) => (
                <View key={i} style={[styles.lbRow, { backgroundColor: theme.card.background }]}>
                  <View style={[styles.lbRankCircle, { borderColor: i === 0 ? '#FF5252' : theme.card.border }]}>
                    <Text style={{ color: i === 0 ? '#FF5252' : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1}>
                    {item.display_name.toUpperCase()}
                  </Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: '#FF5252' }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>
                      {Number(item.value || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* MILESTONE TRACKER (Only on Glory Tab) */}
        {leaderboardTab === 'glory' && (
          <View style={{
            marginTop: 40,
            padding: 24,
            borderRadius: 24,
            backgroundColor: 'rgba(255, 82, 82, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255, 82, 82, 0.2)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <MaterialCommunityIcons name={stats.level.id < 3 ? "shield-star" : "crown"} size={28} color="#FF5252" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: mode === 'dark' ? '#FFF' : '#FF5252', fontSize: 18, fontWeight: '800' }}>
                  {stats.level.id < 3 
                    ? `${Number(POWER_LEVELS[stats.level.id + 1].minPoints - stats.totalPoints).toFixed(2)} Points to ${POWER_LEVELS[stats.level.id + 1].name}`
                    : 'MAXIMUM MASTERY ACHIEVED'}
                </Text>
                <Text style={{ color: theme.text.secondary, fontSize: 12, marginTop: 2, fontWeight: '600' }}>
                  {stats.level.id < 3 ? 'YOUR NEXT MAJOR MILESTONE' : 'YOU ARE AT THE PEAK'}
                </Text>
              </View>
            </View>
            <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ 
                height: '100%', 
                backgroundColor: '#FF5252', 
                width: stats.level.id < 3 
                  ? `${Math.min(100, Math.max(0, (stats.totalPoints / POWER_LEVELS[stats.level.id + 1].minPoints) * 100))}%` 
                  : '100%'
              }} />
            </View>
            {stats.level.id < 3 && (
              <Text style={{ color: '#FF5252', fontSize: 12, marginTop: 8, textAlign: 'right', fontWeight: '800', letterSpacing: 1 }}>
                {Number(stats.totalPoints).toFixed(2)} / {POWER_LEVELS[stats.level.id + 1].minPoints} PTS
              </Text>
            )}
          </View>
        )}

        {/* Ambient Quote */}
        {leaderboardTab === 'glory' && (
          <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 40 }}>
            <Text style={{ 
              color: theme.text.tertiary, 
              fontSize: 10, 
              fontFamily: 'PlusJakartaSans-SemiBold',
              letterSpacing: 3,
              textTransform: 'uppercase'
            }}>
              TAKE THE LEAP. CLAIM YOUR POWER.
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <GlobalErrorBoundary>
      <LinearGradient 
        colors={[theme.background.primary, theme.background.secondary || '#000']} 
        style={[styles.container]}
      >
      {renderHeader()}
      <ScrollView 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {loading || !stats ? renderSkeleton() : renderDashboard()}
      </ScrollView>

      <BottomTabBar activeTab="power" strengthTier={profile?.strength_tier || 0} />

      {/* LOG MODAL */}
      <Modal visible={showLogModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>UPDATE PEAK WEIGHT</Text>
              <TouchableOpacity onPress={() => setShowLogModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalMovementName, { color: theme.accent }]}>
              {POWER_MOVEMENTS.find(m => m.id === selectedMovement)?.name.toUpperCase()}
            </Text>

            <TextInput 
              style={[styles.modalInput, { color: theme.text.primary, borderColor: theme.accent }]}
              placeholder="0.0"
              placeholderTextColor="#333"
              keyboardType="numeric"
              autoFocus
              value={manualInput}
              onChangeText={setManualInput}
            />

            <TouchableOpacity 
              style={[styles.modalSaveBtn, { backgroundColor: '#FF5252' }]} 
              onPress={handleSaveWeight}
              disabled={saving}
            >
              {saving ? <LeapLogo size={40} animated /> : <Text style={styles.modalSaveText}>SAVE NEW PR</Text>}
            </TouchableOpacity>

            <View style={styles.modalLBContainer}>
               <Text style={[styles.modalLBTitle, { color: theme.text.tertiary }]}>MOVEMENT RANKINGS</Text>
               {modalLeaderboardData.slice(0, 5).map((item, i) => (
                 <View key={i} style={styles.modalLBRow}>
                   <Text style={[styles.modalLBRank, { color: theme.accent }]}>#{i + 1}</Text>
                   <Text style={[styles.modalLBName, { color: theme.text.primary }]} numberOfLines={1}>{item.display_name.toUpperCase()}</Text>
                   <Text style={[styles.modalLBValue, { color: theme.text.secondary }]}>{Number(item.value || 0).toFixed(2)}kg</Text>
                 </View>
               ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* OVERALL LEADERBOARD MODAL */}
      <Modal visible={showOverallModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBox}>
                <MaterialCommunityIcons name="crown" size={24} color="#FF5252" />
                <Text style={[styles.modalTitle, { color: theme.text.primary, marginLeft: 8 }]}>
                  POWER MASTERY
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowOverallModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubOverall, { color: theme.text.tertiary }]}>GLOBAL POWER RANKINGS</Text>

            {leaderboardTab === 'glory' && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, marginTop: 16, gap: 12 }}>
                {['ALL', 'MALE', 'FEMALE'].map((filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 16,
                      borderRadius: 20,
                      backgroundColor: genderFilter === filter ? '#FF5252' : 'rgba(255,255,255,0.05)',
                      borderWidth: 1,
                      borderColor: genderFilter === filter ? '#FF5252' : 'rgba(255,255,255,0.1)'
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

            <ScrollView style={{ marginTop: 20 }}>
              {filteredLeaderboardData.map((item, i) => (
                <View key={i} style={[styles.lbRow, item.user_id === user?.id && { backgroundColor: '#FF525220', borderColor: '#FF5252', borderWidth: 1 }]}>
                  <View style={[styles.lbRankCircle, { backgroundColor: i < 3 ? '#FF525230' : 'transparent' }]}>
                    <Text style={{ color: i === 0 ? '#FF5252' : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1}>
                    {leaderboardTab === 'glory' && <Text style={{ fontSize: 16 }}>{getCountryFlag(item.country)} </Text>}
                    {item.display_name.toUpperCase()}
                  </Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: '#FF5252' }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>{Number(item.value || 0).toFixed(2)} PTS</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CelebrationBanner 
        visible={showCelebration}
        {...celebrationProps}
        onDismiss={() => setShowCelebration(false)}
      />
    </LinearGradient>
    </GlobalErrorBoundary>
  );
}

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
  
  masteryTabsScroll: {
    marginVertical: 12,
  },
  masteryTabsContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  tabBtnModern: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 14, 
    borderWidth: 1.5, 
    borderColor: 'rgba(255,112,67,0.4)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  tabTextModern: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  secondaryHero: { alignItems: 'center', flex: 1, gap: 4 },
  heroStatLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5, opacity: 0.6 },
  heroStatValue: { fontSize: 24, fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold' },

  ringsContainer: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  masteryRing: { position: 'absolute' },
  ringsCenter: { alignItems: 'center', justifyContent: 'center', zIndex: 10, paddingBottom: 4 },
  ringsValue: { fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold', letterSpacing: -0.5 },
  heroTopText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5, marginBottom: 2 },
  heroBottomText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },

  sectionHeader: { fontSize: 13, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginVertical: 20 },
  peakGrid: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10 },
  peakItem: { alignItems: 'center', gap: 10 },
  peakCircleWrapper: { position: 'relative' },
  peakNameText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginTop: 4 },
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
  modalTitleBox: { flexDirection: 'row', alignItems: 'center' },
  modalSubOverall: { fontSize: 10, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginTop: -20 },

  lbSection: { gap: 12 },
  lbTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  lbSub: { fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: -8 },
  lbList: { gap: 10 },
  lbRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, gap: 12 },
  lbRankCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lbName: { flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  lbPointsFrame: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 60, alignItems: 'center' },
  lbPointsText: { fontSize: 14, fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 24 },
  modalContent: { padding: 32, borderRadius: 32, gap: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  modalMovementName: { fontSize: 28, fontWeight: '900', textAlign: 'center' },
  modalInput: { borderWidth: 2, borderRadius: 20, padding: 20, fontSize: 42, textAlign: 'center', fontWeight: '900' },
  modalSaveBtn: { padding: 20, borderRadius: 16, alignItems: 'center' },
  modalSaveText: { color: '#000', fontWeight: '900', letterSpacing: 2 },
  modalLBContainer: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 20, gap: 12 },
  modalLBTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  modalLBRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalLBRank: { fontSize: 14, fontWeight: '900', width: 30 },
  modalLBName: { flex: 1, fontSize: 12, fontWeight: '800' },
  modalLBValue: { fontSize: 12, fontWeight: '900' },
});
