import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlockConceptParser } from '../../lib/BlockConceptParser';

interface MinimalExercise {
  id: string | number;
  name: string;
  reps: string | number;
  hold_seconds?: string | number;
  is_weighted?: boolean;
}

interface MinimalBlock {
  id: string | number;
  name: string;
  metadata?: any;
  exercises: MinimalExercise[];
}

interface MinimalDay {
  blocks: MinimalBlock[];
}

interface WarriorTimerModalProps {
  timerModalVisible: boolean;
  setTimerModalVisible: (val: boolean) => void;
  setTimerRunning: (val: boolean) => void;
  timerRunning: boolean;
  theme: any;
  bronzeGold: string;
  timerType: 'amrap' | 'fortime' | 'rest' | 'tabata' | null;
  tabataPhase?: 'work' | 'rest';
  tabataWorkSecs?: number;
  tabataRestSecs?: number;
  timerPrepCountdown: number | null;
  timeLeft: number;
  elapsedTime: number;
  formatTimerString: (seconds: number) => string;
  handleForTimeCompletion: (blockId: string | number | null, elapsed: number) => void;
  activeTimerBlockId: string | number | null;
  days: MinimalDay[];
  currentRound: number;
  totalRounds: number;
  restSeconds: number;
  handleStartRest: () => void;
  handleBlockComplete: (blockId: string | number | null) => void;
}

export const WarriorTimerModal: React.FC<WarriorTimerModalProps> = ({
  timerModalVisible,
  setTimerModalVisible,
  setTimerRunning,
  timerRunning,
  theme,
  bronzeGold,
  timerType,
  timerPrepCountdown,
  timeLeft,
  elapsedTime,
  formatTimerString,
  handleForTimeCompletion,
  activeTimerBlockId,
  days,
  currentRound,
  totalRounds,
  restSeconds,
  handleStartRest,
  handleBlockComplete,
  tabataPhase,
  tabataWorkSecs,
  tabataRestSecs,
}) => {
  return (
    <Modal
      visible={timerModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => {
        if (timerPrepCountdown !== null || timerRunning || (timerType === 'rest' && timeLeft > 0 && timeLeft < restSeconds && currentRound < totalRounds)) {
          Alert.alert(
            "WARNING",
            "Are you sure you want to end the timer early?",
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'End Timer', 
                style: 'destructive',
                onPress: () => {
                  setTimerRunning(false);
                  setTimerModalVisible(false);
                }
              }
            ]
          );
        } else {
          setTimerRunning(false);
          setTimerModalVisible(false);
        }
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderWidth: 0, maxWidth: 420, alignItems: 'center' }]}>
          <Text style={[styles.modalHeading, { color: theme.text.primary }]}>
            {timerType === 'amrap' ? 'AMRAP COUNTDOWN' : timerType === 'fortime' ? 'FOR TIME STOPWATCH' : timerType === 'tabata' ? `TABATA — ROUND ${currentRound} OF ${totalRounds}` : totalRounds > 1 ? `REST INTERVAL (ROUND ${currentRound} OF ${totalRounds})` : 'REST INTERVAL'}
          </Text>

          {/* Timer visual circle using a gradient border trick */}
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              width: 170,
              height: 170,
              borderRadius: 85,
              alignItems: 'center',
              justifyContent: 'center',
              marginVertical: 20,
            }}
          >
            <View style={{
              width: 158,
              height: 158,
              borderRadius: 79,
              backgroundColor: theme.card.background,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {timerType === 'tabata' && timerPrepCountdown === null && (
                <Text style={{
                  color: tabataPhase === 'work' ? '#4CAF50' : '#FF7043',
                  fontSize: 11,
                  fontFamily: 'BarlowCondensed-ExtraBold',
                  letterSpacing: 2,
                  marginBottom: 2,
                }}>
                  {tabataPhase === 'work' ? '● WORK' : '○ REST'}
                </Text>
              )}
              <Text style={{
                color: timerPrepCountdown !== null ? '#FF7043' : timerType === 'tabata' ? (tabataPhase === 'work' ? '#4CAF50' : '#FF7043') : theme.text.primary,
                fontSize: timerPrepCountdown !== null ? 64 : 36,
                fontFamily: 'BarlowCondensed-ExtraBold',
                letterSpacing: 1
              }}>
                {timerPrepCountdown !== null
                  ? timerPrepCountdown
                  : timerType === 'amrap' || timerType === 'rest' || timerType === 'tabata'
                    ? formatTimerString(timeLeft)
                    : formatTimerString(elapsedTime)}
              </Text>
              <Text style={{ color: theme.text.secondary, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', marginTop: 4 }}>
                {timerPrepCountdown !== null ? 'GET READY...' : timerRunning ? 'ACTIVE' : 'PAUSED'}
              </Text>
            </View>
          </LinearGradient>

          {/* Controls */}
          <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 }}>
            {!(timerType === 'rest' && currentRound >= totalRounds - 1 && !timerRunning && timeLeft === restSeconds) && (
              <TouchableOpacity
                style={{ flex: 1 }}
                disabled={timerPrepCountdown !== null}
                onPress={() => {
                  if (timerRunning) {
                    setTimerRunning(false);
                  } else {
                    if (timerType === 'rest') handleStartRest();
                    else setTimerRunning(true);
                  }
                }}
              >
              {timerPrepCountdown !== null ? (
                <View style={{ borderRadius: 6, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>PREPARING...</Text>
                </View>
              ) : timerRunning ? (
                <View style={{ borderRadius: 6, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(230,70,70,0.15)', borderWidth: 1, borderColor: '#FF6B6B' }}>
                  <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>PAUSE</Text>
                </View>
              ) : (
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 6, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1 }}>
                    {timerType === 'rest' && !timerRunning && currentRound < totalRounds ? `START REST (ROUND ${currentRound + 1})` : 'RESUME'}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{
                flex: 1,
                borderRadius: 6,
                paddingVertical: 12,
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderWidth: 1,
                borderColor: theme.card.border
              }}
              onPress={() => {
                if (timerType === 'fortime') {
                  handleForTimeCompletion(activeTimerBlockId, elapsedTime);
                } else {
                  if (timerPrepCountdown !== null || timerRunning || (timerType === 'rest' && timeLeft > 0 && timeLeft < restSeconds && currentRound < totalRounds)) {
                    Alert.alert(
                      "WARNING",
                      "Are you sure you want to end the timer early?",
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'End Timer', 
                          style: 'destructive',
                          onPress: () => {
                            setTimerRunning(false);
                            setTimerModalVisible(false);
                          }
                        }
                      ]
                    );
                  } else {
                    if (timerType === 'rest' && (currentRound >= totalRounds - 1 && timeLeft === restSeconds)) {
                      handleBlockComplete(activeTimerBlockId);
                    } else {
                      setTimerRunning(false);
                      setTimerModalVisible(false);
                    }
                  }
                }
              }}
            >
              <Text style={{
                color: theme.text.secondary,
                fontFamily: 'BarlowCondensed-Bold',
                fontSize: 10
              }}>{timerType === 'fortime' ? 'COMPLETE' : (timerType === 'rest' && currentRound >= totalRounds - 1 && timeLeft === restSeconds) ? 'COMPLETE BLOCK' : 'CLOSE'}</Text>
            </TouchableOpacity>
          </View>

          {timerType === 'fortime' && (
            <TouchableOpacity
              onPress={() => {
                if (timerPrepCountdown !== null || timerRunning) {
                  Alert.alert(
                    "WARNING",
                    "Are you sure you want to cancel the timer?",
                    [
                      { text: 'No', style: 'cancel' },
                      { 
                        text: 'Cancel Timer', 
                        style: 'destructive',
                        onPress: () => {
                          setTimerRunning(false);
                          setTimerModalVisible(false);
                        }
                      }
                    ]
                  );
                } else {
                  setTimerRunning(false);
                  setTimerModalVisible(false);
                }
              }}
              style={{ marginBottom: 20 }}
            >
              <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5, textDecorationLine: 'underline' }}>
                CANCEL TIMER
              </Text>
            </TouchableOpacity>
          )}

          {/* Exercises reference inside the timer */}
          <ScrollView style={{ width: '100%', maxHeight: 150 }} showsVerticalScrollIndicator={false}>
            {(() => {
              const activeBlock = days.flatMap(d => d.blocks).find(b => b.id === activeTimerBlockId);
              if (!activeBlock) return null;
              return (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5, textAlign: 'center' }}>
                    BLOCK: {activeBlock.name.toUpperCase()}{activeBlock.metadata?.rounds ? ` (${activeBlock.metadata.rounds} ROUNDS)` : ''}
                  </Text>
                  {activeBlock.exercises.map((ex, idx) => (
                    <View key={ex.id} style={{ flexDirection: 'column', gap: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                      <Text style={{ color: theme.text.primary, fontSize: 13, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 0.5 }}>
                        {idx + 1}. {ex.name}
                        {ex.is_weighted && <Text style={{ color: theme.accent, fontSize: 11 }}> (WEIGHTED)</Text>}
                      </Text>
                      <Text style={{ color: theme.text.secondary, fontSize: 12, fontFamily: 'BarlowCondensed-Medium' }}>
                        {timerType === 'tabata' 
                          ? `${tabataWorkSecs}S WORK / ${tabataRestSecs}S REST` 
                          : activeBlock.metadata?.structure === 'ladder' 
                            ? BlockConceptParser.getLadderSequence(activeBlock.metadata || {}) 
                            : `${ex.reps}${!String(ex.reps).toUpperCase().includes('REP') && !String(ex.reps).toUpperCase().includes('SEC') && !String(ex.reps).toUpperCase().includes('MIN') ? ' REPS' : ''}${ex.hold_seconds && parseInt(String(ex.hold_seconds)) > 0 ? ` + HOLD ${ex.hold_seconds} SEC` : ''}`}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        </View>
      </View>
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
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
  },
});
