import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LeapLogo } from '../../components/LeapLogo';
import { DismissKeyboardOnOutsideTap } from '../DismissKeyboardOnOutsideTap';
import { FeelRpePicker, Feel } from './FeelRpePicker';
import { MissedReasonPicker, MissedReason } from './MissedReasonPicker';
import { t } from '../../i18n';

interface MinimalBlock {
  id: string | number;
  metadata?: any;
  exercises?: { id: string | number; name: string; is_weighted?: boolean }[];
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
  // One kg per weighted exercise, used instead of logWeightUsed when the
  // block has 2+ weighted exercises.
  logExerciseWeights: Record<string, string>;
  setLogExerciseWeight: (exerciseId: string, val: string) => void;
  /** Exercises with planned work but no sets entered — "Complete" asks
   * whether they were all done as planned. */
  plannedExercises: {
    id: string;
    name: string;
    sets: number;
    ticked: number;
    tickedSets: { setIndex: number; reps: number; weight: number | null }[];
  }[];
  plannedAll: boolean;
  setPlannedAll: (val: boolean) => void;
  plannedDone: Record<string, number>;
  setPlannedDone: (exerciseId: string, n: number) => void;
  logLadderProgress: string;
  setLogLadderProgress: (val: string) => void;
  logRating: number;
  setLogRating: (val: number) => void;
  logNotes: string;
  setLogNotes: (val: string) => void;
  handleLogWorkout: () => void;
  logLoading: boolean;
  logFeel: Feel | null;
  setLogFeel: (val: Feel) => void;
  logRpe: number | null;
  setLogRpe: (val: number) => void;
  logMissedReason: MissedReason | null;
  setLogMissedReason: (val: MissedReason) => void;
  logMissedDetail: string;
  setLogMissedDetail: (val: string) => void;
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
  logExerciseWeights,
  setLogExerciseWeight,
  plannedExercises,
  plannedAll,
  setPlannedAll,
  plannedDone,
  setPlannedDone,
  logLadderProgress,
  setLogLadderProgress,
  logRating,
  setLogRating,
  logNotes,
  setLogNotes,
  handleLogWorkout,
  logLoading,
  logFeel,
  setLogFeel,
  logRpe,
  setLogRpe,
  logMissedReason,
  setLogMissedReason,
  logMissedDetail,
  setLogMissedDetail,
}) => {
  return (
    <Modal
      visible={logModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setLogModalVisible(false)}
    >
      <DismissKeyboardOnOutsideTap>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
          <Text style={[styles.modalHeading, { color: theme.text.primary }]}>{t('logModal.heading')}</Text>

          {/* Done vs. Missed Selection */}
          <View style={{ marginBottom: 20, width: '100%', gap: 8 }}>
            <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{t('logModal.status')}</Text>
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
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: logStatus === 'completed' ? '#4CAF50' : theme.text.secondary }}>{t('logModal.completed')}</Text>
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
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: logStatus === 'missed' ? '#FF6B6B' : theme.text.secondary }}>{t('logModal.missed')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sets check: did untouched exercises get all their planned sets? */}
          {logStatus === 'completed' && plannedExercises.length > 0 && (
            <View style={{ marginBottom: 20, width: '100%', gap: 8 }}>
              <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{t('logModal.setsTitle')}</Text>
              {(() => {
                // Confirm what was done: ticked exercises default to their
                // ticked count, untouched ones to the full plan.
                const partial = plannedExercises.filter((ex) => ex.ticked > 0);
                const untouched = plannedExercises.filter((ex) => ex.ticked === 0);
                const mode = partial.length === 0 ? 'untouched' : untouched.length === 0 ? 'ticked' : 'mixed';
                const question =
                  mode === 'untouched'
                    ? t('logModal.setsQuestion')
                    : mode === 'mixed'
                      ? t('logModal.setsQuestionMixed')
                      : partial.length === 1
                        ? t('logModal.setsQuestionTicked', { ticked: partial[0].ticked, sets: partial[0].sets, name: partial[0].name })
                        : t('logModal.setsQuestionTickedMany');
                return (
                  <>
                    <Text style={{ color: theme.text.primary, fontSize: 13, lineHeight: 18 }}>{question}</Text>
                    {/* What was ticked, set by set, so a wrong tick is easy to spot. */}
                    {partial.length > 0 && (
                      <View style={[styles.tickedBox, { borderColor: theme.card.border }]}>
                        {partial.map((ex) => (
                          <Text key={ex.id} style={{ color: theme.text.secondary, fontSize: 12, lineHeight: 17 }}>
                            <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{ex.name}</Text>
                            {' — '}
                            {ex.tickedSets
                              .map((st) =>
                                st.weight
                                  ? t('logModal.tickedSetWeighted', { n: st.setIndex, reps: st.reps, kg: st.weight })
                                  : t('logModal.tickedSet', { n: st.setIndex, reps: st.reps }),
                              )
                              .join(' · ')}
                          </Text>
                        ))}
                      </View>
                    )}
                  </>
                );
              })()}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {([true, false] as const).map((all) => {
                  const on = plannedAll === all;
                  return (
                    <TouchableOpacity
                      key={String(all)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: on ? bronzeGold : 'rgba(255,255,255,0.05)',
                        backgroundColor: on ? 'rgba(201, 162, 39, 0.12)' : 'rgba(0,0,0,0.2)',
                        alignItems: 'center',
                      }}
                      onPress={() => setPlannedAll(all)}
                    >
                      <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: on ? bronzeGold : theme.text.secondary }}>
                        {(() => {
                          const anyTicked = plannedExercises.some((ex) => ex.ticked > 0);
                          const anyUntouched = plannedExercises.some((ex) => ex.ticked === 0);
                          if (!anyTicked) return all ? t('logModal.setsYes') : t('logModal.setsNo');
                          if (!anyUntouched) return all ? t('logModal.setsYesTicked') : t('logModal.setsMore');
                          return all ? t('logModal.setsConfirm') : t('logModal.setsAdjust');
                        })()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!plannedAll && (
                <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 8 }} nestedScrollEnabled>
                  {plannedExercises.map((ex) => {
                    const def = ex.ticked > 0 ? ex.ticked : ex.sets;
                    const done = Math.max(ex.ticked, Math.min(ex.sets, plannedDone[ex.id] ?? def));
                    return (
                      <View key={ex.id} style={styles.setsRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.setsName, { color: theme.text.primary }]} numberOfLines={1}>
                            {ex.name}
                          </Text>
                          {ex.ticked > 0 && (
                            <Text style={{ color: theme.text.tertiary, fontSize: 11 }}>
                              {t('logModal.setsTicked', { count: ex.ticked })}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={t('logModal.setsOneFewer')}
                          disabled={done <= ex.ticked}
                          onPress={() => setPlannedDone(ex.id, done - 1)}
                          style={[styles.setsStep, { borderColor: theme.card.border, opacity: done <= ex.ticked ? 0.35 : 1 }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.setsStepText, { color: theme.text.primary }]}>−</Text>
                        </TouchableOpacity>
                        <Text style={[styles.setsCount, { color: theme.text.primary }]}>
                          {t('logModal.setsDone', { done, planned: ex.sets })}
                        </Text>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={t('logModal.setsOneMore')}
                          disabled={done >= ex.sets}
                          onPress={() => setPlannedDone(ex.id, done + 1)}
                          style={[styles.setsStep, { borderColor: theme.card.border, opacity: done >= ex.sets ? 0.35 : 1 }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.setsStepText, { color: theme.text.primary }]}>+</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {/* Conditional Auto-Log Fields */}
          {(() => {
            const activeLogBlock = days.flatMap(d => d.blocks).find(b => b.id === activeLogBlockId);
            if (!activeLogBlock) return null;
            const meta = activeLogBlock.metadata;
            const weightedExercises = (activeLogBlock.exercises || []).filter(ex => ex.is_weighted);
            const perExerciseWeights = logStatus === 'completed' && weightedExercises.length >= 2;
            return (
              <View style={{ marginBottom: 20, width: '100%', gap: 12 }}>
                {(meta?.timing_system === 'amrap' || meta?.type === 'amrap') && meta?.structure !== 'ladder' && (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{t('logModal.roundsReps')}</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder={t('logModal.roundsRepsPlaceholder')}
                      placeholderTextColor={theme.text.tertiary}
                      value={logAmrapRounds}
                      onChangeText={setLogAmrapRounds}
                    />
                  </View>
                )}
                {(meta?.timing_system === 'fortime' || meta?.type === 'fortime') && meta?.structure !== 'ladder' && (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{t('logModal.timeToFinish')}</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder={t('logModal.timePlaceholder')}
                      placeholderTextColor={theme.text.tertiary}
                      value={logForTimeDuration}
                      onChangeText={setLogForTimeDuration}
                    />
                  </View>
                )}
                {perExerciseWeights && weightedExercises.map(ex => (
                  <View key={ex.id}>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{`${ex.name} (${t('blocks.kg')})`}</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder={t('logModal.weightPlaceholder')}
                      placeholderTextColor={theme.text.tertiary}
                      keyboardType="numeric"
                      value={logExerciseWeights[String(ex.id)] ?? ''}
                      onChangeText={(val) => setLogExerciseWeight(String(ex.id), val)}
                    />
                  </View>
                ))}
                {meta?.is_weighted && !perExerciseWeights && (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{t('logModal.weightUsed')}</Text>
                    <TextInput
                      style={[styles.notesInput, { minHeight: 45, color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder={t('logModal.weightPlaceholder')}
                      placeholderTextColor={theme.text.tertiary}
                      keyboardType="numeric"
                      value={logWeightUsed}
                      onChangeText={setLogWeightUsed}
                    />
                  </View>
                )}
                {meta?.structure === 'ladder' && logLadderProgress ? (
                  <View>
                    <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{t('logModal.ladderResult')}</Text>
                    <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }}>
                      {logLadderProgress}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })()}

          {/* Missed reason (only when marked missed) */}
          {logStatus === 'missed' && (
            <View style={{ marginBottom: 20, width: '100%' }}>
              <MissedReasonPicker
                theme={theme}
                missedReason={logMissedReason}
                setMissedReason={setLogMissedReason}
                missedDetail={logMissedDetail}
                setMissedDetail={setLogMissedDetail}
              />
            </View>
          )}

          {/* Feel + RPE (only when completed) */}
          {logStatus === 'completed' && (
            <View style={{ marginBottom: 20, width: '100%' }}>
              <FeelRpePicker
                theme={theme}
                bronzeGold={bronzeGold}
                feel={logFeel}
                setFeel={setLogFeel}
                rpe={logRpe}
                setRpe={setLogRpe}
              />
            </View>
          )}

          {/* Performance notes */}
          <View style={styles.notesSection}>
            <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>{t('logModal.notes')}</Text>
            <TextInput
              style={[styles.notesInput, { color: theme.text.primary, borderColor: theme.card.border }]}
              placeholder={t('logModal.notesPlaceholder')}
              placeholderTextColor={theme.text.tertiary}
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
              <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>{t('logModal.cancel')}</Text>
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
                  <Text style={{ color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 }}>{t('logModal.logWorkout')}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </DismissKeyboardOnOutsideTap>
    </Modal>
  );
};

const styles = StyleSheet.create({
  tickedBox: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  setsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  setsName: { fontSize: 13 },
  setsStep: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  setsStepText: { fontSize: 18, fontWeight: '600', lineHeight: 20 },
  setsCount: { minWidth: 70, textAlign: 'center', fontFamily: 'BarlowCondensed-Bold', fontSize: 14 },
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
