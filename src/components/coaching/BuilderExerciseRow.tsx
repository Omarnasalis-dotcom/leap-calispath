import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { SelectedExercise } from '../../hooks/coaching/useProgramBuilder';
import { BlockConceptParser, ConceptMetadata } from '../../lib/BlockConceptParser';

interface BuilderExerciseRowProps {
  exercise: SelectedExercise;
  blockId: string;
  dayId: string;
  theme: any;
  mode: 'light' | 'dark';
  blockMetadata?: ConceptMetadata | null;
  handleUpdateExerciseValue: (dayId: string, blockId: string, exerciseId: string, field: string, value: any) => void;
  handleDeleteExerciseFromBlock: (dayId: string, blockId: string, exerciseId: string) => void;
}

export const BuilderExerciseRow: React.FC<BuilderExerciseRowProps> = ({
  exercise: ex,
  blockId,
  dayId,
  theme,
  mode,
  blockMetadata,
  handleUpdateExerciseValue,
  handleDeleteExerciseFromBlock
}) => {
  return (
    <View
      style={[styles.exerciseRow, { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: theme.card.border }]}
    >
      <View style={styles.exInfoCol}>
        <Text style={[styles.exTitle, { color: theme.text.primary }]}>
          {ex.name.toUpperCase()}
        </Text>
        {ex.youtube_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(ex.youtube_url)} style={{ padding: 4 }}>
            <Text style={{ fontSize: 18 }}>🎥</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Exercise Attributes Inputs Grid */}
      <View style={styles.exInputsGrid}>
        {blockMetadata?.timing_system === 'tabata' ? (
          <View style={{ flex: 1 }}>
            <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>TABATA INTERVAL</Text>
            <View style={[styles.exField, { borderColor: theme.card.border, backgroundColor: 'rgba(255,82,82,0.1)', justifyContent: 'center' }]}>
              <Text style={{ color: '#FF5252', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.5, textAlign: 'center' }}>
                {blockMetadata.tabata_work_seconds || '20'}S WORK / {blockMetadata.tabata_rest_seconds || '10'}S REST
              </Text>
            </View>
          </View>
        ) : (!blockMetadata || (!blockMetadata.type && !blockMetadata.structure) || blockMetadata.type === 'single' || blockMetadata.structure === 'single') ? (
          <>
            <View style={styles.exInputCol}>
              <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>SETS</Text>
              <TextInput
                style={[styles.exField, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={ex.sets}
                onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'sets', val)}
                keyboardType="numeric"
                placeholder="4"
                placeholderTextColor="rgba(255,255,255,0.1)"
              />
            </View>
            <View style={styles.exInputCol}>
              <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>REPS</Text>
              <TextInput
                style={[styles.exField, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={ex.reps}
                onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'reps', val)}
                placeholder="10"
                placeholderTextColor="rgba(255,255,255,0.1)"
              />
            </View>
            <View style={styles.exInputCol}>
              <Text style={[styles.exInputLabel, { color: '#7E57C2' }]}>HOLD (S)</Text>
              <TextInput
                style={[styles.exField, { color: '#7E57C2', borderColor: '#7E57C2' }]}
                value={ex.hold_seconds}
                onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'hold_seconds', val)}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor="rgba(126,87,194,0.3)"
              />
            </View>
            <View style={styles.exInputCol}>
              <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>REST</Text>
              <TextInput
                style={[styles.exField, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={ex.rest_seconds}
                onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'rest_seconds', val)}
                keyboardType="numeric"
                placeholder="90S"
                placeholderTextColor="rgba(255,255,255,0.1)"
              />
            </View>
          </>
        ) : (blockMetadata?.structure === 'superset' || blockMetadata?.structure === 'circuit' || blockMetadata?.type === 'superset' || blockMetadata?.type === 'circuit') ? (
          <>
            <View style={styles.exInputCol}>
              <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>REPS</Text>
              <TextInput
                style={[styles.exField, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={ex.reps}
                onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'reps', val)}
                placeholder="10"
                placeholderTextColor="rgba(255,255,255,0.1)"
              />
            </View>
            <View style={styles.exInputCol}>
              <Text style={[styles.exInputLabel, { color: '#7E57C2' }]}>HOLD (S)</Text>
              <TextInput
                style={[styles.exField, { color: '#7E57C2', borderColor: '#7E57C2' }]}
                value={ex.hold_seconds}
                onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'hold_seconds', val)}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor="rgba(126,87,194,0.3)"
              />
            </View>
            <View style={styles.exInputCol}>
              <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>WEIGHTED?</Text>
              <TouchableOpacity
                style={[styles.exField, { 
                  borderColor: ex.is_weighted ? theme.accent : theme.card.border, 
                  backgroundColor: ex.is_weighted ? 'rgba(200,160,64,0.1)' : 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center'
                }]}
                onPress={() => handleUpdateExerciseValue(dayId, blockId, ex.id, 'is_weighted', !ex.is_weighted)}
              >
                <Text style={{ color: ex.is_weighted ? theme.accent : theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13 }}>
                  {ex.is_weighted ? 'YES' : 'NO'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : blockMetadata?.structure === 'ladder' ? (
          <View style={{ flex: 1 }}>
            <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>TARGET REPS / WORK DETAILS</Text>
            <View style={[styles.exField, { borderColor: theme.card.border, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center' }]}>
              <Text style={{ color: '#C8A040', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.5 }}>
                LADDER CONTROLLED: [{BlockConceptParser.getLadderSequence(blockMetadata || {})}]
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={[styles.exInputLabel, { color: theme.text.secondary }]}>TARGET REPS / WORK DETAILS</Text>
            <TextInput
              style={[styles.exField, { color: theme.text.primary, borderColor: theme.card.border, width: '100%' }]}
              value={ex.reps}
              onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'reps', val)}
              placeholder="E.g. 10 reps, or 30s holds"
              placeholderTextColor="rgba(255,255,255,0.1)"
            />
          </View>
        )}
      </View>

      {/* Exercise Notes */}
      <View style={{ width: '100%', marginTop: 8 }}>
        <TextInput
          style={[styles.exNotesField, { color: theme.text.secondary, borderColor: theme.card.border }]}
          value={ex.notes}
          onChangeText={(val) => handleUpdateExerciseValue(dayId, blockId, ex.id, 'notes', val)}
          placeholder="Execution notes, tempo, weights, or details..."
          placeholderTextColor="rgba(255,255,255,0.15)"
        />
      </View>

      {/* Remove Exercise */}
      <TouchableOpacity
        style={styles.exDeleteBtn}
        onPress={() => handleDeleteExerciseFromBlock(dayId, blockId, ex.id)}
      >
        <Text style={styles.exDeleteBtnText}>REMOVE EXERCISE</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  exerciseRow: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
    marginBottom: 8,
  },
  exInfoCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exTitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 10,
  },
  ytLink: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },
  exInputsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  exInputCol: {
    flex: 1,
  },
  exInputLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  exField: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    textAlign: 'center',
  },
  exNotesField: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
  },
  exDeleteBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  exDeleteBtnText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
