import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlockConceptParser } from '../../lib/BlockConceptParser';
import { SoundServiceInstance } from '../../lib/SoundService';

export interface ExerciseDetail {
  id: string | number;
  name: string;
  youtube_url: string;
  sets: string | number;
  reps: string;
  rest_seconds: string | number;
  hold_seconds?: string | number;
  is_weighted?: boolean;
  notes: string;
}

interface WarriorExerciseRowProps {
  exercise: ExerciseDetail;
  theme: any;
  solidCardBg: string;
  bronzeGold: string;
  blockMetadata?: any;
  onToggleVideo: (exerciseId: string | number, url: string) => void;
  isVideoActive?: boolean;
  hideSetControls?: boolean;
}

export const WarriorExerciseRow: React.FC<WarriorExerciseRowProps> = ({
  exercise,
  theme,
  solidCardBg,
  bronzeGold,
  blockMetadata,
  onToggleVideo,
  isVideoActive,
  hideSetControls,
}) => {
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [restCompleted, setRestCompleted] = useState(false);
  const intervalRef = useRef<any>(null);
  // Wall-clock anchor for the rest countdown. JS timers are suspended while
  // the app is backgrounded, so a pure `prev - 1` tick silently loses the
  // whole suspended duration and the displayed rest time under-counts. Same
  // approach as ArenaWorkoutScreen's trial timer.
  const restEndTimeRef = useRef<number | null>(null);

  const restSecs = parseInt(String(exercise.rest_seconds || '0'), 10);

  const startRest = () => {
    if (restSecs <= 0) return;
    setRestCompleted(false);
    setRestActive(true);
    setRestTimeLeft(restSecs);
    SoundServiceInstance.playBoxingBell();
  };

  const cancelRest = () => {
    clearInterval(intervalRef.current);
    restEndTimeRef.current = null;
    setRestActive(false);
    setRestTimeLeft(0);
  };

  useEffect(() => {
    if (restActive && restTimeLeft > 0) {
      if (restEndTimeRef.current === null) {
        restEndTimeRef.current = Date.now() + restTimeLeft * 1000;
      }
      intervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((restEndTimeRef.current! - Date.now()) / 1000));
        setRestTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(intervalRef.current);
          setRestActive(false);
          setRestCompleted(true);
          SoundServiceInstance.playDigitalBuzzer(3);
        }
      }, 1000);
    } else {
      restEndTimeRef.current = null;
    }
    return () => clearInterval(intervalRef.current);
  }, [restActive]);

  // Recompute the moment the app returns to the foreground, so the displayed
  // time is correct immediately rather than after the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && restActive && restEndTimeRef.current !== null) {
        const remaining = Math.max(0, Math.round((restEndTimeRef.current - Date.now()) / 1000));
        setRestTimeLeft(remaining);
        if (remaining <= 0) {
          setRestActive(false);
          setRestCompleted(true);
          SoundServiceInstance.playDigitalBuzzer(3);
        }
      }
    });
    return () => sub.remove();
  }, [restActive]);

  const formatRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={[styles.exerciseRow, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
      <View style={[styles.exInfoRow, { justifyContent: 'flex-start' }]}>
        <Text style={[styles.exTitle, { color: theme.text.primary, flex: 1 }]} numberOfLines={1}>
          {exercise.name.toUpperCase()} {exercise.is_weighted && <Text style={{ color: theme.accent, fontSize: 13 }}> (WEIGHTED)</Text>}
        </Text>

        {exercise.youtube_url ? (
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 12, padding: 1.2, marginLeft: 8 }}
          >
            <TouchableOpacity
              onPress={() => onToggleVideo(exercise.id, exercise.youtube_url)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isVideoActive ? 'rgba(255,82,82,0.12)' : solidCardBg,
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 11,
                gap: 4
              }}
            >
              <Text style={{ color: '#FF5252', fontSize: 9 }}>{isVideoActive ? '✕' : '▶'}</Text>
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.primary }}>
                {isVideoActive ? 'CLOSE' : 'WATCH'}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : null}
      </View>

      {/* Sets / Reps / Rest Badges Row */}
      <View style={styles.exDetailsRow}>
        {(blockMetadata?.timing_system === 'amrap' || blockMetadata?.timing_system === 'fortime' || blockMetadata?.type === 'amrap' || blockMetadata?.type === 'fortime') ? (
          <View style={[styles.detailBadge, { borderColor: theme.card.border, flex: 1, alignItems: 'flex-start' }]}>
            <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REPS PER ROUND</Text>
            <Text style={[styles.detailValue, { color: theme.text.primary, fontSize: 13, marginTop: 2 }]}>{exercise.reps}</Text>
          </View>
        ) : blockMetadata?.timing_system === 'tabata' ? (
          <View style={[styles.detailBadge, { borderColor: '#FF5252', flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,82,82,0.05)' }]}>
            <Text style={[styles.detailLabel, { color: '#FF5252' }]}>TABATA INTERVAL</Text>
            <Text style={[styles.detailValue, { color: '#FF5252', fontSize: 13, marginTop: 2 }]}>
              {blockMetadata.tabata_work_seconds || '20'}S WORK / {blockMetadata.tabata_rest_seconds || '10'}S REST
            </Text>
          </View>
        ) : (blockMetadata?.structure === 'superset' || blockMetadata?.structure === 'circuit' || blockMetadata?.type === 'superset' || blockMetadata?.type === 'circuit') ? (
          <>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REPS</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.reps}</Text>
            </View>
            {exercise.hold_seconds && parseInt(String(exercise.hold_seconds)) > 0 && (
              <View style={[styles.detailBadge, { borderColor: '#7E57C2', backgroundColor: 'rgba(126,87,194,0.08)' }]}>
                <Text style={[styles.detailLabel, { color: '#7E57C2' }]}>HOLD</Text>
                <Text style={[styles.detailValue, { color: '#7E57C2' }]}>{exercise.hold_seconds}S</Text>
              </View>
            )}
          </>
        ) : (!blockMetadata || (!blockMetadata.type && !blockMetadata.structure) || blockMetadata.type === 'single' || blockMetadata.structure === 'single') ? (
          <>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>SETS</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.sets}</Text>
            </View>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REPS</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.reps}</Text>
            </View>
            {exercise.hold_seconds && parseInt(String(exercise.hold_seconds)) > 0 && (
              <View style={[styles.detailBadge, { borderColor: '#7E57C2', backgroundColor: 'rgba(126,87,194,0.08)' }]}>
                <Text style={[styles.detailLabel, { color: '#7E57C2' }]}>HOLD</Text>
                <Text style={[styles.detailValue, { color: '#7E57C2' }]}>{exercise.hold_seconds}S</Text>
              </View>
            )}
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REST</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.rest_seconds}S</Text>
            </View>
            {!hideSetControls && restSecs > 0 && (
              <TouchableOpacity
                onPress={restActive ? cancelRest : startRest}
                style={[styles.detailBadge, {
                  borderColor: restActive ? '#FF7043' : restCompleted ? '#4CAF50' : '#7E57C2',
                  backgroundColor: restActive ? 'rgba(255,112,67,0.1)' : restCompleted ? 'rgba(76,175,80,0.1)' : 'rgba(126,87,194,0.1)',
                  minWidth: 56,
                }]}
              >
                <Text style={[styles.detailLabel, { color: restActive ? '#FF7043' : restCompleted ? '#4CAF50' : '#7E57C2' }]}>
                  {restActive ? 'RESTING' : restCompleted ? 'DONE ✓' : 'START REST'}
                </Text>
                <Text style={[styles.detailValue, { color: restActive ? '#FF7043' : restCompleted ? '#4CAF50' : '#7E57C2', fontSize: restActive ? 16 : 11 }]}>
                  {restActive ? formatRest(restTimeLeft) : restCompleted ? 'NEXT SET' : '▶'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : blockMetadata?.structure === 'ladder' ? (
          <View style={[styles.detailBadge, { borderColor: bronzeGold, flex: 1, alignItems: 'flex-start', backgroundColor: 'rgba(200,160,64,0.05)' }]}>
            <Text style={[styles.detailLabel, { color: bronzeGold }]}>LADDER SEQUENCE</Text>
            <Text style={[styles.detailValue, { color: theme.text.primary, fontSize: 13, marginTop: 2 }]}>
              {BlockConceptParser.getLadderSequence(blockMetadata || {})}
            </Text>
          </View>
        ) : (
          <View style={[styles.detailBadge, { borderColor: theme.card.border, flex: 1, alignItems: 'flex-start' }]}>
            <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>TARGET REPS / WORK DETAILS</Text>
            <Text style={[styles.detailValue, { color: theme.text.primary, fontSize: 13, marginTop: 2 }]}>{exercise.reps || 'AS ASSIGNED'}</Text>
          </View>
        )}
      </View>

      {exercise.notes ? (
        <Text style={[styles.exNotes, { color: theme.text.secondary }]}>
          NOTE: {exercise.notes}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  exerciseRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
  },
  exInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 0.6,
    flex: 1,
  },
  exDetailsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  detailBadge: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.008)',
  },
  detailLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 7,
    letterSpacing: 0.8,
    marginBottom: 2,
    opacity: 0.7,
  },
  detailValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  exNotes: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    marginTop: 8,
    opacity: 0.75,
  },
});
