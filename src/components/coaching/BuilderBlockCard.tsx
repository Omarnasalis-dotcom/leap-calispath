import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgramBlock, SelectedExercise } from '../../hooks/coaching/useProgramBuilder';
import { BuilderExerciseRow } from './BuilderExerciseRow';
import { BlockConfigWizard } from './BlockConfigWizard';

interface BuilderBlockCardProps {
  block: ProgramBlock;
  blockIdx: number;
  dayId: string;
  isLastBlock: boolean;
  theme: any;
  mode: 'light' | 'dark';
  bronzeGold: string;
  solidCardBg: string;
  expandedBlocks: Record<string, boolean>;
  athleteLogs: Record<string, string>;
  toggleBlock: (blockId: string) => void;
  handleUpdateBlockValue: (dayId: string, blockId: string, field: string, value: any) => void;
  handleUpdateExerciseValue: (dayId: string, blockId: string, exerciseId: string, field: string, value: any) => void;
  handleDeleteExerciseFromBlock: (dayId: string, blockId: string, exerciseId: string) => void;
  handleOpenPicker: (dayId: string, blockId: string) => void;
  handleMoveBlockWithinDay: (dayId: string, index: number, direction: 'up' | 'down') => void;
  handleOpenCopyModal: (block: ProgramBlock) => void;
  handleDeleteBlockFromDay: (dayId: string, blockId: string) => void;
}

export const BuilderBlockCard: React.FC<BuilderBlockCardProps> = ({
  block,
  blockIdx,
  dayId,
  isLastBlock,
  theme,
  mode,
  bronzeGold,
  solidCardBg,
  expandedBlocks,
  athleteLogs,
  toggleBlock,
  handleUpdateBlockValue,
  handleUpdateExerciseValue,
  handleDeleteExerciseFromBlock,
  handleOpenPicker,
  handleMoveBlockWithinDay,
  handleOpenCopyModal,
  handleDeleteBlockFromDay,
}) => {
  return (
    <LinearGradient
      colors={['#7E57C2', '#FF5252', '#FF7043']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ padding: 1.2, borderRadius: 12, marginBottom: 16 }}
    >
      <View
        style={[styles.blockCard, { backgroundColor: solidCardBg, borderColor: 'transparent', borderRadius: 11, marginBottom: 0 }]}
      >
        {/* Block Header and Controls */}
        <TouchableOpacity 
          onPress={() => toggleBlock(block.id)}
          style={[styles.blockHeader, { borderBottomWidth: expandedBlocks[block.id] ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.05)' }]}
        >
          <View style={{ flex: 1, marginRight: 12, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: theme.text.secondary, fontSize: 14, marginRight: 8 }}>
              {expandedBlocks[block.id] ? '▼' : '▶'}
            </Text>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.blockTitleInput, { color: theme.text.primary }]}
                value={block.name}
                onChangeText={(val) => handleUpdateBlockValue(dayId, block.id, 'name', val)}
                placeholder="BLOCK NAME (E.G. WARM-UP)"
                placeholderTextColor="rgba(255, 255, 255, 0.25)"
              />
              {!expandedBlocks[block.id] && (
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'BarlowCondensed-Medium', marginTop: -2 }} numberOfLines={1}>
                  {block.exercises.length > 0 ? block.exercises.map((e: SelectedExercise) => e.name || 'UNNAMED EXERCISE').join(' • ') : 'NO EXERCISES'}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* WORKOUT CONCEPT SELECTOR & CONFIGURATION WIZARD */}
        {expandedBlocks[block.id] && (
          <View>
            <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' }}>
              <BlockConfigWizard
                initialMetadata={block.metadata || { type: 'single', rounds: '4', rest_after_round: '90', timer_seconds: '10' }}
                onChange={(meta) => handleUpdateBlockValue(dayId, block.id, 'metadata', meta)}
              />
            </View>

            {/* CONCEPT CONDITIONAL EXERCISE COUNT WARNINGS */}
            {block.metadata?.type === 'superset' && block.exercises.length !== 2 && (
              <View style={{ marginVertical: 8, padding: 8, borderRadius: 6, backgroundColor: 'rgba(200,160,64,0.1)', borderWidth: 1, borderColor: bronzeGold }}>
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 11, color: bronzeGold, textAlign: 'center' }}>
                  WARNING: SUPER SETS TYPICALLY REQUIRE EXACTLY 2 EXERCISES. CURRENT COUNT: {block.exercises.length}
                </Text>
              </View>
            )}
            {block.metadata?.type === 'circuit' && block.exercises.length < 3 && (
              <View style={{ marginVertical: 8, padding: 8, borderRadius: 6, backgroundColor: 'rgba(200,160,64,0.1)', borderWidth: 1, borderColor: bronzeGold }}>
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 11, color: bronzeGold, textAlign: 'center' }}>
                  WARNING: CIRCUITS TYPICALLY REQUIRE 3 OR MORE EXERCISES. CURRENT COUNT: {block.exercises.length}
                </Text>
              </View>
            )}

            {/* Block Notes */}
            <View style={{ paddingVertical: 12 }}>
              <TextInput
                style={[styles.blockNotesInput, { color: theme.text.secondary, borderColor: theme.card.border }]}
                value={block.notes}
                onChangeText={(val) => handleUpdateBlockValue(dayId, block.id, 'notes', val)}
                placeholder="Warm up instructions, block objectives, or performance notes..."
                placeholderTextColor="rgba(255, 255, 255, 0.2)"
                multiline={true}
                numberOfLines={2}
              />
            </View>

            {/* ATHLETE LOGS INJECTION */}
            {(athleteLogs[block.id] || (block.previous_log_from_block_id && athleteLogs[String(block.previous_log_from_block_id)])) && (
              <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)' }}>
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 10, color: bronzeGold, marginBottom: 4 }}>
                  {athleteLogs[block.id] ? "ATHLETE LOGS (LAST SESSION)" : "LAST WEEK'S LOG"}
                </Text>
                <View style={{ backgroundColor: 'rgba(200,160,64,0.05)', borderRadius: 6, padding: 12, borderWidth: 1, borderColor: 'rgba(200,160,64,0.2)' }}>
                  <Text style={{ fontFamily: 'System', fontSize: 13, color: theme.text.primary, fontStyle: 'italic' }}>
                    {athleteLogs[block.id] || athleteLogs[String(block.previous_log_from_block_id)]}
                  </Text>
                </View>
              </View>
            )}

            {/* Exercises added to this block */}
            <View style={{ gap: 12, marginTop: 8 }}>
              {block.exercises.map((ex: SelectedExercise) => (
                <BuilderExerciseRow
                  key={ex.id}
                  exercise={ex}
                  blockId={block.id}
                  dayId={dayId}
                  theme={theme}
                  mode={mode}
                  blockMetadata={block.metadata}
                  handleUpdateExerciseValue={handleUpdateExerciseValue}
                  handleDeleteExerciseFromBlock={handleDeleteExerciseFromBlock}
                />
              ))}

              <TouchableOpacity
                style={[styles.addExerciseTrigger, { borderColor: bronzeGold }]}
                onPress={() => handleOpenPicker(dayId, block.id)}
              >
                <Text style={[styles.addExerciseTriggerText, { color: bronzeGold }]}>+ ADD EXERCISE TO BLOCK</Text>
              </TouchableOpacity>

              {/* Block Action Buttons (Moved from Header) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.reorderBtn, blockIdx === 0 && { opacity: 0.3 }]}
                  onPress={() => handleMoveBlockWithinDay(dayId, blockIdx, 'up')}
                  disabled={blockIdx === 0}
                >
                  <Text style={{ color: theme.text.primary, fontSize: 16 }}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reorderBtn, isLastBlock && { opacity: 0.3 }]}
                  onPress={() => handleMoveBlockWithinDay(dayId, blockIdx, 'down')}
                  disabled={isLastBlock}
                >
                  <Text style={{ color: theme.text.primary, fontSize: 16 }}>▼</Text>
                </TouchableOpacity>
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ padding: 1.2, borderRadius: 12 }}
                >
                  <TouchableOpacity
                    style={{
                      backgroundColor: solidCardBg,
                      borderRadius: 11,
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                    onPress={() => handleOpenCopyModal(block)}
                  >
                    <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 }}>COPY</Text>
                  </TouchableOpacity>
                </LinearGradient>
                <LinearGradient
                  colors={['#FF5252', '#FF7043', '#FF8A80']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ padding: 1.2, borderRadius: 12 }}
                >
                  <TouchableOpacity
                    style={{
                      backgroundColor: solidCardBg,
                      borderRadius: 11,
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                    onPress={() => handleDeleteBlockFromDay(dayId, block.id)}
                  >
                    <Text style={{ color: '#FF5252', fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 }}>DELETE</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          </View>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  blockCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  blockTitleInput: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    letterSpacing: 1,
    padding: 0,
  },
  reorderBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockNotesInput: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  addExerciseTrigger: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addExerciseTriggerText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
});
