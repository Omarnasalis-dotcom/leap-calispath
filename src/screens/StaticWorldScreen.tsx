import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, ActivityIndicator, Modal
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  STATIC_MOVEMENTS, STATIC_LEVELS, STATIC_CATEGORIES,
  calculatePoints, getLevelMovements, getCategoryMovements,
  StaticMovement
} from '../lib/staticLogic';
import { getStaticMovementLeaderboard, getStaticLevelLeaderboard } from '../lib/leaderboard';
import { LeaderboardEntry } from '../lib/leaderboard';

interface StaticWorldScreenProps {
  onClose: () => void;
}

export function StaticWorldScreen({ onClose }: StaticWorldScreenProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StaticMovement | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [personalBest, setPersonalBest] = useState<{ seconds: number; points: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const intervalRef = useRef<any>(null);

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
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerRunning]);

  async function loadMovementData() {
    if (!selectedMovement || !user) return;
    setLoading(true);
    try {
      const { entries: e, personalBest: pb } = await getStaticMovementLeaderboard(selectedMovement.id, user.id);
      setEntries(e);
      if (pb) {
        setPersonalBest({ seconds: pb.best_time_seconds || 0, points: (pb.best_time_seconds || 0) * selectedMovement.multiplier });
      } else {
        setPersonalBest(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadLevelData() {
    if (!selectedLevel || !user) return;
    setLoading(true);
    try {
      const movements = getLevelMovements(selectedLevel).map(m => m.id);
      const { entries: e } = await getStaticLevelLeaderboard(selectedLevel, user.id, movements);
      setEntries(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveHold(seconds: number) {
    if (!selectedMovement || !user || seconds <= 0) return;
    const points = calculatePoints(selectedMovement.id, seconds);
    const existingPB = personalBest?.seconds || 0;
    if (seconds <= existingPB) {
      if (Platform.OS === 'web') {
        alert(`Your best is ${existingPB}s. Keep training!`);
      } else {
        Alert.alert('Not a PB', `Your best is ${existingPB}s. Keep training!`);
      }
      return;
    }
    try {
      await supabase.from('static_holds').upsert({
        user_id: user.id,
        movement_id: selectedMovement.id,
        hold_seconds: seconds,
        points,
      }, { onConflict: 'user_id,movement_id' });
      setPersonalBest({ seconds, points });
      await loadMovementData();
      setShowLogModal(false);
      setTimerSeconds(0);
      setManualInput('');
    } catch (error) {
      console.error('Error saving hold:', error);
    }
  }

  const categories = Object.entries(STATIC_CATEGORIES);

  // Main screen — category selection
  if (!selectedCategory && !selectedLevel) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={[styles.backButton, { borderColor: theme.card.border }]}>
            <Text style={{ color: theme.text.secondary }}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.accent }]}>STATIC WORLD</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Level Overall Leaderboards */}
        <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>OVERALL LEVELS</Text>
        <View style={styles.levelRow}>
          {([1, 2, 3] as const).map(level => (
            <TouchableOpacity
              key={level}
              style={[styles.levelCard, { backgroundColor: theme.card.background, borderColor: theme.accent }]}
              onPress={() => setSelectedLevel(level)}
            >
              <Text style={[styles.levelName, { color: theme.accent }]}>{STATIC_LEVELS[level].name}</Text>
              <Text style={[styles.levelSubtitle, { color: theme.text.tertiary }]}>{STATIC_LEVELS[level].subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Movement Categories */}
        <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>MOVEMENTS</Text>
        <View style={styles.categoryGrid}>
          {categories.map(([key, cat]) => (
            <TouchableOpacity
              key={key}
              style={[styles.categoryCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}
              onPress={() => setSelectedCategory(key)}
            >
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text style={[styles.categoryName, { color: theme.text.primary }]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // Level leaderboard screen
  if (selectedLevel) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedLevel(null)} style={[styles.backButton, { borderColor: theme.card.border }]}>
            <Text style={{ color: theme.text.secondary }}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.accent }]}>{STATIC_LEVELS[selectedLevel].name}</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={[styles.subtitle, { color: theme.text.tertiary }]}>{STATIC_LEVELS[selectedLevel].subtitle}</Text>
        <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>MOVEMENTS IN THIS LEVEL</Text>
        {getLevelMovements(selectedLevel).map(m => (
          <View key={m.id} style={[styles.movementRow, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
            <Text style={[styles.movementName, { color: theme.text.primary }]}>{m.name}</Text>
            <Text style={[styles.multiplierBadge, { color: theme.accent }]}>{m.multiplier}x</Text>
          </View>
        ))}
        <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>LEADERBOARD</Text>
        {loading ? <ActivityIndicator color={theme.accent} /> : (
          <ScrollView>
            {entries.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>No warriors yet. Be the first!</Text>
            ) : entries.slice(0, 5).map((entry, index) => (
              <View key={entry.user_id} style={[styles.entryRow, { backgroundColor: theme.card.background, borderColor: entry.is_current_user ? theme.accent : theme.card.border }]}>
                <Text style={[styles.rankText, { color: theme.accent }]}>#{entry.rank}</Text>
                <Text style={[styles.nameText, { color: entry.is_current_user ? theme.accent : theme.text.primary }]}>{entry.display_name}</Text>
                <Text style={[styles.scoreText, { color: theme.accent }]}>{entry.best_time_seconds} pts</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // Category screen — show progressions
  if (selectedCategory && !selectedMovement) {
    const movements = getCategoryMovements(selectedCategory);
    const cat = STATIC_CATEGORIES[selectedCategory as keyof typeof STATIC_CATEGORIES];
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedCategory(null)} style={[styles.backButton, { borderColor: theme.card.border }]}>
            <Text style={{ color: theme.text.secondary }}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.accent }]}>{cat.emoji} {cat.name.toUpperCase()}</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>SELECT PROGRESSION</Text>
        {movements.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[styles.progressionCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}
            onPress={() => setSelectedMovement(m)}
          >
            <View>
              <Text style={[styles.progressionName, { color: theme.text.primary }]}>{m.name}</Text>
              <Text style={[styles.levelLabel, { color: theme.text.tertiary }]}>{STATIC_LEVELS[m.level].name} — Level {m.level}</Text>
            </View>
            <Text style={[styles.multiplierBadge, { color: theme.accent }]}>{m.multiplier}x</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  // Movement detail + leaderboard screen
  if (selectedMovement) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedMovement(null)} style={[styles.backButton, { borderColor: theme.card.border }]}>
            <Text style={{ color: theme.text.secondary }}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.accent }]}>{selectedMovement.name.toUpperCase()}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Personal Best */}
        <View style={[styles.pbCard, { backgroundColor: theme.card.background, borderColor: theme.accent }]}>
          <Text style={[styles.pbLabel, { color: theme.text.tertiary }]}>YOUR BEST</Text>
          <Text style={[styles.pbValue, { color: theme.accent }]}>{personalBest ? `${personalBest.seconds}s` : '-'}</Text>
          <Text style={[styles.pbPoints, { color: theme.text.secondary }]}>{personalBest ? `${personalBest.points} pts` : 'No record yet'}</Text>
        </View>

        {/* Log Hold Button */}
        <TouchableOpacity
          style={[styles.logButton, { backgroundColor: theme.accent }]}
          onPress={() => setShowLogModal(true)}
        >
          <Text style={styles.logButtonText}>LOG YOUR HOLD</Text>
        </TouchableOpacity>

        {/* Leaderboard */}
        <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>LEADERBOARD</Text>
        {loading ? <ActivityIndicator color={theme.accent} /> : (
          entries.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>No warriors yet. Be the first!</Text>
          ) : entries.slice(0, 5).map((entry) => (
            <View key={entry.user_id} style={[styles.entryRow, { backgroundColor: theme.card.background, borderColor: entry.is_current_user ? theme.accent : theme.card.border }]}>
              <Text style={[styles.rankText, { color: theme.accent }]}>#{entry.rank}</Text>
              <Text style={[styles.nameText, { color: entry.is_current_user ? theme.accent : theme.text.primary }]}>{entry.display_name}</Text>
              <Text style={[styles.scoreText, { color: theme.accent }]}>{entry.best_time_seconds}s</Text>
            </View>
          ))
        )}

        {/* Log Hold Modal */}
        <Modal visible={showLogModal} transparent animationType="slide" onRequestClose={() => setShowLogModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.accent }]}>
              <Text style={[styles.modalTitle, { color: theme.accent }]}>LOG YOUR HOLD</Text>
              <Text style={[styles.modalSubtitle, { color: theme.text.secondary }]}>{selectedMovement.name}</Text>

              {/* Live Timer */}
              <Text style={[styles.timerDisplay, { color: theme.accent }]}>{timerSeconds}s</Text>
              <View style={styles.timerButtons}>
                <TouchableOpacity
                  style={[styles.timerBtn, { backgroundColor: timerRunning ? '#8B0000' : theme.accent }]}
                  onPress={() => setTimerRunning(!timerRunning)}
                >
                  <Text style={styles.timerBtnText}>{timerRunning ? 'STOP' : 'START'}</Text>
                </TouchableOpacity>
                {!timerRunning && timerSeconds > 0 && (
                  <TouchableOpacity
                    style={[styles.timerBtn, { backgroundColor: theme.accent }]}
                    onPress={() => handleSaveHold(timerSeconds)}
                  >
                    <Text style={styles.timerBtnText}>SAVE {timerSeconds}s</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Manual Input */}
              <Text style={[styles.orText, { color: theme.text.tertiary }]}>— OR ENTER MANUALLY —</Text>
              <TextInput
                style={[styles.manualInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary }]}
                value={manualInput}
                onChangeText={setManualInput}
                placeholder="Enter seconds"
                placeholderTextColor={theme.text.tertiary}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                onPress={() => handleSaveHold(parseFloat(manualInput) || 0)}
              >
                <Text style={styles.timerBtnText}>SAVE MANUAL</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setShowLogModal(false); setTimerSeconds(0); setTimerRunning(false); }}>
                <Text style={[styles.cancelText, { color: theme.text.tertiary }]}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  backButton: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  subtitle: { textAlign: 'center', fontSize: 13, marginBottom: 16 },
  sectionTitle: { fontSize: 10, letterSpacing: 2, paddingHorizontal: 24, marginTop: 16, marginBottom: 8 },
  levelRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  levelCard: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  levelName: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  levelSubtitle: { fontSize: 10, marginTop: 2 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
  categoryCard: { width: '47%', padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  categoryEmoji: { fontSize: 32, marginBottom: 8 },
  categoryName: { fontSize: 13, fontWeight: '700' },
  progressionCard: { marginHorizontal: 16, marginBottom: 8, padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressionName: { fontSize: 15, fontWeight: '700' },
  levelLabel: { fontSize: 11, marginTop: 2 },
  multiplierBadge: { fontSize: 16, fontWeight: '900' },
  movementRow: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between' },
  movementName: { fontSize: 13 },
  pbCard: { marginHorizontal: 16, marginTop: 8, padding: 16, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  pbLabel: { fontSize: 10, letterSpacing: 2 },
  pbValue: { fontSize: 36, fontWeight: '900' },
  pbPoints: { fontSize: 13, marginTop: 4 },
  logButton: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 8, alignItems: 'center' },
  logButtonText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 2 },
  entryRow: { marginHorizontal: 16, marginBottom: 6, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankText: { fontSize: 14, fontWeight: '900', width: 30 },
  nameText: { flex: 1, fontSize: 13 },
  scoreText: { fontSize: 13, fontWeight: '700' },
  emptyText: { textAlign: 'center', padding: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  timerDisplay: { fontSize: 64, fontWeight: '900', marginBottom: 16 },
  timerButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timerBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  timerBtnText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 1 },
  orText: { fontSize: 11, letterSpacing: 2, marginBottom: 12 },
  manualInput: { width: '100%', padding: 12, borderRadius: 8, borderWidth: 1, fontSize: 16, textAlign: 'center', marginBottom: 12 },
  saveBtn: { width: '100%', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  cancelText: { fontSize: 13, letterSpacing: 1, padding: 8 },
});
