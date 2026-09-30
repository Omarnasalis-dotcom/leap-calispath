import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Platform, Alert } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { ChallengeService, WeeklyChallenge, ChallengeMovement } from '../../services/ChallengeService';
import { MOVEMENT_POINTS } from '../../lib/weeklyChallenge';
import { useSafeMutation } from '../../hooks/useSafeMutation';
import { useMountedRef } from '../../hooks/useMountedRef';
import { t as tr } from '../../i18n';

const GROUP_NAMES: Record<number, { name: string }> = {
  1: { name: tr('weekly.novices') },
  2: { name: tr('weekly.warriors') },
  3: { name: tr('weekly.legends') },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The challenge on screen (the DELETE CHALLENGE button acts on it). */
  challenge: WeeklyChallenge | null;
  /** Every active challenge this week, all groups. */
  allChallenges: WeeklyChallenge[];
  onChanged: () => Promise<void> | void;
}

/**
 * Admin create/delete tool, moved out of WeeklyChallengeScreen unchanged
 * (owner decision: keep it, no redesign).
 */
export function WeeklyAdminModal({ visible, onClose, challenge, allChallenges, onChanged }: Props) {
  const { theme } = useTheme();
  const isMounted = useMountedRef();
  const { safeMutate } = useSafeMutation();
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
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
  const showAdminModal = visible;
  const setShowAdminModal = (_: false) => onClose();
  const loadChallenge = async () => { await onChanged(); };

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
        Alert.alert('Delete Challenge', 'Delete this challenge? All leaderboard entries will be removed.', [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) }
        ], { cancelable: true, onDismiss: () => resolve(false) });
      });

    if (!confirmDelete) return;

    await safeMutate(async () => {
      await ChallengeService.delete(challenge.id);
      return { data: null, error: null };
    }, {
      onSuccess: async () => {
        Alert.alert('Success', 'Challenge deleted');
        if (isMounted.current) {
          setShowAdminModal(false);
        }
        await loadChallenge();
      },
      errorMessage: 'Failed to delete'
    });
  }

  return (
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
              <Text style={[styles.cancelText, { color: theme.text.tertiary }]}>{tr('weekly.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  movementRow: { marginHorizontal: 16, marginBottom: 6, padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  movementName: { fontSize: 13, flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  modalScrollContent: { flexGrow: 1, alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 16, paddingBottom: 60, width: '100%' },
  activeChallengeRow: { width: '100%', flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 2, marginBottom: 16 },
  timerBtnText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 1 },
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
  repsInput: { width: 70, padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 13 },
  addBtn: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dropdown: { marginTop: 4, borderRadius: 8, borderWidth: 1, maxHeight: 250, width: '100%' },
  dropdownItem: { padding: 12, borderBottomWidth: 1 },
});
