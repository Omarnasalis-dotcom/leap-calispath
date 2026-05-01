import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TIER_NAMES } from '../types';
import { TIER_DESCRIPTIONS } from '../lib/tierDescriptions';
import {
  getTierLeaderboard,
  LeaderboardEntry,
  PersonalBest,
  formatLeaderboardTime,
  getOrdinalRank,
} from '../lib/leaderboard';
import { isPowerWorldUnlocked } from '../lib/powerLogic';

interface LeaderboardScreenProps {
  onClose: () => void;
  onPracticeTier: (tier: number) => void;
  onStartEternal: () => void; // For Tier 8 Demigod Eternal
  initialCategory?: 'strength' | 'power';
}

export function LeaderboardScreen({
  onClose,
  onPracticeTier,
  onStartEternal,
  initialCategory = 'strength',
}: LeaderboardScreenProps) {
  const { profile, user } = useAuth();
  const { theme } = useTheme();
  const [category, setCategory] = useState<'strength' | 'power'>(initialCategory);
  const [selectedTier, setSelectedTier] = useState(
    initialCategory === 'strength' 
      ? (profile?.strength_tier || 0)
      : (profile?.power_tier || 0)
  );
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTierModal, setShowTierModal] = useState(false);
  const [modalTier, setModalTier] = useState(0);

  const isPowerUnlocked = isPowerWorldUnlocked(profile?.strength_tier ?? 0);

  // Tiers the user has unlocked (can view leaderboards for)
  const unlockedTiers = Array.from(
    { length: (category === 'strength' ? profile?.strength_tier ?? 0 : profile?.power_tier ?? 0) + 1 }, 
    (_, i) => i
  );

  useEffect(() => {
    if (user) {
      loadLeaderboard();
    }
  }, [selectedTier, user]);

  async function loadLeaderboard() {
    setLoading(true);
    const { entries: data, personalBest: pb } = await getTierLeaderboard(
      selectedTier,
      user!.id
    );
    setEntries(data);
    setPersonalBest(pb);
    setLoading(false);
  }

  const isDemigodEternal = selectedTier === 8 && category === 'strength';
  const canPractice = selectedTier < (category === 'strength' ? profile?.strength_tier : profile?.power_tier || 0);
  const isCurrentTier = selectedTier === (category === 'strength' ? profile?.strength_tier : profile?.power_tier || 0);

  return (
    <View style={styles.container}>
      {/* Back Button in Upper Left */}
      <View style={styles.backButtonContainer}>
        <TouchableOpacity style={[styles.backButton, { borderColor: theme.card.border }]} onPress={onClose}>
          <Text style={[styles.backButtonText, { color: theme.text.secondary }]}>←</Text>
        </TouchableOpacity>
      </View>

      {/* Category Toggle */}
      <View style={styles.categoryToggleContainer}>
        <TouchableOpacity 
          style={[
            styles.categoryTab, 
            category === 'strength' && { borderBottomColor: theme.accent, borderBottomWidth: 2 }
          ]}
          onPress={() => {
            setCategory('strength');
            setSelectedTier(profile?.strength_tier || 0);
          }}
        >
          <Text style={[
            styles.categoryText, 
            { color: category === 'strength' ? theme.accent : theme.text.tertiary }
          ]}>STRENGTH</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          disabled={!isPowerUnlocked}
          style={[
            styles.categoryTab, 
            category === 'power' && { borderBottomColor: theme.accent, borderBottomWidth: 2 },
            !isPowerUnlocked && { opacity: 0.5 }
          ]}
          onPress={() => {
            setCategory('power');
            setSelectedTier(profile?.power_tier || 0);
          }}
        >
          <View style={styles.row}>
            {!isPowerUnlocked && <Text style={{ fontSize: 10, marginRight: 4 }}>🔒</Text>}
            <Text style={[
              styles.categoryText, 
              { color: category === 'power' ? theme.accent : theme.text.tertiary }
            ]}>POWER</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Tier Selector */}
      <ScrollView horizontal style={styles.tierSelector} showsHorizontalScrollIndicator={false}>
        {unlockedTiers.map((tier) => (
          <TouchableOpacity
            key={tier}
            style={[
              styles.tierTab, 
              { borderColor: theme.card.border },
              selectedTier === tier && { backgroundColor: theme.accent }
            ]}
            onPress={() => setSelectedTier(tier)}
          >
            <Text
              style={[
                styles.tierTabText,
                selectedTier === tier && { color: '#FFFFFF' },
                { color: theme.text.primary }
              ]}
            >
              {TIER_NAMES[tier][0]}
            </Text>
            <Text
              style={[
                styles.tierTabLabel,
                selectedTier === tier && { color: '#FFFFFF' },
                { color: theme.text.secondary }
              ]}
            >
              Tier {tier}
            </Text>
          </TouchableOpacity>
        ))}
        {profile?.strength_tier === 8 && (
          <TouchableOpacity
            style={[styles.tierTab, selectedTier === 8 && styles.tierTabActive]}
            onPress={() => setSelectedTier(8)}
          >
            <Text
              style={[
                styles.tierTabText,
                selectedTier === 8 && styles.tierTabTextActive,
              ]}
            >
              D
            </Text>
            <Text
              style={[
                styles.tierTabLabel,
                selectedTier === 8 && styles.tierTabLabelActive,
              ]}
            >
              Eternal
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Current Tier Display */}
      <View style={styles.currentTierDisplay}>
        <TouchableOpacity 
          style={[styles.tierNameFrame, { borderColor: theme.card.border }]}
          onPress={() => {
            setModalTier(selectedTier);
            setShowTierModal(true);
          }}
        >
          <Text style={[styles.currentTierName, { color: '#FFA500' }]}>
            {TIER_NAMES[selectedTier].toUpperCase()}
          </Text>
        </TouchableOpacity>
        {isDemigodEternal && (
          <Text style={styles.eternalBadge}>ETERNAL MODE</Text>
        )}
      </View>

      {/* Personal Best Card */}
      {personalBest && (
        <View style={styles.personalCard}>
          <Text style={styles.personalLabel}>YOUR BEST</Text>
          <View style={styles.personalRow}>
            <Text style={styles.personalTime}>
              {category === 'power' 
                ? `${personalBest.best_time_seconds} pts`
                : formatLeaderboardTime(personalBest.best_time_seconds!)
              }
            </Text>
            <Text style={styles.personalRank}>
              {getOrdinalRank(personalBest.rank || 0)}
            </Text>
          </View>
          <Text style={styles.personalAttempts}>
            {personalBest.total_attempts} attempts
          </Text>
        </View>
      )}

      {/* Practice/Eternal Buttons */}
      <View style={styles.actionButtons}>
        {canPractice && category === 'strength' && (
          <TouchableOpacity
            style={styles.practiceButton}
            onPress={() => onPracticeTier(selectedTier)}
          >
            <Text style={styles.practiceButtonText}>PRACTICE THIS TIER</Text>
          </TouchableOpacity>
        )}
        {canPractice && category === 'power' && (
          <TouchableOpacity
            style={styles.practiceButton}
            onPress={() => onPracticeTier(selectedTier)}
          >
            <Text style={styles.practiceButtonText}>IMPROVE SCORE</Text>
          </TouchableOpacity>
        )}
        {isDemigodEternal && (
          <TouchableOpacity
            style={styles.eternalButton}
            onPress={onStartEternal}
          >
            <Text style={styles.eternalButtonText}>COMPETE ETERNAL</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Leaderboard Title Above Warriors List */}
      <View style={styles.warriorsHeadline}>
        <Text style={[styles.headlineTitle, { color: theme.accent }]}>LEADERBOARDS</Text>
      </View>

      {/* Leaderboard List */}
      {loading ? (
        <ActivityIndicator color="#CD7F32" style={styles.loader} />
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No warriors have attempted this tier yet.</Text>
          <Text style={styles.emptySubtext}>
            {category === 'power' ? 'Be the first to claim a score!' : 'Be the first to claim a time!'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {entries.map((entry, index) => (
            <View
              key={entry.user_id}
              style={[
                styles.entryRow,
                entry.is_current_user && styles.entryRowCurrentUser,
                index < 3 && styles.entryRowTopThree,
              ]}
            >
              <View style={styles.rankContainer}>
                {index === 0 && <Text style={styles.medal}>🥇</Text>}
                {index === 1 && <Text style={styles.medal}>🥈</Text>}
                {index === 2 && <Text style={styles.medal}>🥉</Text>}
                {index > 2 && (
                  <Text style={styles.rankNumber}>{entry.rank}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.entryName,
                  entry.is_current_user && styles.entryNameCurrentUser,
                ]}
                numberOfLines={1}
              >
                {entry.display_name}
              </Text>
              <Text style={styles.entryTime}>
                {category === 'power' 
                  ? `${entry.best_time_seconds} pts`
                  : formatLeaderboardTime(entry.best_time_seconds)
                }
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Tier Description Modal */}
      <Modal
        visible={showTierModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTierModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalLeapButton}
              onPress={() => {
                setShowTierModal(false);
                if (modalTier === 8) {
                  // For Demigod tier, start eternal mode
                  onStartEternal();
                } else {
                  // For other tiers, start practice mode
                  onPracticeTier(modalTier);
                }
              }}
            >
              <Text style={styles.modalLeapText}>READY TO LEAP</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 60,
    left: 24,
    zIndex: 10,
  },
  categoryToggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 16,
    gap: 16,
  },
  categoryTab: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 20,
  },
  tierSelector: {
    paddingHorizontal: 16,
    marginTop: 80,
    marginBottom: 20,
  },
  currentTierDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  currentTierName: {
    fontSize: 18,
    fontWeight: '700',
  },
  tierNameFrame: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  warriorsHeadline: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(205,127,50,0.2)',
    marginBottom: 12,
  },
  tableHeadline: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(205,127,50,0.2)',
    marginBottom: 16,
  },
  headlineTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 8,
  },
  headlineTier: {
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  backButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#CD7F32',
    letterSpacing: 3,
  },
  placeholder: {
    width: 60,
  },
  tierTabs: {
    maxHeight: 80,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(205,127,50,0.2)',
  },
  tierTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tierTab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  tierTabActive: {
    backgroundColor: 'rgba(205,127,50,0.2)',
    borderColor: '#CD7F32',
  },
  tierTabText: {
    fontSize: 24,
    fontWeight: '900',
    color: 'rgba(205,127,50,0.5)',
  },
  tierTabTextActive: {
    color: '#CD7F32',
  },
  tierTabLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  tierTabLabelActive: {
    color: '#CD7F32',
  },
  tierHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  tierName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#CD7F32',
    letterSpacing: 3,
  },
  eternalBadge: {
    fontSize: 12,
    color: '#8B0000',
    backgroundColor: 'rgba(139,0,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 8,
    letterSpacing: 2,
  },
  personalCard: {
    backgroundColor: 'rgba(205,127,50,0.1)',
    borderWidth: 1,
    borderColor: '#CD7F32',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    alignItems: 'center',
  },
  personalLabel: {
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 8,
  },
  personalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  personalTime: {
    fontSize: 48,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  personalRank: {
    fontSize: 24,
    color: '#CD7F32',
    fontWeight: '700',
  },
  personalAttempts: {
    fontSize: 14,
    marginTop: 8,
  },
  actionButtons: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  practiceButton: {
    backgroundColor: 'rgba(205,127,50,0.2)',
    borderWidth: 1,
    borderColor: '#CD7F32',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  practiceButtonText: {
    color: '#CD7F32',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  eternalButton: {
    backgroundColor: '#8B0000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#8B0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  eternalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  loader: {
    marginTop: 48,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#CD7F32',
    marginTop: 8,
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.1)',
    marginBottom: 8,
  },
  entryRowCurrentUser: {
    backgroundColor: 'rgba(205,127,50,0.15)',
    borderColor: '#CD7F32',
  },
  entryRowTopThree: {
    borderColor: 'rgba(205,127,50,0.4)',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  medal: {
    fontSize: 24,
  },
  rankNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  entryName: {
    flex: 1,
    fontSize: 16,
    color: '#FFA500', // Orange color
    marginLeft: 12,
  },
  entryNameCurrentUser: {
    color: '#32CD32', // Green color for current user
    fontWeight: '700',
  },
  entryTime: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFA500',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255,165,0,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    margin: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalCloseButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  modalCloseButtonSmall: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCloseTextSmall: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modalLeapButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  modalLeapText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#FFFFFF',
  },
});
