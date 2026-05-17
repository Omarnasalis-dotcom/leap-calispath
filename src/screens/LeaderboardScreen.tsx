import React, { useState, useEffect, useRef } from 'react';
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
import { TIER_NAMES, POWER_TIER_NAMES } from '../types';
import { TIER_DESCRIPTIONS, POWER_TIER_DESCRIPTIONS } from '../lib/tierDescriptions';
import {
  getTierLeaderboard,
  getPowerTierLeaderboard,
  LeaderboardEntry,
  PersonalBest,
  formatLeaderboardTime,
  getOrdinalRank,
} from '../lib/leaderboard';
import { isPowerWorldUnlocked } from '../lib/powerLogic';
import { RITES_OF_PASSAGE } from '../lib/trials';
import { TIER_REQUIREMENTS, POWER_TIER_REQUIREMENTS } from '../constants/Progression';


interface LeaderboardScreenProps {
  onClose: () => void;
  onPracticeTier: (tier: number) => void;
  onStartEternal: () => void;
  onStartPowerAssessment?: () => void;
  initialCategory?: 'strength' | 'power';
  initialTier?: number;
  onCategoryChange?: (category: 'strength' | 'power') => void;
  onTierChange?: (tier: number) => void;
}

export function LeaderboardScreen({
  onClose,
  onPracticeTier,
  onStartEternal,
  onStartPowerAssessment,
  initialCategory = 'strength',
  initialTier,
  onCategoryChange,
  onTierChange,
}: LeaderboardScreenProps) {
  const { profile, user } = useAuth();
  const { theme } = useTheme();
  const [category, setCategory] = useState<'strength' | 'power'>(initialCategory);
  const [selectedTier, setSelectedTier] = useState(
    initialTier !== undefined ? initialTier :
    initialCategory === 'strength'
      ? (profile?.strength_tier || 0)
      : (profile?.power_tier || 0)
  );
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTierModal, setShowTierModal] = useState(false);
  const [modalTier, setModalTier] = useState(0);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const cacheRef = useRef<{ data: any; timestamp: number } | null>(null);
  const CACHE_DURATION = 60000; // 60 seconds

  // Safe tier name accessor with bounds checking
  const getTierName = (tier: number, cat: 'strength' | 'power') => {
    const names = cat === 'strength' ? TIER_NAMES : POWER_TIER_NAMES;
    const safeIndex = Math.max(0, Math.min(tier, names.length - 1));
    return names[safeIndex] || 'UNKNOWN';
  };

  const isPowerUnlocked = isPowerWorldUnlocked(profile?.strength_tier ?? 0);

  // Tiers the user has unlocked (can view leaderboards for)
  const unlockedTiers = Array.from(
    { length: (category === 'strength' ? profile?.strength_tier ?? 0 : profile?.power_tier ?? 0) + 1 }, 
    (_, i) => i
  );

  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    const cacheKey = `${category}-${selectedTier}`;
    if (
      cacheRef.current &&
      cacheRef.current.data?.key === cacheKey &&
      now - cacheRef.current.timestamp < CACHE_DURATION
    ) {
      setEntries(cacheRef.current.data.entries);
      setPersonalBest(cacheRef.current.data.personalBest);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchData = async () => {
      try {
        const result = category === 'power'
          ? await getPowerTierLeaderboard(selectedTier, user.id)
          : await getTierLeaderboard(selectedTier, user.id);
        setEntries(result.entries);
        setPersonalBest(result.personalBest);
        cacheRef.current = {
          data: { key: cacheKey, entries: result.entries, personalBest: result.personalBest },
          timestamp: now,
        };
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedTier, category, user]);

  const isDemigodEternal = selectedTier === 8 && category === 'strength';
  const canPractice = selectedTier < (category === 'strength' ? (profile?.strength_tier ?? 0) : (profile?.power_tier ?? 0));
  const isCurrentTier = selectedTier === (category === 'strength' ? (profile?.strength_tier ?? 0) : (profile?.power_tier ?? 0));

  return (
    <ScrollView style={styles.container}>
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
            const newTier = Math.min(profile?.strength_tier || 0, TIER_NAMES.length - 1);
            setCategory('strength');
            setSelectedTier(newTier);
            if (onCategoryChange) onCategoryChange('strength');
            if (onTierChange) onTierChange(newTier);
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
            const newTier = Math.min(profile?.power_tier || 0, POWER_TIER_NAMES.length - 1);
            setCategory('power');
            setSelectedTier(newTier);
            if (onCategoryChange) onCategoryChange('power');
            if (onTierChange) onTierChange(newTier);
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

<ScrollView
        horizontal
        style={styles.tierSelector}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {(category === 'strength' ? TIER_NAMES : POWER_TIER_NAMES).map((name, tierIndex) => {
          const isUnlocked = tierIndex <= (category === 'strength' ? (profile?.strength_tier ?? 0) : (profile?.power_tier ?? 0));
          return (
            <TouchableOpacity
              key={tierIndex}
              style={[
                styles.tierItem,
                { backgroundColor: theme.card.background, borderColor: theme.card.border },
                selectedTier === tierIndex && { borderColor: theme.accent, backgroundColor: theme.background.secondary },
                !isUnlocked && { opacity: 0.5 }
              ]}
              onPress={() => {
                setSelectedTier(tierIndex);
                if (onTierChange) onTierChange(tierIndex);
              }}
            >
              <Text style={[
                styles.tierItemName,
                { color: theme.text.tertiary },
                selectedTier === tierIndex && { color: theme.accent }
              ]}>
                {name.toUpperCase()}
              </Text>
              <Text style={[
                styles.tierItemNumber,
                { color: theme.text.tertiary },
                selectedTier === tierIndex && { color: theme.accent }
              ]}>
                Tier {tierIndex}
              </Text>
              {!isUnlocked && (
                <View style={{ position: 'absolute', top: 4, right: 4 }}>
                  <Text style={{ fontSize: 8 }}>🔒</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Tier Name Frame */}
      <TouchableOpacity
        style={[styles.tierNameFrame, { borderColor: theme.accent }]}
        onPress={() => {
          setModalTier(selectedTier);
          setShowTierModal(true);
        }}
      >
        <Text style={[styles.currentTierName, { color: theme.accent }]}>
          {getTierName(selectedTier, category).toUpperCase()}
        </Text>
      </TouchableOpacity>

      {/* Stats Dashboard - 3 Big Circles - Always Visible */}
      <View style={styles.statsDashboard}>
        {/* Best Time Circle */}
        <View style={[styles.statCircle, { borderColor: theme.accent, backgroundColor: 'rgba(205, 127, 50, 0.08)' }]}>
          <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>
            {category === 'power' ? 'BEST SCORE' : 'BEST TIME'}
          </Text>
          <Text style={[styles.statCircleValue, { color: theme.text.primary }]}>
            {personalBest?.best_time_seconds
              ? (category === 'power' 
                  ? personalBest.best_time_seconds 
                  : formatLeaderboardTime(personalBest.best_time_seconds).replace("'", ':').replace('"', '')
                )
              : '-'
            }
          </Text>
          <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>
            {category === 'power' ? 'PTS' : (personalBest?.best_time_seconds && personalBest.best_time_seconds < 60 ? 'SEC' : 'MIN')}
          </Text>
        </View>
        
        {/* Rank Circle */}
        <View style={[styles.statCircle, { borderColor: theme.accent, backgroundColor: 'rgba(205, 127, 50, 0.08)', width: 130, height: 130, borderRadius: 65 }]}>
          <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>YOUR RANK</Text>
          <Text style={[styles.statCircleValue, { color: theme.text.primary }]}>
            #{personalBest?.rank || '-'}
          </Text>
          <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>
            OF {entries.length || 0}
          </Text>
        </View>
        
        {/* Gap to Rank Up Circle */}
        <View style={[styles.statCircle, { borderColor: personalBest?.rank === 1 ? '#2ECC71' : '#8B0000', backgroundColor: personalBest?.rank === 1 ? 'rgba(46, 204, 113, 0.08)' : 'rgba(139, 0, 0, 0.08)' }]}>
          <Text style={[styles.statCircleLabel, { color: theme.text.tertiary }]}>GAP TO RANK UP</Text>
          {!personalBest?.rank ? (
            <Text style={[styles.statCircleValue, { color: theme.accent, fontSize: 11, textAlign: 'center', lineHeight: 16 }]}>COMPLETE{'\n'}TRIAL</Text>
          ) : personalBest.rank === 1 ? (
            <Text style={[styles.statCircleValue, { color: '#2ECC71', fontSize: 20 }]}>👑 KING</Text>
          ) : (
            <>
              <Text style={[styles.statCircleValue, { color: theme.text.primary }]}>
                {(() => {
                  const userAbove = entries.find(e => e.rank === ((personalBest?.rank ?? 0) - 1));
                  if (!userAbove || !personalBest?.best_time_seconds) return '-';
                  if (category === 'power') {
                    const gap = (userAbove.best_time_seconds || 0) - (personalBest.best_time_seconds || 0);
                    return `+${Math.max(0, gap)}`;
                  } else {
                    const gap = (personalBest.best_time_seconds || 0) - (userAbove.best_time_seconds || 0);
                    return `-${formatLeaderboardTime(Math.max(0, gap))}`;
                  }
                })()}
              </Text>
              <Text style={[styles.statCircleUnit, { color: theme.text.tertiary }]}>
                {category === 'power' ? 'PTS NEEDED' : 'TIME TO BEAT'}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Practice/Eternal Buttons */}
      <View style={styles.actionButtons}>
        {isCurrentTier && category === 'strength' && !isDemigodEternal && (
          <TouchableOpacity
            style={[styles.practiceButton, { backgroundColor: theme.accent, borderColor: theme.accent }]}
            onPress={() => onPracticeTier(selectedTier)}
          >
            <Text style={[styles.practiceButtonText, { color: '#FFFFFF' }]}>COMPETE THIS TIER</Text>
          </TouchableOpacity>
        )}
        {isCurrentTier && category === 'power' && (
          <TouchableOpacity
            style={[styles.practiceButton, { backgroundColor: theme.accent, borderColor: theme.accent }]}
            onPress={() => onStartPowerAssessment ? onStartPowerAssessment() : onPracticeTier(selectedTier)}
          >
            <Text style={[styles.practiceButtonText, { color: '#FFFFFF' }]}>COMPETE THIS TIER</Text>
          </TouchableOpacity>
        )}
        {canPractice && category === 'strength' && (
          <TouchableOpacity
            style={[styles.practiceButton, { backgroundColor: theme.accent, borderColor: theme.accent }]}
            onPress={() => onPracticeTier(selectedTier)}
          >
            <Text style={[styles.practiceButtonText, { color: '#FFFFFF' }]}>PRACTICE THIS TIER</Text>
          </TouchableOpacity>
        )}
        {canPractice && category === 'power' && (
          <TouchableOpacity
            style={styles.practiceButton}
            onPress={() => onStartPowerAssessment ? onStartPowerAssessment() : onPracticeTier(selectedTier)}
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

      {/* Time to Beat Section */}
      {entries.length > 0 && personalBest && (
        <View style={[styles.timeToBeatCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <View style={styles.timeToBeatHeader}>
            <View style={[styles.timeToBeatDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.timeToBeatLabel, { color: theme.text.tertiary }]}>
              {personalBest.rank === 1 ? 'DEFEND YOUR CROWN' : 'TIME TO BEAT'}
            </Text>
          </View>
          
          {personalBest.rank === 1 ? (
            <View style={styles.timeToBeatContent}>
              <Text style={styles.crownIcon}>👑</Text>
              <Text style={[styles.timeToBeatValue, { color: theme.accent }]}>
                YOU ARE #1
              </Text>
              <Text style={[styles.timeToBeatSubtext, { color: theme.text.secondary }]}>
                Hold your position against challengers
              </Text>
            </View>
          ) : (
            <View style={styles.timeToBeatContent}>
              {entries.find(e => e.rank === (personalBest.rank || 0) - 1) && (
                <>
                  <Text style={[styles.timeToBeatName, { color: theme.text.secondary }]}>
                    {entries.find(e => e.rank === (personalBest.rank || 0) - 1)?.display_name}
                  </Text>
                  <Text style={[styles.timeToBeatValue, { color: theme.accent }]}>
                    {category === 'power' 
                      ? `${entries.find(e => e.rank === (personalBest.rank || 0) - 1)?.best_time_seconds} pts`
                      : formatLeaderboardTime(entries.find(e => e.rank === (personalBest.rank || 0) - 1)?.best_time_seconds || 0)
                    }
                  </Text>
                  <View style={[styles.timeToBeatGap, { backgroundColor: theme.background.secondary }]}>
                    <View style={styles.gapRow}>
                      <Text style={[styles.gapLabel, { color: theme.text.tertiary }]}>GAP</Text>
                      <Text style={[styles.gapValue, { color: theme.accent }]}>
                        {category === 'power'
                          ? `+${(entries.find(e => e.rank === (personalBest.rank || 0) - 1)?.best_time_seconds || 0) - (personalBest.best_time_seconds || 0)} pts`
                          : `-${formatLeaderboardTime((personalBest.best_time_seconds || 0) - (entries.find(e => e.rank === (personalBest.rank || 0) - 1)?.best_time_seconds || 0))}`
                        }
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      )}

      {/* Warriors Headline */}
      <View style={[styles.warriorsHeadline, { borderBottomColor: theme.card.border }]}>
        <Text style={[styles.headlineTitleBig, { color: theme.accent }]}>LEADERBOARD</Text>
        <Text style={[styles.headlineSubtitle, { color: theme.text.secondary }]}>
          {entries.length} WARRIORS
        </Text>
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
        <ScrollView style={styles.listPreview} showsVerticalScrollIndicator={false}>
          {entries.slice(0, 5).map((entry, index) => {
            // Calculate gap for current user
            const showGap = entry.is_current_user && personalBest && personalBest.rank && personalBest.rank > 1;
            const nextEntry = showGap ? entries.find(e => e.rank === personalBest.rank! - 1) : null;
            const gapValue = showGap && nextEntry
              ? (category === 'power'
                  ? `+${(nextEntry.best_time_seconds || 0) - (personalBest.best_time_seconds || 0)} pts`
                  : `-${formatLeaderboardTime((personalBest.best_time_seconds || 0) - (nextEntry.best_time_seconds || 0))}`
                )
              : null;
            
            return (
              <View
                key={entry.user_id}
                style={[
                  styles.entryRow,
                  entry.is_current_user && styles.entryRowCurrentUser,
                  index < 3 && styles.entryRowTopThree,
                ]}
              >
                {/* Rank - Medal or Number */}
                <View style={styles.rankContainer}>
                  {index === 0 && <Text style={styles.medal}>🥇</Text>}
                  {index === 1 && <Text style={styles.medal}>🥈</Text>}
                  {index === 2 && <Text style={styles.medal}>🥉</Text>}
                  {index > 2 && (
                    <View style={[styles.rankCircle, { borderColor: entry.is_current_user ? theme.accent : theme.card.border }]}>
                      <Text style={[styles.rankNumber, { color: entry.is_current_user ? theme.accent : theme.text.tertiary }]}>{entry.rank}</Text>
                    </View>
                  )}
                </View>
                
                {/* Name */}
                <View style={styles.entryInfo}>
                  <Text
                    style={[
                      styles.entryName,
                      { color: entry.is_current_user ? theme.accent : theme.text.primary },
                      entry.is_current_user && styles.entryNameCurrentUser,
                    ]}
                    numberOfLines={1}
                  >
                    {entry.display_name}
                    {entry.is_current_user && <Text style={[styles.youBadge, { backgroundColor: theme.accent }]}> YOU</Text>}
                  </Text>
                </View>
                
                {/* Time Circles - Side by Side */}
                <View style={styles.timeCirclesContainer}>
                  {/* Best Time Circle */}
                  <View style={[styles.timeCircle, { backgroundColor: 'rgba(205, 127, 50, 0.1)', borderColor: theme.accent }]}>
                    <Text style={[styles.timeCircleValue, { color: theme.accent }]}>
                      {category === 'power' 
                        ? `${entry.best_time_seconds}`
                        : formatLeaderboardTime(entry.best_time_seconds).replace(':', "'") + '"'
                      }
                    </Text>
                    <Text style={[styles.timeCircleLabel, { color: theme.accent }]}>
                      {category === 'power' ? 'PTS' : 'TIME'}
                    </Text>
                  </View>
                  
                  {/* Gap Circle (only for current user when not #1) */}
                  {showGap && gapValue && (
                    <View style={[styles.gapCircle, { backgroundColor: 'rgba(255, 100, 100, 0.15)', borderColor: '#FF6464' }]}>
                      <Text style={[styles.gapCircleValue, { color: '#FF6464' }]}>{gapValue}</Text>
                      <Text style={[styles.gapCircleLabel, { color: '#FF6464' }]}>GAP</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* See More Button */}
      {entries.length > 5 && (
        <TouchableOpacity 
          style={styles.seeMoreButton}
          onPress={() => setShowLeaderboardModal(true)}
        >
          <Text style={[styles.seeMoreText, { color: theme.accent }]}>SEE MORE</Text>
        </TouchableOpacity>
      )}

      {/* Full Leaderboard Modal */}
      <Modal
        visible={showLeaderboardModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLeaderboardModal(false)}
      >
        <View style={styles.fullLeaderboardOverlay}>
          <View style={[styles.fullLeaderboardContent, { backgroundColor: theme.background.primary }]}>
            <View style={styles.fullLeaderboardHeader}>
              <Text style={[styles.fullLeaderboardTitle, { color: theme.accent }]}>LEADERBOARD</Text>
              <TouchableOpacity onPress={() => setShowLeaderboardModal(false)}>
                <Text style={[styles.closeButtonText, { color: theme.text.tertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.fullLeaderboardList} showsVerticalScrollIndicator={false}>
              {entries.slice(0, 10).map((entry, index) => (
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
                      <View style={[styles.rankCircle, { borderColor: entry.is_current_user ? theme.accent : theme.card.border }]}>
                        <Text style={[styles.rankNumber, { color: entry.is_current_user ? theme.accent : theme.text.tertiary }]}>{entry.rank}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.entryInfo}>
                    <Text
                      style={[
                        styles.entryName,
                        { color: entry.is_current_user ? theme.accent : theme.text.primary },
                        entry.is_current_user && styles.entryNameCurrentUser,
                      ]}
                      numberOfLines={1}
                    >
                      {entry.display_name}
                    </Text>
                    {entry.is_current_user && (
                      <Text style={[styles.youBadge, { backgroundColor: theme.accent }]}>YOU</Text>
                    )}
                  </View>
                  <View style={styles.timeContainer}>
                    <Text style={[styles.entryTime, { color: theme.accent }]}>
                      {category === 'power' 
                        ? `${entry.best_time_seconds} pts`
                        : formatLeaderboardTime(entry.best_time_seconds)
                      }
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Tier Description Modal */}
      <Modal
        visible={showTierModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTierModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.modalTitleFrame, { borderColor: theme.accent }]}>
                <Text style={[styles.modalTitle, { color: theme.accent }]}>
                  {getTierName(modalTier, category).toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowTierModal(false)}
              >
                <Text style={[styles.closeButtonText, { color: theme.text.tertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalTierLabel, { color: theme.text.secondary }]}>
              Tier {modalTier}
            </Text>

            {/* Difficulty Section */}
            <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
              <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>DIFFICULTY</Text>
              <View style={styles.modalDifficultyRow}>
                <View style={[styles.modalDifficultyBar, { backgroundColor: theme.background.secondary }]}>
                  <View
                    style={[
                      styles.modalDifficultyFill,
                      {
                        backgroundColor: theme.accent,
                        width: `${(((category === 'strength' ? TIER_REQUIREMENTS : POWER_TIER_REQUIREMENTS)[modalTier]?.difficulty || 1) / 9) * 100}%` 
                      }
                    ]}
                  />
                </View>
                <Text style={[styles.modalDifficultyValue, { color: theme.accent }]}>
                  {(category === 'strength' ? TIER_REQUIREMENTS : POWER_TIER_REQUIREMENTS)[modalTier]?.difficulty || 1}/9
                </Text>
              </View>
            </View>

            {/* Requirements Section */}
            <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
              <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>REQUIREMENTS</Text>
              <Text style={[styles.modalDesc, { color: theme.text.secondary }]}>
                {(category === 'strength' ? TIER_REQUIREMENTS : POWER_TIER_REQUIREMENTS)[modalTier]?.desc || 'Complete the trial to advance'}
              </Text>
            </View>

            {/* Trial Movements Preview */}
            {category === 'strength' && RITES_OF_PASSAGE[modalTier] && (
              <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
                <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>TRIAL MOVEMENTS</Text>
                <View style={styles.movementsList}>
                  {RITES_OF_PASSAGE[modalTier].movements.slice(0, 4).map((movement, idx) => (
                    <View key={idx} style={styles.movementItem}>
                      <View style={[styles.movementDot, { backgroundColor: theme.accent }]} />
                      <Text style={[styles.movementText, { color: theme.text.secondary }]}>
                        {movement.name}: {movement.reps}x
                      </Text>
                    </View>
                  ))}
                  {RITES_OF_PASSAGE[modalTier].movements.length > 4 && (
                    <Text style={[styles.moreText, { color: theme.text.tertiary }]}>
                      +{RITES_OF_PASSAGE[modalTier].movements.length - 4} more...
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Action Button - Conditional based on rank */}
            {(isCurrentTier || canPractice) && (
              <TouchableOpacity
                style={[
                  styles.modalLeapButton, 
                  { backgroundColor: isCurrentTier ? theme.accent : 'rgba(205,127,50,0.2)' },
                  !isCurrentTier && { borderWidth: 1, borderColor: theme.accent }
                ]}
                onPress={() => {
                  setShowTierModal(false);
                  if (category === 'power') {
                    if (onStartPowerAssessment) onStartPowerAssessment();
                  } else if (modalTier === 8) {
                    onStartEternal();
                  } else {
                    onPracticeTier(modalTier);
                  }
                }}
              >
                <Text style={[
                  styles.modalLeapText,
                  !isCurrentTier && { color: theme.accent }
                ]}>
                  {isCurrentTier ? 'READY TO LEAP' : 'PRACTICE THIS TIER'}
                </Text>
              </TouchableOpacity>
            )}
            
            {!isCurrentTier && !canPractice && (
              <View style={[styles.lockedIndicator, { borderColor: theme.card.border }]}>
                <Text style={[styles.lockedIndicatorText, { color: theme.text.tertiary }]}>
                  🔒 REACH TIER {modalTier} TO UNLOCK
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
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
    marginTop: 100,
    paddingTop: 16,
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
  tierItem: {
    width: 80,
    height: 70,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  tierItemName: {
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  tierItemNumber: {
    fontSize: 10,
    fontWeight: '700',
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
    alignSelf: 'center',
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
    borderRadius: 20,
    alignItems: 'center',
    maxWidth: 400,
    backgroundColor: 'rgba(18, 18, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(100, 180, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.44,
    shadowRadius: 24,
    elevation: 16,
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
  lockedIndicator: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  lockedIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitleFrame: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  modalTierLabel: {
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 16,
  },
  modalSection: {
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  modalSectionTitle: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  modalDifficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalDifficultyBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  modalDifficultyFill: {
    height: '100%',
    borderRadius: 3,
  },
  modalDifficultyValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  movementsList: {
    gap: 6,
  },
  movementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  movementDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  movementText: {
    fontSize: 13,
  },
  moreText: {
    fontSize: 12,
    marginTop: 4,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
  },
  // Time to Beat Section
  timeToBeatCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  timeToBeatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  timeToBeatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timeToBeatLabel: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  timeToBeatContent: {
    alignItems: 'center',
  },
  crownIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  timeToBeatValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    marginBottom: 4,
  },
  timeToBeatSubtext: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  timeToBeatName: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 4,
  },
  timeToBeatGap: {
    width: '100%',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  gapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gapLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  gapValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  headlineSubtitle: {
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // Leaderboard Entry Styles
  rankCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  youBadge: {
    fontSize: 9,
    color: '#000',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginLeft: 6,
  },
  beatByText: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  currentUserIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  // Time Circle Styles
  timeCirclesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeCircleValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 0.5,
  },
  timeCircleLabel: {
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginTop: 2,
  },
  gapCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapCircleValue: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  gapCircleLabel: {
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginTop: 2,
  },
  // New Layout Styles
  tierSelectorRow: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    gap: 12,
  },
  // Stats Dashboard Styles
  statsDashboard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    gap: 8,
  },
  statCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  statCircleLabel: {
    fontSize: 8,
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 4,
  },
  statCircleValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  statCircleUnit: {
    fontSize: 8,
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-Regular',
    marginTop: 2,
  },
  // Big Title
  headlineTitleBig: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  // Tier Name Header (Upper Center)
  tierNameHeader: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  tierNameHeaderFrame: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderRadius: 16,
  },
  tierNameHeaderText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  // Preview List (first 5 entries)
  listPreview: {
    maxHeight: 500,
    flexGrow: 0,
  },
  // See More Button
  seeMoreButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(205, 127, 50, 0.2)',
    marginTop: 12,
    marginBottom: 8,
  },
  seeMoreText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Full Leaderboard Modal
  fullLeaderboardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fullLeaderboardContent: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 20,
    padding: 20,
  },
  fullLeaderboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullLeaderboardTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  fullLeaderboardList: {
    maxHeight: 400,
  },
});
