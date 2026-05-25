import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlockConceptParser } from '../../lib/BlockConceptParser';

export interface ExerciseDetail {
  id: string | number;
  name: string;
  youtube_url: string;
  sets: string | number;
  reps: string;
  rest_seconds: string | number;
  notes: string;
}

interface WarriorExerciseRowProps {
  exercise: ExerciseDetail;
  theme: any;
  solidCardBg: string;
  bronzeGold: string;
  blockMetadata?: any;
  handleOpenVideo: (url: string) => void;
}

export const WarriorExerciseRow: React.FC<WarriorExerciseRowProps> = ({
  exercise,
  theme,
  solidCardBg,
  bronzeGold,
  blockMetadata,
  handleOpenVideo,
}) => {
  return (
    <View style={[styles.exerciseRow, { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: theme.card.border }]}>
      <View style={styles.exInfoRow}>
        <Text style={[styles.exTitle, { color: theme.text.primary }]}>
          {exercise.name.toUpperCase()}
        </Text>

        {exercise.youtube_url ? (
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 12, padding: 1.2 }}
          >
            <TouchableOpacity
              onPress={() => handleOpenVideo(exercise.youtube_url)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: solidCardBg,
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 11,
                gap: 4
              }}
            >
              <Text style={{ color: '#FF5252', fontSize: 9 }}>▶</Text>
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.primary }}>DEMO</Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : null}
      </View>

      {/* Sets / Reps / Rest Badges Row */}
      <View style={styles.exDetailsRow}>
        {(!blockMetadata || (!blockMetadata.type && !blockMetadata.structure) || blockMetadata.type === 'single' || blockMetadata.structure === 'single') ? (
          <>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>SETS</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.sets}</Text>
            </View>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REPS / TIME</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.reps}</Text>
            </View>
            <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
              <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REST</Text>
              <Text style={[styles.detailValue, { color: theme.text.primary }]}>{exercise.rest_seconds}S</Text>
            </View>
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
    fontSize: 15,
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
    fontSize: 8,
    letterSpacing: 0.8,
    marginBottom: 2,
    opacity: 0.7,
  },
  detailValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  exNotes: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    marginTop: 8,
    opacity: 0.75,
  },
});
