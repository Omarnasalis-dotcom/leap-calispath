import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Platform, Alert, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  ChallengeService,
  WeeklyChallenge,
  ChallengeMovement
} from '../services/ChallengeService';
import { useTimer } from '../hooks/useTimer';
import { getOrdinalRank } from '../lib/leaderboard';
import { MOVEMENT_POINTS } from '../lib/weeklyChallenge';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import { Vibration } from 'react-native';
import { LeapLogo } from '../components/LeapLogo';
import { useMountedRef } from '../hooks/useMountedRef';
import { useSafeMutation } from '../hooks/useSafeMutation';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';

// Local types for UI
interface WeeklyEntry {
  id: string;
  user_id: string;
  display_name: string;
  score: number;
  rank: number;
  is_current_user: boolean;
}

const GROUP_NAMES: Record<number, { name: string; tiers: string }> = {
  1: { name: 'NOVICES', tiers: '0-2' },
  2: { name: 'WARRIORS', tiers: '3-5' },
  3: { name: 'LEGENDS', tiers: '6-8' },
};

function getUserGroup(tier: number): 1 | 2 | 3 {
  if (tier < 3) return 1;
  if (tier < 6) return 2;
  return 3;
}

interface WeeklyChallengeScreenProps {
  onClose?: () => void;
}

export function WeeklyChallengeScreen({ onClose }: WeeklyChallengeScreenProps) {
  const { theme } = useTheme();
  const isMounted = useMountedRef();
  const { user, profile } = useAuth();
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null);
  const [entries, setEntries] = useState<WeeklyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(ChallengeService.getCurrentWeekStart());
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  // Timer and submission states isolated in WeeklyChallengeSubmitModal
  const { safeMutate, isMutating: submitting } = useSafeMutation();
  const isAdmin = (profile as any)?.is_admin === true;
  const userGroup = getUserGroup(profile?.strength_tier ?? 0);
  const groupInfo = GROUP_NAMES[userGroup];

  // Admin form state
  const [adminGroupView, setAdminGroupView] = useState<1 | 2 | 3>(userGroup);
  const [allChallenges, setAllChallenges] = useState<WeeklyChallenge[]>([]);
  const [adminForm, setAdminForm] = useState({
    group_id: 1 as 1 | 2 | 3,
    title: '',
    description: '',
    scoring_type: 'time' as 'time' | 'reps',
    movements: [] as ChallengeMovement[],
    time_limit: 10, // default 10 minutes for reps challenges
  });
  const [newMovement, setNewMovement] = useState({ name: '', reps: 0, points: 0 });
  const [showMovementDropdown, setShowMovementDropdown] = useState(false);

  useEffect(() => {
    loadChallenge();
  }, []);

  // Timer effects and control handlers moved to WeeklyChallengeSubmitModal

  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  
  const loadChallenge = async () => {
    setLoading(true);
    try {
      const targetGroup = isAdmin ? adminGroupView : userGroup;
      const activeChallenge = await ChallengeService.getActive(targetGroup, selectedWeekStart);

      if (!isMounted.current) return;
      setChallenge(activeChallenge);

      if (activeChallenge) {
        // Fetch leaderboard directly for now
        const { data: entriesData, error } = await supabase
          .from('weekly_entries')
          .select('*, profiles!user_id (display_name)')
          .eq('challenge_id', activeChallenge.id)
          .order('score', { ascending: activeChallenge.scoring_type === 'time' })
          .order('submitted_at', { ascending: true });

        if (error) throw error;

        const mappedEntries: WeeklyEntry[] = (entriesData || []).map((e, idx) => ({
          id: e.id,
          user_id: e.user_id,
          display_name: e.profiles?.display_name || 'Unknown',
          score: e.score,
          rank: idx + 1,
          is_current_user: e.user_id === user?.id
        }));

        if (!isMounted.current) return;
        setEntries(mappedEntries);

      } else {
        if (!isMounted.current) return;
        setEntries([]);
      }

      if (isAdmin) {
        const all = await ChallengeService.getAllActiveForWeek(selectedWeekStart);
        if (!isMounted.current) return;
        setAllChallenges(all);
      }
    } catch (error) {
      console.error('Error loading challenge:', error);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadChallenge();
  }, [adminGroupView, selectedWeekStart]);

  async function handleCreateChallenge() {
    if (!adminForm.title || adminForm.movements.length === 0) {
      Alert.alert('Error', 'Please enter a title and add at least one movement');
      return;
    }
    
    await safeMutate(async () => {
      await ChallengeService.create({
        group_id: adminForm.group_id,
        title: adminForm.title,
        description: adminForm.description,
        scoring_type: adminForm.scoring_type,
        time_limit: adminForm.time_limit,
        movements: adminForm.movements
      });
      return { data: null, error: null };
    }, {
      onSuccess: async () => {
        Alert.alert('Success', 'Challenge published successfully!');
        if (isMounted.current) {
          setShowAdminModal(false);
        }
        await loadChallenge();
      },
      errorMessage: 'Failed to create challenge'
    });
  }

  async function handleDeleteChallenge() {
    if (!challenge) return;
    const confirmDelete = Platform.OS === 'web'
      ? confirm('Delete this challenge? All leaderboard entries will be removed.')
      : await new Promise(resolve => {
        Alert.alert('Delete Challenge', 'Delete this challenge?', [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) }
        ]);
      });

    if (!confirmDelete) return;

    await safeMutate(async () => {
      await ChallengeService.delete(challenge.id);
      return { data: null, error: null };
    }, {
      onSuccess: async () => {
        Alert.alert('Success', 'Challenge deleted');
        if (isMounted.current) {
          setChallenge(null);
          setEntries([]);
          setShowAdminModal(false);
        }
        await loadChallenge();
      },
      errorMessage: 'Failed to delete'
    });
  }

  if (!profile || !theme) {
    return (
      <View style={[styles.container, { backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }]}>
        <LeapLogo size={40} animated />
      </View>
    );
  }

  const userEntry = entries.find(e => e.is_current_user);

  return (
    <GlobalErrorBoundary>
      <ScrollView style={[styles.container, { backgroundColor: theme.background.primary }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={[styles.backButton, { borderColor: theme.card.border }]}>
            <Text style={{ color: theme.text.secondary }}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.accent }]}>WEEKLY CHALLENGE</Text>
          {isAdmin ? (
            <TouchableOpacity onPress={() => setShowAdminModal(true)} style={[styles.backButton, { borderColor: theme.accent, backgroundColor: 'rgba(205,127,50,0.1)' }]}>
              <Text style={{ color: theme.accent }}>⚙️</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Week Navigation */}
        <View style={styles.weekNav}>
          <TouchableOpacity
            onPress={() => {
              const d = new Date(selectedWeekStart);
              d.setDate(d.getDate() - 7);
              setSelectedWeekStart(d.toISOString().split('T')[0]);
            }}
            style={styles.weekNavBtn}
          >
            <Text style={{ color: theme.text.tertiary, fontSize: 18 }}>◀</Text>
          </TouchableOpacity>

          <View style={styles.weekLabelContainer}>
            <Text style={[styles.weekLabel, { color: theme.text.primary }]}>
              {new Date(selectedWeekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {selectedWeekStart === ChallengeService.getCurrentWeekStart() ? ' (ACTIVE)' : ' (ENDED)'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              if (selectedWeekStart === ChallengeService.getCurrentWeekStart()) return;
              const d = new Date(selectedWeekStart);
              d.setDate(d.getDate() + 7);
              setSelectedWeekStart(d.toISOString().split('T')[0]);
            }}
            style={[styles.weekNavBtn, { opacity: selectedWeekStart === ChallengeService.getCurrentWeekStart() ? 0.2 : 1 }]}
          >
            <Text style={{ color: theme.text.tertiary, fontSize: 18 }}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Group Badge & Admin Group Switcher */}
        {isAdmin ? (
          <View style={styles.adminGroupSwitcher}>
            {([1, 2, 3] as const).map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.adminGroupTab, { borderBottomColor: adminGroupView === g ? theme.accent : 'transparent' }]}
                onPress={() => setAdminGroupView(g)}
              >
                <Text style={[styles.adminGroupTabText, { color: adminGroupView === g ? theme.accent : theme.text.tertiary }]}>
                  {GROUP_NAMES[g].name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={[styles.groupBadge, { backgroundColor: theme.card.background, borderColor: theme.accent }]}>
            <Text style={[styles.groupName, { color: theme.accent }]}>{groupInfo.name}</Text>
            <Text style={[styles.groupTiers, { color: theme.text.tertiary }]}>Tier {groupInfo.tiers}</Text>
          </View>
        )}

        {loading ? (
          <LeapLogo size={40} animated />
        ) : !challenge ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon]}>⏳</Text>
            <Text style={[styles.emptyTitle, { color: theme.text.primary }]}>NO CHALLENGE THIS WEEK</Text>
            <Text style={[styles.emptySubtitle, { color: theme.text.tertiary }]}>Check back Saturday for a new challenge</Text>
            {isAdmin && (
              <TouchableOpacity
                style={[styles.adminButton, { backgroundColor: theme.accent }]}
                onPress={() => setShowAdminModal(true)}
              >
                <Text style={styles.adminButtonText}>+ CREATE CHALLENGE</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Challenge Card */}
            <View style={[styles.challengeCard, { backgroundColor: theme.card.background, borderColor: theme.accent }]}>
              <Text style={[styles.challengeTitle, { color: theme.accent }]}>{challenge.title}</Text>
              {challenge.description ? (
                <Text style={[styles.challengeDesc, { color: theme.text.secondary }]}>{challenge.description}</Text>
              ) : null}
              <View style={[styles.scoringBadge, { backgroundColor: challenge.scoring_type === 'time' ? 'rgba(205,127,50,0.1)' : 'rgba(100,200,100,0.1)' }]}>
                <Text style={[styles.scoringText, { color: theme.accent }]}>
                  {challenge.scoring_type === 'time' ? '⏱ FOR TIME' : '💪 FOR REPS'}
                </Text>
              </View>
            </View>

            {/* Movements */}
            <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>MOVEMENTS</Text>
            {challenge.movements.map((m, i) => (
              <View key={i} style={[styles.movementRow, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.movementName, { color: theme.text.primary }]}>{m.name}</Text>
                <View style={styles.movementRight}>
                  <Text style={[styles.movementReps, { color: theme.accent }]}>{m.reps} reps</Text>
                  {challenge.scoring_type === 'reps' && (
                    <Text style={[styles.movementPoints, { color: theme.text.tertiary }]}>{m.points}pts each</Text>
                  )}
                </View>
              </View>
            ))}

            {/* Your Score */}
            {userEntry && (
              <View style={[styles.yourScore, { backgroundColor: 'rgba(205,127,50,0.1)', borderColor: theme.accent }]}>
                <Text style={[styles.yourScoreLabel, { color: theme.text.tertiary }]}>YOUR BEST</Text>
                <Text style={[styles.yourScoreValue, { color: theme.accent }]}>
                  {challenge.scoring_type === 'time'
                    ? `${Math.floor(userEntry.score / 60)}:${String(Math.floor(userEntry.score % 60)).padStart(2, '0')}`
                    : `${userEntry.score} pts`}
                </Text>
                <Text style={[styles.yourScoreRank, { color: theme.text.secondary }]}>RANK #{userEntry.rank}</Text>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.accent }]}
              onPress={() => setShowSubmitModal(true)}
            >
              <Text style={styles.submitButtonText}>
                START CHALLENGE
              </Text>
            </TouchableOpacity>

            {/* Leaderboard */}
            <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>LEADERBOARD</Text>
            {entries.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>No entries yet. Be the first!</Text>
            ) : entries.slice(0, 10).map((entry, index) => (
              <View key={entry.id} style={[styles.entryRow, {
                backgroundColor: entry.is_current_user ? 'rgba(205,127,50,0.1)' : theme.card.background,
                borderColor: entry.is_current_user ? theme.accent : theme.card.border
              }]}>
                <Text style={[styles.entryRank, { color: theme.accent }]}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${entry.rank}`}
                </Text>
                <Text style={[styles.entryName, { color: entry.is_current_user ? theme.accent : theme.text.primary }]}>
                  {entry.display_name}
                  {entry.is_current_user && ' (YOU)'}
                </Text>
                <Text style={[styles.entryScore, { color: theme.accent }]}>
                  {challenge.scoring_type === 'time'
                    ? `${Math.floor(entry.score / 60)}:${String(Math.floor(entry.score % 60)).padStart(2, '0')}`
                    : `${entry.score} pts`}
                </Text>
              </View>
            ))}

            {isAdmin && (
              <TouchableOpacity
                style={[styles.adminButton, { backgroundColor: theme.accent, marginTop: 16 }]}
                onPress={() => setShowAdminModal(true)}
              >
                <Text style={styles.adminButtonText}>⚙️ MANAGE CHALLENGES</Text>
              </TouchableOpacity>
            )}
            
            {showSubmitModal && challenge && (
              <WeeklyChallengeSubmitModal
                visible={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                challenge={challenge}
                user={user}
                theme={theme}
                selectedWeekStart={selectedWeekStart}
                onSubmitSuccess={loadChallenge}
              />
            )}
          </>
        )}

        {/* Admin Modal */}
        <Modal visible={showAdminModal} transparent animationType="slide" onRequestClose={() => setShowAdminModal(false)}>
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.adminModalContent, { backgroundColor: theme.background.primary, borderColor: theme.accent }]}>
                <Text style={[styles.modalTitle, { color: theme.accent }]}>COACH DASHBOARD</Text>

                {/* Active Challenges List */}
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>ACTIVE CHALLENGES THIS WEEK</Text>
                {allChallenges.length === 0 ? (
                  <Text style={{ color: theme.text.tertiary, fontSize: 12, marginBottom: 12 }}>No challenges live yet.</Text>
                ) : (
                  allChallenges.map(ac => (
                    <View key={ac.id} style={[styles.activeChallengeRow, { backgroundColor: theme.card.background }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12 }}>{GROUP_NAMES[ac.group_id as 1 | 2 | 3].name}</Text>
                        <Text style={{ color: theme.text.primary, fontSize: 13 }}>{ac.title}</Text>
                      </View>
                      <TouchableOpacity 
                        disabled={isDeletingId === ac.id}
                        onPress={async () => {
                          if (__DEV__) console.log('DELETE BUTTON CLICKED for challenge:', ac.id);
                          Alert.alert(
                            'Confirm Delete',
                            `Are you sure you want to delete "${ac.title}"?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: async () => {
                                if (isDeletingId === ac.id) return;
                                setIsDeletingId(ac.id);
                                try {
                                  const res = await ChallengeService.delete(ac.id);
                                  if (res) {
                                    Alert.alert('Success', 'Challenge removed');
                                    await loadChallenge();
                                  }
                                } catch (err: any) {
                                  Alert.alert('Error', err.message || 'Failed to delete challenge');
                                } finally {
                                  setIsDeletingId(null);
                                }
                              }}
                            ]
                          );
                      }}>
                        <Text style={{ color: isDeletingId === ac.id ? '#999' : '#8B0000', fontWeight: '900' }}>
                          {isDeletingId === ac.id ? '...' : '✕'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <View style={{ height: 1, backgroundColor: theme.card.border, width: '100%', marginVertical: 16 }} />

                <Text style={[styles.modalTitle, { color: theme.accent, fontSize: 16 }]}>CREATE NEW CHALLENGE</Text>
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>TARGET GROUP</Text>
                <View style={styles.groupSelector}>
                  {([1, 2, 3] as const).map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.groupOption, { borderColor: adminForm.group_id === g ? theme.accent : theme.card.border, backgroundColor: adminForm.group_id === g ? 'rgba(205,127,50,0.1)' : theme.card.background }]}
                      onPress={() => setAdminForm({ ...adminForm, group_id: g })}
                    >
                      <Text style={[styles.groupOptionText, { color: adminForm.group_id === g ? theme.accent : theme.text.tertiary }]}>
                        {GROUP_NAMES[g].name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>TITLE</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary }]}
                  value={adminForm.title}
                  onChangeText={t => setAdminForm({ ...adminForm, title: t })}
                  placeholder="e.g. THE IRON GAUNTLET"
                  placeholderTextColor={theme.text.tertiary}
                />
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>DESCRIPTION (optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary }]}
                  value={adminForm.description}
                  onChangeText={t => setAdminForm({ ...adminForm, description: t })}
                  placeholder="Challenge description"
                  placeholderTextColor={theme.text.tertiary}
                />
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>SCORING TYPE</Text>
                <View style={styles.groupSelector}>
                  {(['time', 'reps'] as const).map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.groupOption, { borderColor: adminForm.scoring_type === s ? theme.accent : theme.card.border, backgroundColor: adminForm.scoring_type === s ? 'rgba(205,127,50,0.1)' : theme.card.background }]}
                      onPress={() => setAdminForm({ ...adminForm, scoring_type: s })}
                    >
                      <Text style={[styles.groupOptionText, { color: adminForm.scoring_type === s ? theme.accent : theme.text.tertiary }]}>
                        {s === 'time' ? '⏱ FOR TIME' : '💪 FOR REPS'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {adminForm.scoring_type === 'reps' && (
                  <>
                    <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>TIME LIMIT (MINUTES)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary }]}
                      value={String(adminForm.time_limit)}
                      onChangeText={t => setAdminForm({ ...adminForm, time_limit: parseInt(t) || 10 })}
                      placeholder="e.g. 10"
                      placeholderTextColor={theme.text.tertiary}
                      keyboardType="numeric"
                    />
                  </>
                )}
                <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>ADD MOVEMENTS</Text>
                <View style={styles.movementInputRow}>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={[styles.movementInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, justifyContent: 'center' }]}
                      onPress={() => setShowMovementDropdown(!showMovementDropdown)}
                    >
                      <Text style={{ color: newMovement.name ? theme.text.primary : theme.text.tertiary }}>
                        {newMovement.name || 'Select movement'}
                      </Text>
                    </TouchableOpacity>
                    {showMovementDropdown && (
                      <View style={[styles.dropdown, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                        <ScrollView style={{ width: '100%' }}>
                          {Object.entries(MOVEMENT_POINTS).map(([name, points]) => (
                            <TouchableOpacity
                              key={name}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setNewMovement({ ...newMovement, name, points });
                                setShowMovementDropdown(false);
                              }}
                            >
                              <Text style={{ color: theme.text.primary }}>{name} ({points} pts)</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  <TextInput
                    style={[styles.repsInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary }]}
                    value={newMovement.reps ? String(newMovement.reps) : ''}
                    onChangeText={t => setNewMovement({ ...newMovement, reps: parseInt(t) || 0 })}
                    placeholder="Reps"
                    placeholderTextColor={theme.text.tertiary}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      if (newMovement.name && newMovement.reps > 0) {
                        setAdminForm({
                          ...adminForm,
                          movements: [...adminForm.movements, { ...newMovement, points: newMovement.points || MOVEMENT_POINTS[newMovement.name] || 1 }]
                        });
                        setNewMovement({ name: '', reps: 0, points: 0 });
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900' }}>+</Text>
                  </TouchableOpacity>
                </View>
                {adminForm.movements.map((m, i) => (
                  <View key={i} style={[styles.movementRow, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                    <Text style={[styles.movementName, { color: theme.text.primary }]}>{m.name} × {m.reps}</Text>
                    <TouchableOpacity onPress={() => setAdminForm({ ...adminForm, movements: adminForm.movements.filter((_, idx) => idx !== i) })}>
                      <Text style={{ color: '#8B0000' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {challenge && (
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: '#8B0000', marginTop: 24 }]}
                    onPress={handleDeleteChallenge}
                  >
                    <Text style={styles.timerBtnText}>DELETE CHALLENGE</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.accent, marginTop: challenge ? 12 : 24 }]}
                  onPress={handleCreateChallenge}
                >
                  <Text style={styles.timerBtnText}>PUBLISH CHALLENGE</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowAdminModal(false)} style={{ marginTop: 12, alignItems: 'center' }}>
                  <Text style={[styles.cancelText, { color: theme.text.tertiary }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>

        <CelebrationBanner
          visible={showCelebration}
          title="WEEKLY WARRIOR"
          subtitle="Challenge Complete"
          stat="Weekly Challenge Conquered"
          emoji="🏆"
          userName={profile?.display_name || 'WARRIOR'}
          onDismiss={() => {
            setShowCelebration(false);
          }}
        />
      </ScrollView>
    </GlobalErrorBoundary>
  );
}

interface WeeklyChallengeSubmitModalProps {
  visible: boolean;
  onClose: () => void;
  challenge: WeeklyChallenge;
  user: any;
  theme: any;
  selectedWeekStart: string;
  onSubmitSuccess: () => Promise<void>;
}

const WeeklyChallengeSubmitModal: React.FC<WeeklyChallengeSubmitModalProps> = ({
  visible,
  onClose,
  challenge,
  user,
  theme,
  selectedWeekStart,
  onSubmitSuccess,
}) => {
  const isMounted = useMountedRef();
  const timerInitial = challenge?.scoring_type === 'reps' ? (challenge.time_limit || 10) * 60 : 0;
  const timerMode = challenge?.scoring_type === 'reps' ? 'down' : 'up';
  const { seconds: timerSeconds, isRunning: timerRunning, start: startTimer, stop: stopTimer, reset: resetTimer, setSeconds: setTimerSeconds } = useTimer(timerInitial, timerMode);

  const [isPreparing, setIsPreparing] = useState(false);
  const [preCountdown, setPreCountdown] = useState(0);

  // Reps-based challenge state
  const [roundsCompleted, setRoundsCompleted] = useState('');
  const [additionalReps, setAdditionalReps] = useState<Record<number, string>>({});
  const [calculatedPoints, setCalculatedPoints] = useState(0);

  const { safeMutate, isMutating: submitting } = useSafeMutation();

  // Lead-in Timer Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPreparing && preCountdown > 0) {
      SoundService.playTick();
      interval = setInterval(() => {
        setPreCountdown(prev => prev - 1);
      }, 1000);
    } else if (isPreparing && preCountdown === 0) {
      setIsPreparing(false);
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
      startTimer();
    }
    return () => clearInterval(interval);
  }, [isPreparing, preCountdown]);

  // Sync timer when challenge loads
  useEffect(() => {
    if (challenge && !timerRunning && !isPreparing) {
      setTimerSeconds(timerInitial);
    }
  }, [challenge, timerInitial, isPreparing]);

  // Auto-stop countdown timer when it hits 0
  useEffect(() => {
    if (challenge?.scoring_type === 'reps' && challenge.time_limit && timerRunning && timerSeconds <= 0) {
      stopTimer();
      SoundService.playDigitalBuzzer(2);
      Vibration.vibrate([0, 500, 200, 500]);
    }
  }, [timerRunning, timerSeconds, challenge]);

  const handleStartWithLeadIn = () => {
    setPreCountdown(5);
    setIsPreparing(true);
    resetTimer();
  };

  // Start lead-in countdown automatically when modal mounts
  useEffect(() => {
    handleStartWithLeadIn();
  }, []);

  const cancelPreparation = () => {
    setIsPreparing(false);
    setPreCountdown(0);
    resetTimer();
  };

  const handleCancel = () => {
    const hasStartedChallenge = challenge?.scoring_type === 'reps' 
      ? timerSeconds !== (challenge?.time_limit || 10) * 60 
      : timerSeconds > 0;

    if (isPreparing || timerRunning || hasStartedChallenge) {
      if (Platform.OS === 'web') {
        if (window.confirm('Are you sure you want to abandon this weekly challenge? Progress will be lost.')) {
          executeCancel();
        }
      } else {
        Alert.alert(
          'ABANDON CHALLENGE',
          'Are you sure you want to abandon this weekly challenge? Progress will be lost.',
          [
            { text: 'KEEP FIGHTING', style: 'cancel', onPress: () => {} },
            {
              text: 'ABANDON',
              style: 'destructive',
              onPress: executeCancel,
            },
          ]
        );
      }
    } else {
      executeCancel();
    }
  };

  const executeCancel = () => {
    cancelPreparation();
    onClose();
  };

  function calculatePointsFrom(rounds: string, repsMap: Record<number, string>) {
    if (!challenge) return 0;
    const roundsNum = parseInt(rounds) || 0;
    let total = 0;
    challenge.movements.forEach((m, idx) => {
      const additional = parseInt(repsMap[idx] || '0') || 0;
      total += (roundsNum * m.reps * m.points) + (additional * m.points);
    });
    return total;
  }

  async function handleSubmit(finalScore: number) {
    if (selectedWeekStart !== ChallengeService.getCurrentWeekStart()) {
      alert("This challenge has ended. You cannot submit scores for previous weeks.");
      return;
    }

    if (!challenge || !user) return;
    
    await safeMutate(async () => {
      const metadata = challenge.scoring_type === 'reps' ? {
        rounds: roundsCompleted,
        additionalReps
      } : {
        finalTimeFormatted: `${Math.floor(finalScore / 60)}:${String(finalScore % 60).padStart(2, '0')}`
      };

      const improved = await ChallengeService.submitScore({
        challengeId: challenge.id,
        userId: user.id,
        score: finalScore,
        scoringType: challenge.scoring_type,
        metadata
      });

      return { data: improved, error: null };
    }, {
      onSuccess: async (improved) => {
        if (improved) {
          Alert.alert('NEW BEST!', 'Your score has been updated on the leaderboard.');
        } else {
          Alert.alert('Not a PB', 'Great effort, but not your best score this week.');
        }
        await onSubmitSuccess();
        onClose();
      }
    });
  }

  return (
    <GlobalErrorBoundary>
      <Modal
        visible={visible}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCancel}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            style={[styles.modalOverlay, { backgroundColor: theme.background.primary }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={true}>
            <Text style={[styles.modalTitle, { color: theme.accent }]}>
              {challenge?.scoring_type === 'time' ? 'FOR TIME' : 'FOR REPS'}
            </Text>

            {/* Workout Reference in Modal */}
            <View style={[styles.modalWorkoutRef, { borderColor: theme.accent + '22' }]}>
              <View style={styles.workoutHeaderRow}>
                <Text style={[styles.workoutHeaderTitle, { color: theme.accent }]}>CHALLENGE PROTOCOL</Text>
                {challenge?.scoring_type === 'reps' && (
                  <Text style={[styles.workoutHeaderSubtitle, { color: theme.text.tertiary }]}>
                    ⏱ {challenge.time_limit} Min Limit
                  </Text>
                )}
              </View>

              <View style={styles.workoutMovementList}>
                {challenge?.movements.map((m, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.workoutMovementItem, 
                      { borderBottomColor: i === challenge.movements.length - 1 ? 'transparent' : 'rgba(255,255,255,0.04)' }
                    ]}
                  >
                    <View style={[styles.stepBadge, { backgroundColor: theme.accent + '15' }]}>
                      <Text style={[styles.stepText, { color: theme.accent }]}>{i + 1}</Text>
                    </View>

                    <Text style={[styles.workoutMovementName, { color: theme.text.primary }]} numberOfLines={1}>
                      {m.name}
                    </Text>

                    <View style={styles.badgeContainer}>
                      <View style={[styles.repBadge, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                        <Text style={[styles.repText, { color: theme.text.secondary }]}>
                          {m.reps} Reps
                        </Text>
                      </View>
                      
                      {challenge.scoring_type === 'reps' && (
                        <View style={[styles.pointPill, { backgroundColor: 'rgba(74, 222, 128, 0.1)' }]}>
                          <Text style={styles.pointPillText}>
                            +{m.points} Pts
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: theme.card.border, width: '100%', marginVertical: 16 }} />

            {challenge?.scoring_type === 'time' ? (
              <>
                {isPreparing ? (
                  <View style={{ alignItems: 'center', marginVertical: 30 }}>
                    <Text style={{ color: theme.accent, fontSize: 96, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{preCountdown}</Text>
                    <Text style={{ color: theme.text.primary, fontSize: 14, fontWeight: '900', letterSpacing: 4, marginBottom: 20 }}>GET READY</Text>
                    <TouchableOpacity 
                      style={[styles.timerBtn, { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1 }]} 
                      onPress={cancelPreparation}
                    >
                      <Text style={[styles.timerBtnText, { color: theme.text.secondary }]}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.timerDisplay, { color: theme.accent }]}>
                      {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
                    </Text>
                    <TouchableOpacity
                      style={[styles.timerBtn, { backgroundColor: timerRunning ? '#8B0000' : theme.accent }]}
                      onPress={() => timerRunning ? stopTimer() : handleStartWithLeadIn()}
                    >
                      <Text style={styles.timerBtnText}>{timerRunning ? 'STOP' : 'START'}</Text>
                    </TouchableOpacity>
                    {!timerRunning && timerSeconds > 0 && (
                      <TouchableOpacity
                        style={[styles.timerBtn, { backgroundColor: theme.card.border, marginBottom: 8 }]}
                        onPress={() => resetTimer()}
                      >
                        <Text style={[styles.timerBtnText, { color: theme.text.secondary }]}>RESET</Text>
                      </TouchableOpacity>
                    )}
                    {!timerRunning && timerSeconds > 0 && (
                      <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: submitting ? 0.7 : 1 }]}
                        onPress={() => handleSubmit(timerSeconds)}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <LeapLogo size={40} animated />
                        ) : (
                          <Text style={styles.timerBtnText}>SAVE {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {/* Reps-based challenge with countdown timer */}
                {isPreparing ? (
                  <View style={{ alignItems: 'center', marginVertical: 30 }}>
                    <Text style={{ color: theme.accent, fontSize: 96, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{preCountdown}</Text>
                    <Text style={{ color: theme.text.primary, fontSize: 14, fontWeight: '900', letterSpacing: 4, marginBottom: 20 }}>GET READY</Text>
                    <TouchableOpacity
                      style={[styles.timerBtn, { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1 }]}
                      onPress={cancelPreparation}
                    >
                      <Text style={[styles.timerBtnText, { color: theme.text.secondary }]}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.timerDisplay, { color: theme.accent }]}>
                      {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
                    </Text>
                    <TouchableOpacity
                      style={[styles.timerBtn, { backgroundColor: timerRunning ? '#8B0000' : theme.accent }]}
                      onPress={() => {
                        if (!timerRunning && timerSeconds <= 0) {
                          setTimerSeconds((challenge?.time_limit || 10) * 60);
                        }
                        timerRunning ? stopTimer() : handleStartWithLeadIn();
                      }}
                    >
                      <Text style={styles.timerBtnText}>{timerRunning ? 'STOP' : 'START'}</Text>
                    </TouchableOpacity>

                    {/* Show entry form when timer hits 0 OR user skips */}
                    {(!timerRunning && timerSeconds === 0) || (!timerRunning && timerSeconds < (challenge?.time_limit || 10) * 60 && timerSeconds > 0) ? (
                      <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: 'rgba(205,127,50,0.2)', marginTop: 4 }]}
                        onPress={() => {
                          stopTimer();
                          setTimerSeconds(0);
                        }}
                      >
                        <Text style={[styles.timerBtnText, { color: theme.accent }]}>DONE — ENTER RESULTS</Text>
                      </TouchableOpacity>
                    ) : null}

                    {/* Skip timer option */}
                    {!timerRunning && timerSeconds === (challenge?.time_limit || 10) * 60 && (
                      <TouchableOpacity
                        onPress={() => setTimerSeconds(0)}
                        style={{ marginTop: 8 }}
                      >
                        <Text style={[styles.cancelText, { color: theme.text.tertiary }]}>SKIP TIMER — ENTER MANUALLY</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {!timerRunning && timerSeconds === 0 ? (
                  <>
                    <Text style={[styles.orText, { color: theme.text.tertiary }]}>ENTER YOUR RESULTS</Text>

                    {/* Rounds input */}
                    <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>ROUNDS COMPLETED</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary }]}
                      value={roundsCompleted}
                      onChangeText={(text) => {
                        const newRounds = text;
                        setRoundsCompleted(newRounds);
                        setCalculatedPoints(calculatePointsFrom(newRounds, additionalReps));
                      }}
                      placeholder="e.g. 3"
                      placeholderTextColor={theme.text.tertiary}
                      keyboardType="numeric"
                    />

                    {/* Additional reps for each movement */}
                    <Text style={[styles.inputLabel, { color: theme.text.tertiary }]}>ADDITIONAL REPS (if incomplete round)</Text>
                    {challenge?.movements.map((m, idx) => (
                      <View key={idx} style={styles.movementInputRow}>
                        <Text style={[styles.movementInputLabel, { color: theme.text.primary }]}>{m.name}</Text>
                        <TextInput
                          style={[styles.repsInput, { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary }]}
                          value={additionalReps[idx] || ''}
                          onChangeText={(text) => {
                            const newReps = { ...additionalReps, [idx]: text };
                            setAdditionalReps(newReps);
                            setCalculatedPoints(calculatePointsFrom(roundsCompleted, newReps));
                          }}
                          placeholder="0"
                          placeholderTextColor={theme.text.tertiary}
                          keyboardType="numeric"
                        />
                      </View>
                    ))}

                    {/* Calculated points display */}
                    <View style={[styles.pointsDisplay, { backgroundColor: 'rgba(205,127,50,0.1)', borderColor: theme.accent }]}>
                      <Text style={[styles.pointsLabel, { color: theme.text.tertiary }]}>TOTAL POINTS</Text>
                      <Text style={[styles.pointsValue, { color: theme.accent }]}>{calculatedPoints}</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: submitting ? 0.7 : 1 }]}
                      onPress={() => {
                        const finalPoints = calculatePointsFrom(roundsCompleted, additionalReps);
                        handleSubmit(finalPoints);
                      }}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <LeapLogo size={40} animated />
                      ) : (
                        <Text style={styles.timerBtnText}>SUBMIT {calculatedPoints} PTS</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  !timerRunning && timerSeconds !== 0 && timerSeconds !== (challenge?.time_limit || 10) * 60 ? null :
                    <Text style={[styles.orText, { color: theme.text.tertiary }]}>Start the timer to begin your workout</Text>
                )}
              </>
            )}

            {!isPreparing && (
              <TouchableOpacity onPress={handleCancel}>
                <Text style={[styles.cancelText, { color: theme.text.tertiary }]}>CANCEL</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
    </GlobalErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  backButton: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  groupBadge: { marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  groupName: { fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  groupTiers: { fontSize: 11, letterSpacing: 2, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  emptySubtitle: { fontSize: 13, textAlign: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 16, marginTop: 8 },
  challengeCard: { marginHorizontal: 16, marginBottom: 8, padding: 20, borderRadius: 12, borderWidth: 2 },
  challengeTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  challengeDesc: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  scoringBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  scoringText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  sectionTitle: { fontSize: 10, letterSpacing: 2, paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  movementRow: { marginHorizontal: 16, marginBottom: 6, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  movementName: { fontSize: 13, flex: 1 },
  movementRight: { alignItems: 'flex-end' },
  movementReps: { fontSize: 13, fontWeight: '700' },
  movementPoints: { fontSize: 10, marginTop: 2 },
  yourScore: { marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  yourScoreLabel: { fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  yourScoreValue: { fontSize: 32, fontWeight: '900' },
  yourScoreRank: { fontSize: 13, marginTop: 4 },
  submitButton: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 8, alignItems: 'center' },
  submitButtonText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 2 },
  entryRow: { marginHorizontal: 16, marginBottom: 6, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  entryRank: { fontSize: 16, width: 36 },
  entryName: { flex: 1, fontSize: 13 },
  entryScore: { fontSize: 13, fontWeight: '700' },
  adminButton: { marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 8, alignItems: 'center' },
  adminButtonText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 1 },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, paddingHorizontal: 16 },
  weekNavBtn: { padding: 10 },
  weekLabelContainer: { paddingHorizontal: 20, alignItems: 'center' },
  weekLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalScrollContent: { flexGrow: 1, alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 16, paddingBottom: 60, width: '100%' },
  modalContent: { width: Platform.OS === 'web' ? 400 : '100%', borderRadius: 16, padding: 24, paddingBottom: 40, alignItems: 'center' },
  modalWorkoutRef: {
    width: '100%',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  workoutHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: 8,
    width: '100%',
  },
  workoutHeaderTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  workoutHeaderSubtitle: {
    fontSize: 10,
    fontWeight: '700',
  },
  workoutMovementList: {
    width: '100%',
    gap: 2,
  },
  workoutMovementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    width: '100%',
  },
  stepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepText: {
    fontSize: 10,
    fontWeight: '900',
  },
  workoutMovementName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginRight: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  repBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  repText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pointPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pointPillText: {
    color: '#4ADE80',
    fontSize: 10,
    fontWeight: '900',
  },
  adminGroupSwitcher: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  adminGroupTab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
  adminGroupTabText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  activeChallengeRow: { width: '100%', flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 2, marginBottom: 16 },
  timerDisplay: { fontSize: 56, fontWeight: '900', marginBottom: 16 },
  timerBtn: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 8, marginBottom: 12 },
  timerBtnText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 1 },
  orText: { fontSize: 11, letterSpacing: 2, marginVertical: 12 },
  input: { width: '100%', padding: 12, borderRadius: 8, borderWidth: 1, fontSize: 14, marginBottom: 12 },
  saveBtn: { width: '100%', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  cancelText: { fontSize: 13, letterSpacing: 1, padding: 8 },
  adminModalContent: { width: Platform.OS === 'web' ? 500 : '100%', borderRadius: 16, borderWidth: 1, padding: 24, paddingBottom: 60 },
  inputLabel: { fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 12 },
  groupSelector: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  groupOption: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  groupOptionText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  movementInputRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  movementInput: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 13 },
  movementInputLabel: { flex: 1, fontSize: 13, alignSelf: 'center' },
  repsInput: { width: 70, padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 13 },
  addBtn: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pointsDisplay: { width: '100%', padding: 16, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginBottom: 12 },
  pointsLabel: { fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  pointsValue: { fontSize: 32, fontWeight: '900' },
  dropdown: { marginTop: 4, borderRadius: 8, borderWidth: 1, maxHeight: 250, width: '100%' },
  dropdownItem: { padding: 12, borderBottomWidth: 1 },
});
