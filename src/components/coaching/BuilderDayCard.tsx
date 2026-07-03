import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgramDay, ProgramBlock } from '../../hooks/coaching/useProgramBuilder';
import { BuilderBlockCard } from './BuilderBlockCard';

interface BuilderDayCardProps {
  day: ProgramDay;
  dayIdx: number;
  daysLength: number;
  theme: any;
  mode: 'light' | 'dark';
  bronzeGold: string;
  solidCardBg: string;
  inactiveBorder: string;
  useWeeklyStructure: boolean;
  expandedDays: Record<string, boolean>;
  toggleDay: (dayId: string) => void;
  
  // Day Handlers
  handleUpdateDayName: (dayId: string, value: string) => void;
  handleUpdateDayFocusTag: (dayId: string, tag: "PULL" | "PUSH" | "LEGS" | "FULL_BODY" | "CORE" | "NONE") => void;
  handleDeleteDay: (dayId: string) => void;
  handleMoveDay: (dayIdx: number, direction: 'up' | 'down') => void;
  handleAddBlockToDay: (dayId: string) => void;

  // Block Handlers (Prop drilled)
  expandedBlocks: Record<string, boolean>;
  athleteLogs: Record<string, string>;
  toggleBlock: (blockId: string) => void;
  handleUpdateBlockValue: (dayId: string, blockId: string, field: string, value: any) => void;
  handleUpdateExerciseValue: (dayId: string, blockId: string, exerciseId: string, field: string, value: any) => void;
  handleDeleteExerciseFromBlock: (dayId: string, blockId: string, exerciseId: string) => void;
  handleOpenPicker: (dayId: string, blockId: string) => void;
  handleMoveBlockWithinDay: (dayId: string, blockIdx: number, direction: 'up' | 'down') => void;
  handleOpenCopyModal: (block: ProgramBlock) => void;
  handleOpenCopyDayModal: (dayId: string) => void;
  handleDeleteBlockFromDay: (dayId: string, blockId: string) => void;
}

export const BuilderDayCard: React.FC<BuilderDayCardProps> = ({
  day,
  dayIdx,
  daysLength,
  theme,
  mode,
  bronzeGold,
  solidCardBg,
  inactiveBorder,
  useWeeklyStructure,
  expandedDays,
  toggleDay,
  handleUpdateDayName,
  handleUpdateDayFocusTag,
  handleDeleteDay,
  handleMoveDay,
  handleAddBlockToDay,
  expandedBlocks,
  athleteLogs,
  toggleBlock,
  handleUpdateBlockValue,
  handleUpdateExerciseValue,
  handleDeleteExerciseFromBlock,
  handleOpenPicker,
  handleMoveBlockWithinDay,
  handleOpenCopyModal,
  handleOpenCopyDayModal,
  handleDeleteBlockFromDay,
}) => {
  const [localDayName, setLocalDayName] = useState(day.name);

  useEffect(() => {
    setLocalDayName(day.name);
  }, [day.name]);

  const handleBlur = () => {
    if (localDayName !== day.name) {
      handleUpdateDayName(day.id, localDayName);
    }
  };

  return (
    <LinearGradient
      colors={['#7E57C2', '#FF5252', '#FF7043']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ padding: 1.2, borderRadius: 12, marginBottom: 16 }}
    >
      <View
        style={{
          backgroundColor: solidCardBg,
          borderRadius: 11,
          padding: 16,
          gap: 16
        }}
      >
        {/* Day Header Row */}
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: expandedDays[day.id] ? 1 : 0, borderBottomColor: 'rgba(200,160,64,0.1)', paddingBottom: expandedDays[day.id] ? 12 : 0 }}
        >
          <TouchableOpacity
            onPress={() => toggleDay(day.id)}
            style={{ flex: 1, marginRight: 12, flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={{ color: bronzeGold, fontSize: 18, marginRight: 8, fontFamily: 'BarlowCondensed-ExtraBold' }}>
              {expandedDays[day.id] ? '▼' : '▶'}
            </Text>
            <View style={{ flex: 1 }}>
              <TextInput
                style={{
                  fontFamily: 'BarlowCondensed-ExtraBold',
                  fontSize: 20,
                  letterSpacing: 1.5,
                  color: theme.text.primary,
                  paddingVertical: 4,
                }}
                value={(localDayName || '').toUpperCase()}
                onChangeText={setLocalDayName}
                onBlur={handleBlur}
                onEndEditing={handleBlur}
                placeholder="DAY NAME (E.G. SATURDAY)"
                placeholderTextColor="rgba(255, 255, 255, 0.25)"
                editable={!useWeeklyStructure}
              />
              {!expandedDays[day.id] && (
                <Text style={{ color: theme.text.secondary, fontSize: 11, fontFamily: 'BarlowCondensed-Medium', marginTop: -4 }} numberOfLines={1}>
                  {day.blocks.length > 0 ? day.blocks.map(b => b.name || 'UNNAMED BLOCK').join(' • ') : 'EMPTY DAY'}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Day Reorder Controls — always visible, no need to expand */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.reorderBtn, dayIdx === 0 && { opacity: 0.3 }]}
              onPress={() => handleMoveDay(dayIdx, 'up')}
              disabled={dayIdx === 0}
            >
              <Text style={{ color: theme.text.primary, fontSize: 16 }}>▲</Text>
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.reorderBtn, dayIdx === daysLength - 1 && { opacity: 0.3 }]}
              onPress={() => handleMoveDay(dayIdx, 'down')}
              disabled={dayIdx === daysLength - 1}
            >
              <Text style={{ color: theme.text.primary, fontSize: 16 }}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Focus Tag Selector */}
        {expandedDays[day.id] && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.text.tertiary, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 1, marginBottom: 8 }}>DAY FOCUS TAG (ASSESSMENT ENGINE)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {['NONE', 'PULL', 'PUSH', 'LEGS', 'FULL_BODY', 'CORE'].map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => handleUpdateDayFocusTag(day.id, tag as any)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: day.focusTag === tag ? bronzeGold : inactiveBorder,
                    backgroundColor: day.focusTag === tag ? 'rgba(200,160,64,0.1)' : 'transparent',
                  }}
                >
                  <Text style={{
                    color: day.focusTag === tag ? bronzeGold : theme.text.secondary,
                    fontSize: 11,
                    fontFamily: 'BarlowCondensed-Bold',
                    letterSpacing: 1,
                  }}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Day Blocks List */}
        {expandedDays[day.id] && (
          <>
            <View style={{ gap: 16 }}>
              {day.blocks.length === 0 ? (
                <View style={{ padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: theme.text.tertiary, fontSize: 12 }}>NO BLOCKS ADDED. CLICK '+ ADD BLOCK' TO DEFINE WORKOUT WORKSPACES.</Text>
                </View>
              ) : (
                day.blocks.map((block, blockIdx) => (
                  <BuilderBlockCard
                    key={block.id}
                    block={block}
                    blockIdx={blockIdx}
                    dayId={day.id}
                    isLastBlock={blockIdx === day.blocks.length - 1}
                    theme={theme}
                    mode={mode as "light" | "dark"}
                    bronzeGold={bronzeGold}
                    solidCardBg={solidCardBg}
                    expandedBlocks={expandedBlocks}
                    athleteLogs={athleteLogs}
                    toggleBlock={toggleBlock}
                    handleUpdateBlockValue={handleUpdateBlockValue}
                    handleUpdateExerciseValue={handleUpdateExerciseValue}
                    handleDeleteExerciseFromBlock={handleDeleteExerciseFromBlock}
                    handleOpenPicker={handleOpenPicker}
                    handleMoveBlockWithinDay={handleMoveBlockWithinDay}
                    handleOpenCopyModal={handleOpenCopyModal}
                    handleDeleteBlockFromDay={handleDeleteBlockFromDay}
                  />
                ))
              )}
            </View>
            
            {/* Day Action Buttons (reorder controls now live in the always-visible header) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 16 }}>
                {!useWeeklyStructure && (
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
                    onPress={() => handleDeleteDay(day.id)}
                  >
                    <Text style={{ color: '#FF5252', fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 }}>DELETE DAY</Text>
                  </TouchableOpacity>
                </LinearGradient>
              )}
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
                  onPress={() => handleAddBlockToDay(day.id)}
                >
                  <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 }}>+ ADD BLOCK</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  reorderBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
