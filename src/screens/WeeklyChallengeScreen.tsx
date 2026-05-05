import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Platform, Alert
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  WeeklyChallenge, WeeklyEntry, GROUP_NAMES, getUserGroup,
  getActiveChallenge, getChallengeLeaderboard, submitChallengeScore,
  createChallenge, deleteChallenge, getCurrentWeekStart, getAllActiveChallengesForWeek, ChallengeMovement, MOVEMENT_POINTS
} from '../lib/weeklyChallenge';

interface WeeklyChallengeScreenProps {
  onClose: () => void;
}

export function WeeklyChallengeScreen({ onClose }: WeeklyChallengeScreenProps) {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null);
  const [entries, setEntries] = useState<WeeklyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(getCurrentWeekStart());
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [manualScore, setManualScore] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<any>(null);
  // Reps-based challenge state
  const [roundsCompleted, setRoundsCompleted] = useState('');
  const [additionalReps, setAdditionalReps] = useState<Record<number, string>>({});
  const [calculatedPoints, setCalculatedPoints] = useState(0);
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

  useEffect(() => {
    if (timerRunning) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          if (challenge?.scoring_type === 'reps' && challenge.time_limit) {
            // Countdown timer for reps-based challenges
            const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
            const remaining = (challenge.time_limit * 60) - elapsed;
            setTimerSeconds(remaining);
            if (remaining <= 0) {
              setTimerRunning(false);
              setTimerSeconds(0);
            }
          } else {
            // Stopwatch for time-based challenges
            setTimerSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }
        }
      }, 500);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerRunning, challenge]);

  async function loadChallenge() {
    setLoading(true);
    try {
      const targetGroup = isAdmin ? adminGroupView : userGroup;
      const c = await supabase
        .from('weekly_challenges')
        .select('*')
        .eq('group_id', targetGroup)
        .eq('week_start', selectedWeekStart)
        .maybeSingle();

      setChallenge(c.data);
      if (isAdmin) {
        const all = await getAllActiveChallengesForWeek();
        setAllChallenges(all);
      }
      if (c.data && user) {
        const e = await getChallengeLeaderboard(c.data.id, user.id, c.data.scoring_type);
        setEntries(e);
        // Initialize countdown timer for reps-based challenges
        if (c.data.scoring_type === 'reps' && c.data.time_limit) {
          setTimerSeconds(c.data.time_limit * 60);
        }
      } else {
        setEntries([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChallenge();
  }, [adminGroupView, selectedWeekStart]);

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

  function calculatePoints() {
    return calculatePointsFrom(roundsCompleted, additionalReps);
  }

  async function handleSubmit(score: number) {
    if (selectedWeekStart !== getCurrentWeekStart()) {
      alert("This challenge has ended. You cannot submit scores for previous weeks.");
      return;
    }
    
    let finalScore = score;
    
    // If we're in Time mode and the timer is running or was recently stopped,
    // calculate the most accurate time directly from the start timestamp.
    if (challenge?.scoring_type === 'time' && startTimeRef.current !== null) {
      finalScore = Math.floor((Date.now() - startTimeRef.current) / 1000);
      console.log('Using absolute timer score:', finalScore);
    }

    console.log('--- Submission Started ---');
    console.log('Target Score:', finalScore);
    
    if (!challenge || !user) {
      console.log('Missing challenge or user');
      return;
    }
    setSubmitting(true);
    try {
      const metadata = challenge.scoring_type === 'reps' ? {
        rounds: roundsCompleted,
        additionalReps
      } : {
        finalTimeFormatted: `${Math.floor(finalScore / 60)}:${String(finalScore % 60).padStart(2, '0')}`
      };
      
      const improved = await submitChallengeScore(challenge.id, user.id, finalScore, challenge.scoring_type, metadata);
      console.log('submitChallengeScore result:', improved);
      if (improved) {
        await loadChallenge();
        setShowSubmitModal(false);
        setTimerSeconds(0);
        setTimerRunning(false);
        startTimeRef.current = null;
        setManualScore('');
        setRoundsCompleted('');
        setAdditionalReps({});
        setCalculatedPoints(0);
      } else {
        if (Platform.OS === 'web') {
          alert('Not your best score. Keep training!');
        } else {
          Alert.alert('Not a PB', 'Not your best score. Keep training!');
        }
      }
    } catch (error) {
      console.error('handleSubmit error:', error);
      if (Platform.OS === 'web') {
        alert(`Error submitting score: ${error}`);
      } else {
        Alert.alert('Error', `Error submitting score: ${error}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateChallenge() {
    console.log('handleCreateChallenge called', adminForm);
    if (!adminForm.title || adminForm.movements.length === 0) {
      console.log('Validation failed', { title: adminForm.title, movements: adminForm.movements.length });
      if (Platform.OS === 'web') {
        alert('Please enter a title and add at least one movement');
      } else {
        Alert.alert('Error', 'Please enter a title and add at least one movement');
      }
      return;
    }
    const challengeData = {
      ...adminForm,
      week_start: getCurrentWeekStart(),
    };
    console.log('Creating challenge with data:', challengeData);
    const result = await createChallenge(challengeData);
    console.log('Create result:', result);
    if (result.success) {
      setShowAdminModal(false);
      await loadChallenge();
    } else {
      if (Platform.OS === 'web') {
        alert(`Failed to create challenge: ${result.error}`);
      } else {
        Alert.alert('Error', `Failed to create challenge: ${result.error}`);
      }
    }
  }

  async function handleDeleteChallenge() {
    if (!challenge) return;
    if (Platform.OS === 'web') {
      if (!confirm('Delete this challenge? All leaderboard entries will be removed.')) return;
    } else {
      Alert.alert(
        'Delete Challenge',
        'Delete this challenge? All leaderboard entries will be removed.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            const result = await deleteChallenge(challenge.id);
            if (result.success) {
              setChallenge(null);
              setEntries([]);
              setShowAdminModal(false);
            } else {
              Alert.alert('Error', `Failed to delete: ${result.error}`);
            }
          }},
        ]
      );
      return;
    }
    const result = await deleteChallenge(challenge.id);
    if (result.success) {
      setChallenge(null);
      setEntries([]);
      setShowAdminModal(false);
    } else {
      if (Platform.OS === 'web') {
        alert(`Failed to delete: ${result.error}`);
      } else {
        Alert.alert('Error', `Failed to delete: ${result.error}`);
      }
    }
  }

  if (!profile || !theme) {
    return (
      <View style={[styles.container, { backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#CD7F32" />
      </View>
    );
  }

  const userEntry = entries.find(e => e.is_current_user);

  return (
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
            {selectedWeekStart === getCurrentWeekStart() ? ' (ACTIVE)' : ' (ENDED)'}
          </Text>
        </View>

        <TouchableOpacity 
          onPress={() => {
            if (selectedWeekStart === getCurrentWeekStart()) return;
            const d = new Date(selectedWeekStart);
            d.setDate(d.getDate() + 7);
            setSelectedWeekStart(d.toISOString().split('T')[0]);
          }}
          style={[styles.weekNavBtn, { opacity: selectedWeekStart === getCurrentWeekStart() ? 0.2 : 1 }]}
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
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
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
              {userEntry ? 'IMPROVE YOUR SCORE' : 'SUBMIT YOUR SCORE'}
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
        </>
      )}

      {/* Submit Score Modal */}
      <Modal visible={showSubmitModal} transparent animationType="slide" onRequestClose={() => setShowSubmitModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.accent }]}>
              <Text style={[styles.modalTitle, { color: theme.accent }]}>
                {challenge?.scoring_type === 'time' ? 'FOR TIME' : 'FOR REPS'}
              </Text>

              {/* Workout Reference in Modal */}
              <View style={styles.modalWorkoutRef}>
                {challenge?.movements.map((m, i) => (
                  <Text key={i} style={{ color: theme.text.secondary, fontSize: 13, marginBottom: 4 }}>
                    • {m.name}: <Text style={{ color: theme.accent, fontWeight: '700' }}>{m.reps} reps</Text>
                  </Text>
                ))}
              </View>
              
              <View style={{ height: 1, backgroundColor: theme.card.border, width: '100%', marginVertical: 16 }} />
            
            {challenge?.scoring_type === 'time' ? (
              <>
                <Text style={[styles.timerDisplay, { color: theme.accent }]}>
                  {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
                </Text>
                <TouchableOpacity
                  style={[styles.timerBtn, { backgroundColor: timerRunning ? '#8B0000' : theme.accent }]}
                  onPress={() => setTimerRunning(!timerRunning)}
                >
                  <Text style={styles.timerBtnText}>{timerRunning ? 'STOP' : 'START'}</Text>
                </TouchableOpacity>
                {!timerRunning && timerSeconds > 0 && (
                  <TouchableOpacity
                    style={[styles.timerBtn, { backgroundColor: theme.card.border, marginBottom: 8 }]}
                    onPress={() => {
                      setTimerSeconds(0);
                      startTimeRef.current = null;
                    }}
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
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.timerBtnText}>SAVE {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                {/* Reps-based challenge with countdown timer */}
                <Text style={[styles.timerDisplay, { color: theme.accent }]}>
                  {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
                </Text>
                <TouchableOpacity
                  style={[styles.timerBtn, { backgroundColor: timerRunning ? '#8B0000' : theme.accent }]}
                  onPress={() => {
                    if (!timerRunning && timerSeconds === (challenge?.time_limit || 10) * 60) {
                      setTimerSeconds((challenge?.time_limit || 10) * 60);
                    }
                    setTimerRunning(!timerRunning);
                  }}
                >
                  <Text style={styles.timerBtnText}>{timerRunning ? 'STOP' : 'START'}</Text>
                </TouchableOpacity>

                {/* Show entry form when timer hits 0 OR user skips */}
                {(!timerRunning && timerSeconds === 0) || (!timerRunning && timerSeconds < (challenge?.time_limit || 10) * 60 && timerSeconds > 0) ? (
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: 'rgba(205,127,50,0.2)', marginTop: 4 }]}
                    onPress={() => {
                      setTimerRunning(false);
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
                        <ActivityIndicator color="#fff" size="small" />
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
            
              <TouchableOpacity onPress={() => setShowSubmitModal(false)}>
                <Text style={[styles.cancelText, { color: theme.text.tertiary }]}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

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
                      <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12 }}>{GROUP_NAMES[ac.group_id as 1|2|3].name}</Text>
                      <Text style={{ color: theme.text.primary, fontSize: 13 }}>{ac.title}</Text>
                    </View>
                    <TouchableOpacity onPress={async () => {
                      if (confirm(`Delete ${ac.title}?`)) {
                        const res = await deleteChallenge(ac.id);
                        if (res.success) loadChallenge();
                      }
                    }}>
                      <Text style={{ color: '#8B0000', fontWeight: '900' }}>✕</Text>
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
    </ScrollView>
  );
}

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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalScrollContent: { flexGrow: 1, alignItems: 'center', padding: 24, width: '100%' },
  modalContent: { width: Platform.OS === 'web' ? 400 : '100%', borderRadius: 16, borderWidth: 1, padding: 24, paddingBottom: 40, alignItems: 'center' },
  modalWorkoutRef: { width: '100%', padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8 },
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
