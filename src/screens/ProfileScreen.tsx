import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TIER_NAMES } from '../types';
import { formatTime } from '../lib/trials';
import { getTierLeaderboard } from '../lib/leaderboard';
import { isPowerWorldUnlocked } from '../lib/powerLogic';

interface ProfileScreenProps {
  onStartTrial?: (tier?: number) => void;
  onViewLeaderboards?: (category: 'strength' | 'power') => void;
  onStartPowerAssessment?: () => void;
}

export function ProfileScreen({ onStartTrial, onViewLeaderboards, onStartPowerAssessment }: ProfileScreenProps) {
  const { profile, signOut, user } = useAuth();
  const { theme } = useTheme();
  const [selectedTier, setSelectedTier] = useState(profile?.strength_tier || 0);
  const [leaderboardBestTime, setLeaderboardBestTime] = useState<number | null>(null);
  const [category, setCategory] = useState<'strength' | 'power'>('strength');
  const [isSwitchingWorld, setIsSwitchingWorld] = useState(false);
  const [showLevelReveal, setShowLevelReveal] = useState(false);

  const isPowerUnlocked = isPowerWorldUnlocked(profile?.strength_tier || 0);

  const handleCategorySwitch = async (newCategory: 'strength' | 'power') => {
    if (newCategory === category || (newCategory === 'power' && !isPowerUnlocked)) return;
    
    setIsSwitchingWorld(true);
    setShowLevelReveal(true);
    
    // Simulate world transition delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setCategory(newCategory);
    setSelectedTier(newCategory === 'strength' 
      ? (profile?.strength_tier || 0)
      : (profile?.power_tier || 0)
    );
    
    setShowLevelReveal(false);
    setIsSwitchingWorld(false);
  };

  useEffect(() => {
    async function fetchLeaderboardBestTime() {
      if (user && category === 'strength' && selectedTier <= (profile?.strength_tier || 0)) {
        const { personalBest } = await getTierLeaderboard(selectedTier, user.id);
        setLeaderboardBestTime(personalBest?.best_time_seconds || null);
      } else {
        setLeaderboardBestTime(null);
      }
    }
    fetchLeaderboardBestTime();
  }, [selectedTier, user, profile, category]);

  async function handleSignOut() {
    Alert.alert(
      'Leave the Arena?',
      'Your progress is saved. Return when ready.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  }

  if (!profile) return null;

  const currentTier = profile?.strength_tier || 0;
  const currentPowerTier = profile?.power_tier || 0;
  
  // Adjusted derived values based on active category
  const activeCurrentTier = category === 'strength' ? currentTier : currentPowerTier;
  const isLocked = selectedTier > activeCurrentTier;
  const isLowerTier = selectedTier < activeCurrentTier;
  const tierName = TIER_NAMES[selectedTier] || 'Unknown';

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <ScrollView>
        <View style={styles.header}>
        {/* User Avatar with Tier Info */}
        <TouchableOpacity style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatarContainer, { borderColor: theme.accent }]}>
              <Text style={[styles.avatarInitial, { color: theme.accent }]}>
                {profile.display_name ? profile.display_name[0].toUpperCase() : profile.email[0].toUpperCase()}
              </Text>
              <Text style={[styles.avatarName, { color: theme.accent }]}>
                {profile.display_name || 'Warrior'}
              </Text>
            </View>
            
            {/* Military-style Tier Badges around the border */}
            {Array.from({ length: activeCurrentTier + 1 }).map((_, i) => {
              // Calculate position around the circle
              const totalBadges = activeCurrentTier + 1;
              const angle = (i * (360 / totalBadges)) - 90; // Start from top
              const radius = 34; // Slightly larger than avatar radius (30)
              const x = radius * Math.cos(angle * (Math.PI / 180));
              const y = radius * Math.sin(angle * (Math.PI / 180));
              
              return (
                <View 
                  key={i} 
                  style={[
                    styles.militaryBadge, 
                    { 
                      backgroundColor: theme.accent,
                      transform: [
                        { translateX: x },
                        { translateY: y },
                        { rotate: `${angle + 90}deg` } // Point towards/away from center
                      ]
                    }
                  ]}
                />
              );
            })}
          </View>
          <Text style={[styles.avatarName, { color: theme.text.primary, marginTop: 4 }]}>
            {profile.display_name || 'Warrior'}
          </Text>
          <Text style={[styles.avatarTier, { color: theme.accent }]}>
            {TIER_NAMES[activeCurrentTier].toUpperCase()} - {category.toUpperCase()} TIER {activeCurrentTier}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category Toggle */}
      <View style={styles.categoryToggle}>
        <TouchableOpacity 
          disabled={isSwitchingWorld}
          style={[
            styles.categoryTab, 
            category === 'strength' && { borderBottomColor: theme.accent, borderBottomWidth: 2 }
          ]}
          onPress={() => handleCategorySwitch('strength')}
        >
          <Text style={[
            styles.categoryText, 
            { color: category === 'strength' ? theme.accent : theme.text.tertiary }
          ]}>STRENGTH</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          disabled={!isPowerUnlocked || isSwitchingWorld}
          style={[
            styles.categoryTab, 
            category === 'power' && { borderBottomColor: theme.accent, borderBottomWidth: 2 },
            !isPowerUnlocked && { opacity: 0.5 }
          ]}
          onPress={() => handleCategorySwitch('power')}
        >
          <View style={styles.row}>
            {!isPowerUnlocked && <Text style={{ fontSize: 10, marginRight: 4 }}>🔒</Text>}
            <Text style={[
              styles.categoryText, 
              { color: category === 'power' ? theme.accent : theme.text.tertiary }
            ]}>POWER</Text>
          </View>
          {!isPowerUnlocked && (
            <Text style={styles.unlockHint}>Reach Platinum-Heart to unlock</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Tier Selector - Category-specific Tiers */}
      <View style={styles.tierSelectorSection}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
            {category === 'power' ? 'POWER TIERS' : 'STRENGTH TIERS'}
          </Text>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tierList}
        >
          {Object.entries(TIER_NAMES).map(([index, name]) => {
            const tierIndex = parseInt(index);
            const isSelected = selectedTier === tierIndex;
            const isCurrent = currentTier === tierIndex;
            const isLockedItem = tierIndex > currentTier;
            
            // Only show tiers that are unlocked in the current category
            if (tierIndex > currentTier) return null;
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.tierItem,
                  { backgroundColor: theme.card.background, borderColor: theme.card.border },
                  isSelected && { borderColor: theme.accent, backgroundColor: theme.background.secondary },
                  isLockedItem && { opacity: 0.5 }
                ]}
                onPress={() => setSelectedTier(tierIndex)}
              >
                <Text style={[
                  styles.tierItemName,
                  { color: theme.text.tertiary },
                  isSelected && { color: theme.accent }
                ]}>
                  {name.toUpperCase()}
                </Text>
                <Text style={[
                  styles.tierItemNumber,
                  { color: theme.text.tertiary },
                  isSelected && { color: theme.accent }
                ]}>
                  Tier {index}
                </Text>
                {isLockedItem && (
                  <View style={styles.lockOverlay}>
                    <Text style={styles.lockIcon}>🔒</Text>
                  </View>
                )}
                {isCurrent && (
                  <View style={[styles.currentIndicator, { backgroundColor: theme.accent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Selected Tier Card */}
      <View style={[styles.rankCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <View style={[styles.sealPlaceholder, { 
          borderColor: isLocked ? theme.card.border : theme.accent, 
          backgroundColor: theme.background.secondary 
        }]}>
          <Text style={[styles.sealText, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
            {isLocked ? '🔒' : tierName[0]}
          </Text>
        </View>
        <Text style={[styles.rankName, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
          {tierName.toUpperCase()}
        </Text>
        <View style={styles.tierRow}>
          <View style={[styles.tierDot, { backgroundColor: isLocked ? theme.card.border : theme.accent }]} />
          <Text style={[styles.tierLabel, { color: theme.text.secondary }]}>
            {isLocked ? `LOCKED - Reach Tier ${selectedTier}` : 
             isLowerTier ? `Tier ${selectedTier} - Unlocked` :
             `Current Tier - ${category.toUpperCase()} Tier ${selectedTier}`}
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsContainer}>
        {category === 'strength' ? (
          <>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.glory_score}</Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>GLORY</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.streak}</Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>STREAK</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.trials_passed}</Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>TRIALS</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: isLocked ? theme.text.tertiary : theme.text.primary }]}>
                {isLocked ? '--:--' : (() => {
                  const bestTime = profile.best_times?.[`tier_${selectedTier}`];
                  return (bestTime && typeof bestTime === 'number' && bestTime > 0) ? formatTime(bestTime) : '--:--';
                })()}
              </Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>BEST TIME</Text>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_points || 0}</Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>POWER POINTS</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_pbs?.pull_up || 0}kg</Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>PULL-UP</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_pbs?.dip || 0}kg</Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>DIP</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_pbs?.muscle_up || 0}kg</Text>
              <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>MUSCLE-UP</Text>
            </View>
          </>
        )}
      </View>

      {/* Action Buttons - Available for all tiers */}
      <View style={styles.actionsSection}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: isLocked ? theme.card.border : theme.accent }]} />
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
            {isLocked ? 'LOCKED TIER - VIEW ONLY' : isLowerTier ? 'PAST ACHIEVEMENT' : 'ACTIONS'}
          </Text>
        </View>

        {/* Row 1: Trial buttons - Orange color */}
        <View style={styles.trialRow}>
          {category === 'strength' ? (
            <>
              {/* Start Trial - only for current tier */}
              {onStartTrial && !isLowerTier && !isLocked && (
                <TouchableOpacity 
                  style={[styles.halfButton, { backgroundColor: theme.accent }]} 
                  onPress={() => onStartTrial()}
                >
                  <Text style={styles.actionButtonText}>START TRIAL</Text>
                </TouchableOpacity>
              )}

              {/* Improve Time - for lower tiers only */}
              {onStartTrial && isLowerTier && (
                <TouchableOpacity 
                  style={[styles.halfButton, { backgroundColor: theme.accent }]} 
                  onPress={() => onStartTrial(selectedTier)}
                >
                  <Text style={styles.actionButtonText}>IMPROVE TIME</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {/* Power Assessment - only for current power tier */}
              {onStartPowerAssessment && !isLowerTier && !isLocked && (
                <TouchableOpacity 
                  style={[styles.halfButton, { backgroundColor: theme.accent }]} 
                  onPress={onStartPowerAssessment}
                >
                  <Text style={styles.actionButtonText}>START ASSESSMENT</Text>
                </TouchableOpacity>
              )}

              {/* Improve Power - for lower tiers */}
              {onStartPowerAssessment && isLowerTier && (
                <TouchableOpacity 
                  style={[styles.halfButton, { backgroundColor: theme.accent }]} 
                  onPress={onStartPowerAssessment}
                >
                  <Text style={styles.actionButtonText}>IMPROVE SCORE</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Locked placeholder for higher tiers */}
          {isLocked && (
            <View style={[styles.halfButton, styles.lockedButton, { borderColor: theme.card.border }]}>
              <Text style={[styles.actionButtonText, { color: theme.text.tertiary }]}>🔒 LOCKED</Text>
            </View>
          )}
        </View>

        {/* Row 2: Leaderboard - White framed */}
        {onViewLeaderboards && (
          <TouchableOpacity 
            style={[
              styles.leaderboardRowButton,
              { 
                backgroundColor: theme.background.primary,
                borderColor: theme.text.primary,
              }
            ]} 
            onPress={() => onViewLeaderboards(category)}
          >
            <Text style={[styles.actionButtonText, { color: theme.text.primary }]}>VIEW LEADERBOARDS</Text>
            <Text style={[styles.arrow, { color: theme.text.primary }]}>→</Text>
          </TouchableOpacity>
        )}

        {/* Locked indicator for higher tiers */}
        {isLocked && (
          <View style={[styles.lockedIndicator, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
            <Text style={[styles.lockedIndicatorText, { color: theme.text.tertiary }]}>
              🔒 Complete {category.toUpperCase()} Tier {activeCurrentTier} to unlock this tier
            </Text>
          </View>
        )}
      </View>

      {/* Info Card */}
      <View style={[styles.infoCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <View style={styles.infoHeader}>
          <View style={[styles.infoDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.infoSectionTitle, { color: theme.text.primary }]}>WARRIOR INFO</Text>
        </View>

        <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>NAME</Text>
        <Text style={[styles.infoValue, { color: theme.text.primary }]}>
          {profile.display_name || profile.email}
        </Text>
        
        {profile.assessed_at ? (
          <>
            <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>ASSESSED</Text>
            <Text style={[styles.infoValue, { color: theme.text.primary }]}>
              {new Date(profile.assessed_at).toLocaleDateString()}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>STATUS</Text>
            <Text style={[styles.infoValue, { color: theme.text.primary }]}>Awaiting Assessment</Text>
          </>
        )}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <View style={[styles.signOutDot, { backgroundColor: theme.text.tertiary }]} />
        <Text style={[styles.signOutText, { color: theme.text.tertiary }]}>
          LEAVE THE ARENA
        </Text>
      </TouchableOpacity>
      </View>
      </ScrollView>

      {/* World Switching Overlay */}
      {isSwitchingWorld && (
        <View style={[styles.switchingOverlay, { backgroundColor: theme.background.primary }]}>
          {showLevelReveal ? (
            <View style={styles.levelReveal}>
              <Text style={[styles.worldTitle, { color: theme.accent }]}>
                {category === 'strength' ? 'STRENGTH WORLD' : 'POWER WORLD'}
              </Text>
              
              <View style={[styles.levelDisplay, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.levelLabel, { color: theme.text.tertiary }]}>CURRENT LEVEL</Text>
                <Text style={[styles.levelValue, { color: theme.accent }]}>
                  {category === 'strength' 
                    ? `Tier ${profile?.strength_tier || 0} - ${TIER_NAMES[profile?.strength_tier || 0]}`
                    : `Tier ${profile?.power_tier || 0} - ${TIER_NAMES[profile?.power_tier || 0]}`
                  }
                </Text>
              </View>

              <View style={[styles.transitioningTo, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.transitioningLabel, { color: theme.text.tertiary }]}>TRANSITIONING TO</Text>
                <Text style={[styles.transitioningValue, { color: theme.accent }]}>
                  {category === 'strength' ? 'POWER WORLD' : 'STRENGTH WORLD'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.switchingText, { color: theme.text.secondary }]}>
                Entering {category === 'strength' ? 'Power' : 'Strength'} World...
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 48,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarSection: {
    alignItems: 'center',
    padding: 10,
  },
  avatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  militaryBadge: {
    position: 'absolute',
    width: 8,
    height: 4,
    borderRadius: 1,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  tierBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    margin: 1,
  },
  avatarName: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    marginTop: 2,
  },
  avatarTier: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 1,
  },
  headerSeal: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerSealText: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  headerTierName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  headerTierLabel: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  underline: {
    height: 3,
    width: 60,
    borderRadius: 2,
    marginTop: 12,
    marginBottom: 16,
  },
  difficultyHierarchy: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  difficultyBar: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    width: '100%',
  },
  difficultySegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  difficultyLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  rankCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    margin: 16,
    alignItems: 'center',
  },
  sealPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sealText: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  rankName: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  tierLabel: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  actionsSection: {
    margin: 16,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  leaderboardButton: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  trialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
  },
  lockedButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  leaderboardRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  arrow: {
    fontSize: 18,
    color: '#FFFFFF',
    marginLeft: 12,
    fontWeight: '700',
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    margin: 16,
    marginTop: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  infoSectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  infoValue: {
    fontSize: 16,
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  signOutButton: {
    margin: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  signOutText: {
    fontSize: 14,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  categoryToggle: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
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
  unlockHint: {
    fontSize: 8,
    color: '#888',
    marginTop: 2,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierSelectorSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  tierList: {
    paddingHorizontal: 16,
    gap: 8,
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
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  tierItemNumber: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 24,
  },
  currentIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  lockedSection: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    margin: 16,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  lockedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  lockedTitle: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  lockedText: {
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  lockedIndicator: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  lockedIndicatorText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // World Switching Overlay
  switchingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  levelReveal: {
    alignItems: 'center',
    gap: 24,
  },
  worldTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    marginBottom: 16,
  },
  levelDisplay: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    minWidth: 280,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 8,
  },
  levelValue: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  transitioningTo: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    minWidth: 280,
  },
  transitioningLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 8,
  },
  transitioningValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  switchingText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
});
