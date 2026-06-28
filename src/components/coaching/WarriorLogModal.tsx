import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LeapLogo } from '../../components/LeapLogo';

interface MinimalBlock {
  id: string | number;
  metadata?: any;
}

interface MinimalDay {
  blocks: MinimalBlock[];
}

interface WarriorLogModalProps {
  logModalVisible: boolean;
  setLogModalVisible: (val: boolean) => void;
  theme: any;
  bronzeGold: string;
  logStatus: 'completed' | 'missed';
  setLogStatus: (val: 'completed' | 'missed') => void;
  days: MinimalDay[];
  activeLogBlockId: string | number | null;
  logAmrapRounds: string;
  setLogAmrapRounds: (val: string) => void;
  logForTimeDuration: string;
  setLogForTimeDuration: (val: string) => void;
  logWeightUsed: string;
  setLogWeightUsed: (val: string) => void;
  logLadderProgress: string;
  setLogLadderProgress: (val: string) => void;
  logRating: number;
  setLogRating: (val: number) => void;
  logNotes: string;
  setLogNotes: (val: string) => void;
  handleLogWorkout: () => void;
  logLoading: boolean;
}

export const WarriorLogModal: React.FC<WarriorLogModalProps> = ({
  logModalVisible,
  setLogModalVisible,
  theme,
  bronzeGold,
  logStatus,
  setLogStatus,
  days,
  activeLogBlockId,
  logAmrapRounds,
  setLogAmrapRounds,
  logForTimeDuration,
  setLogForTimeDuration,
  logWeightUsed,
  setLogWeightUsed,
  logLadderProgress,
  setLogLadderProgress,
  logRating,
  setLogRating,
  logNotes,
  setLogNotes,
  handleLogWorkout,
  logLoading,
}) => {
  return (
    <Modal
      visible={logModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setLogModalVisible(false)}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
          <Text style={[styles.modalHeading, { color: theme.text.primary }]}>LOG WORKOUT DETAILS</Text>

          {/* Done vs. Missed Selection */}
          <View style={{ marginBottom: 20, width: '100%', gap: 8 }}>
            <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>WORKOUT STATUS</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: logStatus === 'completed' ? '#4CAF50' : 'rgba(255,255,255,0.05)',
                  backgroundColor: logStatus === 'completed' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(0,0,0,0.2)',
                  alignItems: 'center'
                }}
                onPress={() => setLogStatus('completed')}
              >
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: logStatus === 'completed' ? '#4CAF50' : theme.text.secondary }}>COMPLETED</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: logStatus === 'missed' ? '#FF6B6B' : 'rgba(255,255,255,0.05)',
                  backgroundColor: logStatus === 'missed' ? 'rgba(255, 107, 107, 0.12)' : 'rgba(0,0,0,0.2)',
                  alignItems: 'center'
                }}
                onPress={() => setLogStatus('missed')}
              >
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: logStatus === 'missed' ? '#FF6B6B' : theme.text.secondary }}>SKIPPED / MISSED</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Conditional Auto-Log Fields */}
          {(() => {
            const activeLogBlock = days.flatMap(d => d.blocks).find(b => b.id === activeLogBlockId);
            if (!activeLogBlock) return null;
            const meta = activeLogBlock.metadata;
            return (
              <View style={{ marginBottom: 20, width: '100%', gap: 12 }}>
                {(meta?.timing_system === 'amrap' || meta?.type === 'amrap') && (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>ROUNDS / REPS COMPLETED</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder="e.g. 5 Rounds + 4 Reps"
                      placeholderTextColor="rgba(255,255,255,0.15)"
                      value={logAmrapRounds}
                      onChangeText={setLogAmrapRounds}
                    />
                  </View>
                )}
                {(meta?.timing_system === 'fortime' || meta?.type === 'fortime') && (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>TIME TO FINISH</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder="e.g. 14:32"
                      placeholderTextColor="rgba(255,255,255,0.15)"
                      value={logForTimeDuration}
                      onChangeText={setLogForTimeDuration}
                    />
                  </View>
                )}
                {meta?.is_weighted && (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>WEIGHT USED (KG)</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder="e.g. 20"
                      placeholderTextColor="rgba(255,255,255,0.15)"
                      keyboardType="numeric"
                      value={logWeightUsed}
                      onChangeText={setLogWeightUsed}
                    />
                  </View>
                )}
                {meta?.structure === 'ladder' && (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>HOW FAR DID YOU REACH?</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder="e.g. Finished round of 14, plus 5 reps"
                      placeholderTextColor="rgba(255,255,255,0.15)"
                      value={logLadderProgress}
                      onChangeText={setLogLadderProgress}
                    />
                  </View>
                )}
              </View>
            );
          })()}

          {/* Performance rating */}
          <View style={styles.ratingSection}>
            <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>RATE INTENSITY / PERFORMANCE</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((ratingVal) => (
                <TouchableOpacity
                  key={ratingVal}
                  style={styles.starBtn}
                  onPress={() => setLogRating(ratingVal)}
                >
                  <Text style={[styles.starChar, { color: ratingVal <= logRating ? '#FF7043' : 'rgba(255,255,255,0.1)' }]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Performance notes */}
          <View style={styles.notesSection}>
            <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>WORKOUT PERFORMANCE NOTES</Text>
            <TextInput
              style={[styles.notesInput, { color: theme.text.primary, borderColor: theme.card.border }]}
              placeholder="How did it feel? Any highlights or modifications..."
              placeholderTextColor="rgba(255,255,255,0.15)"
              value={logNotes}
              onChangeText={(val: string) => setLogNotes(val)}
              multiline={true}
              numberOfLines={3}
            />
          </View>
          <View style={styles.modalBtnRow}>
            <TouchableOpacity
              style={[styles.modalCloseBtn, { borderColor: theme.card.border }]}
              onPress={() => setLogModalVisible(false)}
            >
              <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>CANCEL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={handleLogWorkout}
              disabled={logLoading}
            >
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  paddingVertical: 14,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {logLoading ? (
                  <LeapLogo size={40} animated />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 }}>LOG WORKOUT</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    borderWidth: 2,
    borderRadius: 8,
  },
  modalHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
  },
  modalLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  ratingSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  starBtn: {
    padding: 4,
  },
  starChar: {
    fontSize: 32,
  },
  notesSection: {
    marginBottom: 24,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCloseBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
