import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, ActivityIndicator, Modal,
  Dimensions
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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

const { width } = Dimensions.get('window');

interface StaticWorldScreenProps {
  onClose: () => void;
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
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StaticMovement | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | null>(null);
  const [entries, setEntries] = useState<StaticLeaderboardEntry[]>([]);
  const [levelEntries, setLevelEntries] = useState<StaticLevelLeaderboardEntry[]>([]);
  const [wellRoundedEntries, setWellRoundedEntries] = useState<any[]>([]);
  const [personalBest, setPersonalBest] = useState<StaticLeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [showGlobalMastery, setShowGlobalMastery] = useState(false);
  const { seconds: timerSeconds, isRunning: timerRunning, start: startTimer, stop: stopTimer, reset: resetTimer } = useTimer();
  const [manualInput, setManualInput] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [userHolds, setUserHolds] = useState<Record<string, number>>({});

  useEffect(() => {
    if (user) {
      StaticService.getUserHolds(user.id).then(holds => {
        const holdMap: Record<string, number> = {};
        holds.forEach(h => { holdMap[h.movement_id] = h.hold_seconds; });
        setUserHolds(holdMap);
      });
    }
  }, [user]);

  useEffect(() => {
    if (selectedMovement && user) {
      loadMovementData();
    }
  }, [selectedMovement]);

  useEffect(() => {
    if (selectedLevel && user) {
      loadLevelData();
    }
  }, [selectedLevel]);

  useEffect(() => {
    if (showGlobalMastery && user) {
      loadWellRoundedData();
    }
  }, [showGlobalMastery]);

  async function loadWellRoundedData() {
    if (!user) return;
    setLoading(true);
    try {
      const e = await StaticService.getWellRoundedLeaderboard(user.id);
      setWellRoundedEntries(e);
    } catch (err: any) {
      console.error('Leaderboard error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMovementData() {
    if (!selectedMovement || !user) return;
    setLoading(true);
    try {
      const { entries: e, personalBest: pb } = await StaticService.getMovementLeaderboard(selectedMovement.id, user.id);
      setEntries(e);
      setPersonalBest(pb);
    } finally {
      setLoading(false);
    }
  }

  async function loadLevelData() {
    if (!selectedLevel || !user) return;
    setLoading(true);
    try {
      const e = await StaticService.getLevelLeaderboard(selectedLevel, user.id);
      setLevelEntries(e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshUserHolds() {
    if (user) {
      const holds = await StaticService.getUserHolds(user.id);
      const holdMap: Record<string, number> = {};
      holds.forEach(h => { holdMap[h.movement_id] = h.hold_seconds; });
      setUserHolds(holdMap);
    }
  }

  async function handleSaveHold(seconds: number) {
    if (!selectedMovement || !user || seconds <= 0) return;

    try {
      setLoading(true);
      const isPB = await StaticService.saveHold(user.id, selectedMovement.id, seconds);

      const msg = isPB ? 'Personal Best Updated!' : 'Hold logged successfully';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Success', msg);

      await loadMovementData();
      await refreshUserHolds();
      setShowLogModal(false);
      resetTimer();
      setManualInput('');
    } catch (error: any) {
      console.error('Error saving hold:', error);
      const msg = error.message || 'Failed to save hold';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  const renderHeader = (title: string, onBack: () => void) => (
    <View style={[styles.header, { borderBottomColor: theme.card.border }]}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <MaterialCommunityIcons name="chevron-left" size={32} color={theme.accent} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: theme.text.primary }]}>{title.toUpperCase()}</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  // 1. GLOBAL MASTERY HALL (Elite Priority)
  if (showGlobalMastery) {
    const personalEntry = wellRoundedEntries.find(e => e.user_id === user?.id);

    // Calculate best category
    const categories = [
      { id: 'handstand', name: 'HANDSTAND', pts: personalEntry?.handstand_points || 0, time: personalEntry?.handstand_time || 0, short: 'HS' },
      { id: 'front_lever', name: 'FRONT LEVER', pts: personalEntry?.front_lever_points || 0, time: personalEntry?.front_lever_time || 0, short: 'FL' },
      { id: 'back_lever', name: 'BACK LEVER', pts: personalEntry?.back_lever_points || 0, time: personalEntry?.back_lever_time || 0, short: 'BL' },
      { id: 'planche', name: 'PLANCHE', pts: personalEntry?.planche_points || 0, time: personalEntry?.planche_time || 0, short: 'PL' },
    ];
    const bestCat = [...categories].sort((a, b) => b.pts - a.pts)[0];

    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        {renderHeader('Hall of Mastery', () => setShowGlobalMastery(false))}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ELITE DASHBOARD */}
          <View style={styles.statsDashboard}>
            <View style={[styles.statCircle, { borderColor: theme.card.border }]}>
              <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>GLOBAL RANK</Text>
              <Text style={[styles.statCircleValue, { color: theme.text.primary }]}>
                #{personalEntry?.rank || '-'}
              </Text>
              <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>OF {wellRoundedEntries.length}</Text>
            </View>

            <View style={[styles.statCircle, { borderColor: theme.accent }]}>
              <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>MASTERY SCORE</Text>
              <Text style={[styles.statCircleValue, { color: theme.accent }]}>
                {Math.round(personalEntry?.total_points || 0)}
              </Text>
              <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>TOTAL</Text>
            </View>

            <View style={[styles.statCircle, { borderColor: theme.card.border }]}>
              <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>BEST TRACK</Text>
              <Text style={[styles.statCircleValue, { color: theme.text.primary, fontSize: 16 }]}>
                {bestCat?.pts > 0 ? bestCat.short : '-'}
              </Text>
              <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>{bestCat?.pts > 0 ? `${Math.round(bestCat.pts)} PTS` : 'NO DATA'}</Text>
            </View>
          </View>

          {/* TRACK BREAKDOWN */}
          <View style={styles.warriorsHeadline}>
            <Text style={[styles.headlineTitleBig, { color: theme.accent }]}>YOUR PEAK PERFORMANCE</Text>
            <View style={[styles.divider, { backgroundColor: theme.card.border, opacity: 0.3 }]} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.linearMasteryContainer}>
            {categories.map(cat => (
              <View key={cat.id} style={styles.movementCircleLinear}>
                <View style={[styles.timeCircleSmall, { borderColor: cat.pts > 0 ? theme.accent : theme.card.border }]}>
                  <Text style={[styles.timeCircleValue, { color: cat.pts > 0 ? theme.text.primary : theme.text.tertiary }]}>
                    {cat.pts > 0 ? Math.round(cat.pts) : '-'}
                  </Text>
                  {cat.pts > 0 && (
                    <Text style={{ fontSize: 7, fontWeight: '900', color: theme.accent, marginTop: -2 }}>PTS</Text>
                  )}
                </View>
                <Text style={[styles.movementCircleLabel, { color: theme.text.primary }]} numberOfLines={2}>
                  {cat.name}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.warriorsHeadline, { marginTop: 20 }]}>
            <Text style={[styles.headlineTitleBig, { color: theme.accent }]}>GLOBAL ELITE</Text>
            <Text style={[styles.headlineSubtitle, { color: theme.text.secondary }]}>
              {wellRoundedEntries.length} ALL-AROUND WARRIORS
            </Text>
          </View>

          {loading ? <ActivityIndicator color={theme.accent} size="large" style={{ marginTop: 40 }} /> : (
            <View style={{ paddingHorizontal: 16 }}>
              {wellRoundedEntries.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="shield-off-outline" size={48} color={theme.text.tertiary} style={{ marginBottom: 12 }} />
                  <Text style={{ color: theme.text.tertiary, fontSize: 14, textAlign: 'center' }}>
                    NO WARRIORS IN THE HALL YET.
                  </Text>
                </View>
              ) : wellRoundedEntries.map((entry, index) => (
                <View
                  key={entry.user_id}
                  style={[
                    styles.entryRow,
                    {
                      backgroundColor: entry.is_current_user ? 'rgba(205,127,50,0.08)' : theme.card.background,
                      borderColor: entry.is_current_user ? theme.accent : theme.card.border,
                      borderWidth: 1,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }
                  ]}
                >
                  <View style={{ width: 36, alignItems: 'center' }}>
                    <View style={[
                      { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
                      index === 0 ? { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.1)' } :
                        index === 1 ? { borderColor: '#C0C0C0', backgroundColor: 'rgba(192,192,192,0.1)' } :
                          index === 2 ? { borderColor: '#CD7F32', backgroundColor: 'rgba(205,127,50,0.1)' } :
                            { borderColor: entry.is_current_user ? theme.accent : theme.card.border }
                    ]}>
                      <Text style={[
                        { fontSize: 11, fontWeight: '900' },
                        index === 0 ? { color: '#FFD700' } :
                          index === 1 ? { color: '#C0C0C0' } :
                            index === 2 ? { color: '#CD7F32' } :
                              { color: entry.is_current_user ? theme.accent : theme.text.tertiary }
                      ]}>
                        {entry.rank}
                      </Text>
                    </View>
                  </View>

                  <Text style={[{ flex: 1, fontSize: 13, fontWeight: '700', color: entry.is_current_user ? theme.accent : theme.text.primary }]} numberOfLines={1}>
                    {(entry.display_name || '').toUpperCase()}
                    {entry.is_current_user && <Text style={{ color: theme.accent }}> YOU</Text>}
                  </Text>

                  {/* 4 Core Tracks Breakdown */}
                  {['handstand', 'front_lever', 'back_lever', 'planche'].map(cat => {
                    const time = entry[`${cat}_time`];
                    return (
                      <View key={cat} style={{ alignItems: 'center', gap: 4 }}>
                        <View style={[{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: time > 0 ? theme.accent : theme.card.border }]}>
                          <Text style={[{ fontSize: 9, fontWeight: '900', color: time > 0 ? theme.text.primary : theme.text.tertiary }]}>
                            {time > 0 ? `${Math.round(time)}s` : '-'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 7, color: theme.text.tertiary, letterSpacing: 0.5, fontWeight: '900' }}>
                          {cat === 'handstand' ? 'HS' : cat === 'front_lever' ? 'FL' : cat === 'back_lever' ? 'BL' : 'PL'}
                        </Text>
                      </View>
                    );
                  })}

                  <View style={{ alignItems: 'center', paddingLeft: 8 }}>
                    <Text style={{ fontSize: 8, color: theme.text.tertiary, letterSpacing: 1, fontWeight: '900', marginBottom: 2 }}>TOTAL</Text>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(205,127,50,0.15)', minWidth: 44, alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.accent }}>
                        {Math.round(entry.total_points)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // 2. MAIN CATEGORY SELECTION
  if (!selectedCategory && !selectedLevel) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        {renderHeader('Static World', onClose)}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Global Mastery Hall Entry */}
          <TouchableOpacity
            onPress={() => setShowGlobalMastery(true)}
            style={[styles.globalMasteryHero, { borderColor: theme.accent }]}
          >
            <BlurView intensity={isDark ? 40 : 60} style={styles.globalMasteryBlur}>
              <View style={styles.globalMasteryContent}>
                <View>
                  <Text style={[styles.globalMasteryTitle, { color: theme.accent }]}>HALL OF MASTERY</Text>
                  <Text style={[styles.globalMasterySubtitle, { color: theme.text.secondary }]}>WELL-ROUNDED ATHLETES</Text>
                </View>
                <MaterialCommunityIcons name="trophy-variant" size={40} color={theme.accent} />
              </View>
            </BlurView>
          </TouchableOpacity>

          {/* Level Selection Section */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>OVERALL MASTERY</Text>
          </View>

          <View style={styles.levelRow}>
            {([1, 2, 3] as const).map(level => (
              <TouchableOpacity
                key={level}
                activeOpacity={0.7}
                onPress={() => setSelectedLevel(level)}
                style={styles.levelCardWrapper}
              >
                <View style={[styles.warriorNavCard, { borderColor: theme.card.border }]}>
                  <BlurView intensity={isDark ? 20 : 40} style={styles.navCardBlur}>
                    <MaterialCommunityIcons
                      name={level === 1 ? 'cube-outline' : level === 2 ? 'shield-outline' : 'trophy-outline'}
                      size={24}
                      color={theme.accent}
                      style={{ marginBottom: 8 }}
                    />
                    <Text style={[styles.levelName, { color: theme.text.primary }]}>{STATIC_LEVELS[level].name}</Text>
                    <Text style={[styles.levelSubtitle, { color: theme.text.tertiary }]}>LVL {level}</Text>
                  </BlurView>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Discipline Selection Section */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>STATIC DISCIPLINES</Text>
          </View>

          <View style={styles.categoryGrid}>
            {Object.entries(STATIC_CATEGORIES).map(([key, cat]) => (
              <TouchableOpacity
                key={key}
                activeOpacity={0.7}
                onPress={() => setSelectedCategory(key)}
                style={styles.categoryCardWrapper}
              >
                <View style={[styles.insaneCard, { borderColor: theme.accent, shadowColor: theme.accent }]}>
                  <BlurView intensity={isDark ? 40 : 60} style={styles.navCardBlur}>
                    {/* Double Initial Glitch Trail - Scaled for tighter fit */}
                    <Text style={[styles.insaneInitialShadow, { color: theme.text.primary, opacity: 0.03 }]}>
                      {cat.name[0].toUpperCase()}
                    </Text>
                    <Text style={[styles.insaneInitialMain, { color: theme.accent, opacity: 0.12 }]}>
                      {cat.name[0].toUpperCase()}
                    </Text>

                    <View style={styles.insaneContent}>
                      <Text style={[styles.categoryNameInsane, { color: theme.text.primary }]}>
                        {cat.name.toUpperCase()}
                      </Text>
                    </View>

                    {/* Bottom Glow Bar - Integrated into card edge */}
                    <View style={[styles.insaneBottomGlow, { backgroundColor: theme.accent }]} />
                    <View style={[styles.insaneCornerFlare, { backgroundColor: theme.accent }]} />
                  </BlurView>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // 1. MOVEMENT DETAIL (Highest Priority)
  if (selectedMovement) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        {renderHeader(selectedMovement.name, () => setSelectedMovement(null))}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.statsOverview}>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>PERSONAL BEST</Text>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>
                {personalBest ? `${personalBest.best_time_seconds}S` : '--'}
              </Text>
            </View>
            <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: theme.card.border }]}>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>TOTAL POINTS</Text>
              <Text style={[styles.statValue, { color: theme.accent }]}>
                {personalBest ? Math.round(personalBest.points) : '--'}
              </Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, marginVertical: 20 }}>
            <WarriorButton
              title="START TIMER"
              onPress={() => setShowLogModal(true)}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text.tertiary, paddingHorizontal: 20 }]}>GLOBAL RANKINGS</Text>
          {loading ? <ActivityIndicator color={theme.accent} size="large" /> : (
            <View style={styles.leaderboardContainer}>
              {entries.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>No global records yet.</Text>
              ) : entries.map((entry) => (
                <View key={entry.user_id} style={[styles.professionalRow, { borderBottomColor: theme.card.border }]}>
                  <Text style={[styles.rankText, { color: theme.accent }]}>{entry.rank}</Text>
                  <Text style={[styles.nameText, { color: entry.is_current_user ? theme.accent : theme.text.primary }]}>
                    {entry.display_name.toUpperCase()}
                  </Text>
                  <Text style={[styles.scoreText, { color: theme.text.primary }]}>{entry.best_time_seconds}S</Text>
                </View>
              ))}
            </View>
          )}

          {/* Log Modal */}
          <Modal visible={showLogModal} transparent animationType="slide" onRequestClose={() => setShowLogModal(false)}>
            <View style={[styles.modalOverlayProfessional, { backgroundColor: isDark ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.5)' }]}>
              <View style={[styles.modalContentProfessional, { backgroundColor: theme.card.background }]}>
                <Text style={[styles.modalTitle, { color: theme.text.primary }]}>{(selectedMovement?.name || 'LOG').toUpperCase()}</Text>
                <View style={[styles.timerCircle, { borderColor: theme.accent }]}>
                  <Text style={[styles.timerDisplayLarge, { color: theme.text.primary }]}>{timerSeconds}</Text>
                  <Text style={[styles.timerUnit, { color: theme.text.tertiary }]}>SECONDS</Text>
                </View>

                <View style={styles.timerControlsRow}>
                  <WarriorButton
                    title={timerRunning ? "STOP" : "START"}
                    onPress={timerRunning ? stopTimer : startTimer}
                    variant={timerRunning ? "secondary" : "primary"}
                    style={{ flex: 1 }}
                  />
                  {!timerRunning && timerSeconds > 0 && (
                    <WarriorButton
                      title="SAVE"
                      onPress={() => handleSaveHold(timerSeconds)}
                      style={{ flex: 1 }}
                    />
                  )}
                </View>

                <TextInput
                  style={[styles.professionalInput, { borderBottomColor: theme.accent, color: theme.text.primary, marginTop: 24 }]}
                  value={manualInput}
                  onChangeText={setManualInput}
                  placeholder="MANUAL ENTRY (SEC)"
                  placeholderTextColor={theme.text.tertiary}
                  keyboardType="numeric"
                />

                {manualInput.length > 0 && (
                  <View style={{ width: '100%', marginTop: 16 }}>
                    <WarriorButton
                      title="SAVE MANUAL ENTRY"
                      onPress={() => handleSaveHold(parseFloat(manualInput) || 0)}
                      variant="secondary"
                    />
                  </View>
                )}

                <TouchableOpacity style={{ marginTop: 32 }} onPress={() => { setShowLogModal(false); resetTimer(); setManualInput(''); }}>
                  <Text style={{ color: theme.text.secondary, fontWeight: '700', letterSpacing: 2 }}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </View>
    );
  }

  // 2. LEVEL DASHBOARD
  if (selectedLevel) {
    const movements = getLevelMovements(selectedLevel);
    const personalEntry = levelEntries.find(e => e.is_current_user);

    // SMART BEST MOVE: Find move with highest points (time * multiplier)
    const bestMove = movements.reduce((best, current) => {
      const bestHold = userHolds[best.id] || 0;
      const currentHold = userHolds[current.id] || 0;
      const bestPoints = bestHold * (best.multiplier || 1);
      const currentPoints = currentHold * (current.multiplier || 1);
      return (currentPoints > bestPoints) ? current : best;
    }, movements[0]);

    const hasAnyHolds = Object.values(userHolds).some(h => h > 0);

    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        {renderHeader(STATIC_LEVELS[selectedLevel].name, () => setSelectedLevel(null))}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* STATS DASHBOARD */}
          <View style={styles.statsDashboard}>
            <View style={[styles.statCircle, { borderColor: theme.card.border, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }]}>
              <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>MASTERY</Text>
              <Text style={[styles.statCircleValue, { color: theme.text.primary }]}>
                {personalEntry ? Math.round(personalEntry.total_points) : '-'}
              </Text>
              <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>PTS</Text>
            </View>

            <View style={[styles.statCircle, { borderColor: theme.accent, width: 110, height: 110, borderRadius: 55 }]}>
              <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>GLOBAL RANK</Text>
              <Text style={[styles.statCircleValue, { color: theme.text.primary }]}>
                #{personalEntry?.rank || '-'}
              </Text>
              <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>OF {levelEntries.length}</Text>
            </View>

            <View style={[styles.statCircle, { borderColor: theme.card.border, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }]}>
              <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>BEST MOVE</Text>
              <Text style={[styles.statCircleValue, { color: theme.accent, fontSize: 10, textAlign: 'center', paddingHorizontal: 4 }]} numberOfLines={2}>
                {hasAnyHolds ? bestMove.name.toUpperCase() : '-'}
              </Text>
              <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>
                {hasAnyHolds ? `${userHolds[bestMove.id]}S` : 'LOG NOW'}
              </Text>
            </View>
          </View>

          {/* YOUR MASTERY LINEAR */}
          <View style={styles.warriorsHeadline}>
            <Text style={[styles.headlineTitleBig, { color: theme.accent }]}>YOUR MASTERY</Text>
            <View style={[styles.divider, { backgroundColor: theme.card.border, opacity: 0.3 }]} />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.linearMasteryContainer}
          >
            {movements.map(m => (
              <TouchableOpacity key={m.id} onPress={() => setSelectedMovement(m)} style={styles.movementCircleLinear}>
                <View style={[styles.timeCircleSmall, { borderColor: theme.accent }]}>
                  <Text style={[styles.timeCircleValue, { color: userHolds[m.id] ? theme.text.primary : theme.text.tertiary }]}>
                    {userHolds[m.id] || 0}s
                  </Text>
                </View>
                <Text style={[styles.movementCircleLabel, { color: theme.text.primary }]} numberOfLines={2}>
                  {m.name.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={[styles.warriorsHeadline, { borderBottomColor: 'transparent', paddingBottom: 0, marginTop: 10 }]}>
            <Text style={[styles.headlineTitleBig, { color: theme.accent }]}>RANKINGS MATRIX</Text>
            <Text style={[styles.headlineSubtitle, { color: theme.text.secondary }]}>
              {levelEntries.length} WARRIORS
            </Text>
          </View>

          {loading ? <ActivityIndicator color={theme.accent} size="large" style={{ marginTop: 40 }} /> : (
            <View style={{ paddingHorizontal: 16 }}>
              {(!levelEntries || levelEntries.length === 0) ? (
                <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>No warriors yet. Be the first!</Text>
              ) : levelEntries.map((entry, index) => (
                <View
                  key={entry?.user_id || index.toString()}
                  style={[
                    styles.entryRow,
                    {
                      backgroundColor: entry?.is_current_user ? 'rgba(205,127,50,0.08)' : theme.card.background,
                      borderColor: entry?.is_current_user ? theme.accent : theme.card.border,
                      borderWidth: 1,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }
                  ]}
                >
                  {/* Rank */}
                  <View style={{ width: 36, alignItems: 'center' }}>
                    {index === 0 && <Text style={{ fontSize: 20 }}>🥇</Text>}
                    {index === 1 && <Text style={{ fontSize: 20 }}>🥈</Text>}
                    {index === 2 && <Text style={{ fontSize: 20 }}>🥉</Text>}
                    {index > 2 && (
                      <View style={[{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: entry?.is_current_user ? theme.accent : theme.card.border }]}>
                        <Text style={[{ fontSize: 11, fontWeight: '900', color: entry?.is_current_user ? theme.accent : theme.text.tertiary }]}>{entry?.rank}</Text>
                      </View>
                    )}
                  </View>

                  {/* Name */}
                  <Text style={[{ flex: 1, fontSize: 13, fontWeight: '700', color: entry?.is_current_user ? theme.accent : theme.text.primary }]} numberOfLines={1}>
                    {(entry?.display_name || '').toUpperCase()}
                    {entry?.is_current_user && <Text style={{ color: theme.accent }}> YOU</Text>}
                  </Text>

                  {/* Movement times */}
                  {movements.map(m => {
                    const time = entry?.movement_times?.[m.id];
                    return (
                      <View key={m.id} style={{ alignItems: 'center', gap: 4 }}>
                        <View style={[{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: time ? theme.accent : theme.card.border }]}>
                          <Text style={[{ fontSize: 10, fontWeight: '900', color: time ? theme.accent : theme.text.tertiary }]}>
                            {time ? `${time}s` : '-'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 8, color: theme.text.tertiary, letterSpacing: 0.5, fontWeight: '700' }}>
                          {m.name.split(' ').map((w: string) => w[0]).join('')}
                        </Text>
                      </View>
                    );
                  })}

                  {/* Total score */}
                  <View style={{ alignItems: 'center', paddingLeft: 8 }}>
                    <Text style={{ fontSize: 9, color: theme.text.tertiary, letterSpacing: 1, fontWeight: '900', marginBottom: 2 }}>TOTAL</Text>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(205,127,50,0.15)', minWidth: 52, alignItems: 'center' }}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: theme.accent }}>
                        {Math.round(entry?.total_points || 0)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // 3. PROGRESSION LIST
  if (selectedCategory && !selectedMovement) {
    const movements = getCategoryMovements(selectedCategory);
    const cat = STATIC_CATEGORIES[selectedCategory as keyof typeof STATIC_CATEGORIES];
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        {renderHeader(cat.name, () => setSelectedCategory(null))}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.sectionTitle, { color: theme.text.tertiary, paddingHorizontal: 20 }]}>SELECT PROGRESSION</Text>
          {movements.map(m => (
            <TouchableOpacity key={m.id} onPress={() => setSelectedMovement(m)} activeOpacity={0.7}>
              <WarriorCard variant="default" style={styles.professionalMovementCard}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.progressionName, { color: theme.text.primary }]}>{m.name.toUpperCase()}</Text>
                  <Text style={[styles.levelLabel, { color: theme.text.tertiary }]}>LEVEL {m.level}</Text>
                </View>
                <View style={styles.multiplierBadgeProfessional}>
                  <Text style={[styles.multiplierValue, { color: theme.accent }]}>{m.multiplier}X</Text>
                </View>
              </WarriorCard>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1
  },
  backButton: { padding: 8 },
  title: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  sectionHeader: { paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2
  },

  levelRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  levelCardWrapper: { flex: 1, height: 80 },
  levelName: { fontSize: 13, fontWeight: '900', letterSpacing: 1.5, marginBottom: 2 },
  levelSubtitle: { fontSize: 8, fontWeight: '700', opacity: 0.6 },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
    columnGap: 0,
    rowGap: 0,
  },
  categoryCardWrapper: { width: (width - 32) / 2, height: 140 },
  categoryName: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },

  professionalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    marginHorizontal: 20,
    borderBottomWidth: 1
  },
  rankText: { fontSize: 14, fontWeight: '900', width: 30 },
  nameText: { flex: 1, fontSize: 13, fontWeight: '600' },
  scoreText: { fontSize: 13, fontWeight: '900' },

  professionalMovementCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  progressionName: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  levelLabel: { fontSize: 10, marginTop: 2 },
  multiplierBadgeProfessional: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.3)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  multiplierValue: { fontSize: 12, fontWeight: '900' },

  statsOverview: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  statBox: { flex: 1, padding: 20, alignItems: 'center' },
  statLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '900' },

  infoBanner: { padding: 20, alignItems: 'center' },
  subtitle: { fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  emptyText: { textAlign: 'center', padding: 40, fontSize: 12 },
  leaderboardContainer: { marginTop: 8 },

  // DASHBOARD & MATRIX
  movementCircleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  movementCircleWrapper: {
    width: (width - 48) / 4,
    alignItems: 'center',
    marginBottom: 16,
  },
  timeCircleSmall: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  timeCircleValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  movementCircleLabel: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  matrixContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  matrixHeaderCell: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  matrixNameCell: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  matrixScoreCell: {
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 4,
  },
  // STRENGTH WORLD AESTHETIC
  statsDashboard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  statCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCircleLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'center',
  },
  statCircleValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  statCircleUnit: {
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
  },
  divider: {
    height: 1,
    width: '100%',
    marginTop: 12,
  },
  linearMasteryContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '100%',
  },
  movementCircleLinear: {
    alignItems: 'center',
    width: 80,
  },
  compactMatrixWrapper: {
    paddingHorizontal: 16,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 700,
  },
  matrixTimeCircleSmall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixTimeTextSmall: {
    fontSize: 12,
    fontWeight: '900',
  },
  totalScoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  warriorsHeadline: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  headlineTitleBig: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 4,
  },
  headlineSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // GLOBAL MASTERY HERO
  globalMasteryHero: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    height: 100,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  globalMasteryBlur: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  globalMasteryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  globalMasteryTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 4,
  },
  globalMasterySubtitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  // WARRIOR NAV CARDS
  warriorNavCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  specialDisciplineCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  // INSANE STYLE
  insaneCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
    elevation: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  insaneInitialMain: {
    position: 'absolute',
    fontSize: 110,
    fontWeight: '900',
    top: -15,
    right: -10,
    transform: [{ rotate: '-10deg' }],
  },
  insaneInitialShadow: {
    position: 'absolute',
    fontSize: 110,
    fontWeight: '900',
    top: -13,
    right: -8,
    transform: [{ rotate: '-10deg' }],
  },
  insaneContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    flex: 1,
  },
  insaneSubtitle: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 6,
    opacity: 0.8,
  },
  categoryNameInsane: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  insaneBottomGlow: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    opacity: 0.8,
  },
  insaneAccentBar: {
    width: 30,
    height: 3,
    marginTop: 12,
    borderRadius: 1.5,
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  insaneCornerFlare: {
    position: 'absolute',
    top: -10,
    left: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  cardInitialBackground: {
    position: 'absolute',
    fontSize: 100,
    fontWeight: '900',
    top: -10,
    right: -10,
  },
  cardAccentLine: {
    width: 24,
    height: 2,
    marginTop: 12,
    borderRadius: 1,
  },
  navCardBlur: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryRowProfessional: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rankContainerSmall: {
    width: 30,
    alignItems: 'center',
    marginRight: 8,
  },
  medalSmall: {
    fontSize: 16,
  },
  rankNumberSmall: {
    fontSize: 12,
    fontWeight: '900',
  },
  matrixTimeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(205,127,50,0.05)',
  },
  matrixTimeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // MODAL PROFESSIONAL
  modalOverlayProfessional: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalContentProfessional: { width: '100%', padding: 40, alignItems: 'center', borderRadius: 24, overflow: 'hidden' },
  modalTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 2, marginBottom: 40 },
  timerCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40
  },
  timerDisplayLarge: { fontSize: 72, fontWeight: '200' },
  timerUnit: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  timerControlsRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 32 },
  professionalInput: {
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center'
  },
});


