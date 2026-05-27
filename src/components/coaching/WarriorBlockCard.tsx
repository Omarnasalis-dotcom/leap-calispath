import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ProgramBlock, ExerciseDetail } from '../../screens/coaching/WarriorProgramScreen';
import { BlockConceptParser } from '../../lib/BlockConceptParser';
import { WarriorExerciseRow } from './WarriorExerciseRow';

interface WarriorBlockCardProps {
  block: ProgramBlock;
  isExpanded: boolean;
  theme: any;
  mode: 'light' | 'dark';
  solidCardBg: string;
  bronzeGold: string;
  strengthTier: number | string;
  toggleBlockExpanded: (blockId: string | number) => void;
  handleToggleBlockStatus: (blockId: string | number, currentStatus: 'none' | 'completed' | 'missed') => void;
  handleOpenLogging: (blockId: string | number) => void;
  startTimerForBlock: (block: ProgramBlock) => void;
  handleOpenVideo: (url: string) => void;
}

export const WarriorBlockCard: React.FC<WarriorBlockCardProps> = ({
  block,
  isExpanded,
  theme,
  mode,
  solidCardBg,
  bronzeGold,
  strengthTier,
  toggleBlockExpanded,
  handleToggleBlockStatus,
  handleOpenLogging,
  startTimerForBlock,
  handleOpenVideo,
}) => {
  const router = useRouter();
  const isMissed = block.completedStatus === 'missed';

  return (
    <LinearGradient
      key={block.id}
      colors={['#7E57C2', '#FF5252', '#FF7043']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ padding: 1.2, borderRadius: 12, opacity: isMissed ? 0.75 : 1 }}
    >
      {block.metadata?.is_tier_trial ? (
        <TouchableOpacity
          style={{
            padding: 24,
            backgroundColor: solidCardBg,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onPress={() => {
            router.push({
              pathname: '/trial',
              params: { mode: 'practice', tier: strengthTier }
            });
          }}
        >
          <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 24, color: theme.text.primary, letterSpacing: 2 }}>
            PRACTICE TIER {strengthTier}
          </Text>
          <Text style={{ color: theme.text.secondary, fontSize: 12, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 1, marginTop: 4 }}>
            START OFFICIAL TIER ASSESSMENT
          </Text>
        </TouchableOpacity>
      ) : (
        <View
          style={[
            styles.blockCard,
            {
              backgroundColor: solidCardBg,
              borderWidth: 0,
              borderRadius: 11,
              marginBottom: 0
            }
          ]}
        >
          {/* Collapsible Block Header */}
          <TouchableOpacity
            style={[styles.blockHeader, { borderBottomColor: 'rgba(255,255,255,0.05)', paddingVertical: 6, borderBottomWidth: isExpanded ? 1 : 0 }]}
            onPress={() => toggleBlockExpanded(block.id)}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 12, color: theme.text.secondary }}>{isExpanded ? '▼' : '▶'}</Text>
                <Text style={[styles.blockName, { color: theme.text.primary, fontSize: 16 }]}>
                  {block.name.toUpperCase()}
                </Text>
              </View>
              {!isExpanded && (
                <Text style={{ color: theme.text.tertiary, fontSize: 11, marginTop: 4, fontFamily: 'BarlowCondensed-Bold' }} numberOfLines={1}>
                  {BlockConceptParser.getSubtitle(block.metadata || {}, block.exercises.map((ex: ExerciseDetail) => ex.name.toUpperCase()))}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 }}
              onPress={(e) => {
                e.stopPropagation();
                handleToggleBlockStatus(block.id, block.completedStatus || 'none');
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: block.completedStatus === 'completed'
                    ? 'rgba(76, 175, 80, 0.1)'
                    : (block.completedStatus === 'missed' ? 'rgba(255, 107, 107, 0.1)' : 'transparent'),
                  borderColor: block.completedStatus === 'completed'
                    ? '#4CAF50'
                    : (block.completedStatus === 'missed' ? '#FF6B6B' : theme.card.border)
                }}
              >
                {block.completedStatus === 'completed' && <Text style={{ color: '#4CAF50', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                {block.completedStatus === 'missed' && <Text style={{ color: '#FF6B6B', fontSize: 11, fontWeight: 'bold' }}>✗</Text>}
              </View>
              <Text
                style={{
                  fontFamily: 'BarlowCondensed-Bold',
                  fontSize: 11,
                  letterSpacing: 0.5,
                  color: block.completedStatus === 'completed'
                    ? '#4CAF50'
                    : (block.completedStatus === 'missed' ? '#FF6B6B' : theme.text.tertiary)
                }}
              >
                {block.completedStatus === 'completed' ? 'COMPLETED' : (block.completedStatus === 'missed' ? 'MISSED' : 'NOT LOGGED')}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Block Content (Expandable) */}
          {isExpanded && (
            <View style={{ paddingTop: 16 }}>


              {/* Block Description Notes */}
              {block.notes ? (
                <Text style={[styles.blockNotes, { color: theme.text.secondary, marginTop: 0 }]}>
                  {block.notes}
                </Text>
              ) : null}

              {/* Exercises Details */}
              <View style={{ gap: 12, marginTop: 12 }}>
                {block.exercises.map((ex: ExerciseDetail) => (
                  <WarriorExerciseRow
                    key={ex.id}
                    exercise={ex}
                    blockMetadata={block.metadata}
                    theme={theme}
                    solidCardBg={solidCardBg}
                    bronzeGold={bronzeGold}
                    handleOpenVideo={handleOpenVideo}
                  />
                ))}
              </View>

              {/* Block Action Buttons Row */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                {((block.metadata?.timing_system === 'amrap' || block.metadata?.timing_system === 'fortime' || block.metadata?.type === 'amrap' || block.metadata?.type === 'fortime') || 
                  (block.metadata?.structure === 'superset' || block.metadata?.structure === 'circuit' || block.metadata?.structure === 'ladder' || block.metadata?.structure === 'single' || block.metadata?.type === 'superset' || block.metadata?.type === 'circuit' || block.metadata?.type === 'single' || !block.metadata?.structure)) && (
                  <LinearGradient
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1, padding: 1.2, borderRadius: 6 }}
                  >
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        borderRadius: 5,
                        paddingVertical: 12,
                        alignItems: 'center',
                        backgroundColor: solidCardBg
                      }}
                      onPress={() => startTimerForBlock(block)}
                    >
                      <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5 }}>
                        START TIMER ({(block.metadata?.timing_system === 'amrap' || block.metadata?.type === 'amrap') ? `${block.metadata?.time_cap_min || block.metadata?.timer_seconds} MIN` : (block.metadata?.timing_system === 'fortime' || block.metadata?.type === 'fortime') ? 'FOR TIME' : 'REST'})
                      </Text>
                    </TouchableOpacity>
                  </LinearGradient>
                )}
                
                {/* Advanced Logging Trigger */}
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    style={{
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: block.completedStatus !== 'none' ? '#4CAF50' : 'rgba(76, 175, 80, 0.4)',
                      borderRadius: 6,
                      backgroundColor: block.completedStatus !== 'none' ? 'rgba(76, 175, 80, 0.05)' : 'rgba(255,255,255,0.02)'
                    }}
                    onPress={() => handleOpenLogging(block.id)}
                  >
                    <Text style={{ 
                      fontFamily: 'BarlowCondensed-Bold', 
                      fontSize: 11, 
                      letterSpacing: 0.5, 
                      color: block.completedStatus !== 'none' ? '#4CAF50' : theme.text.secondary 
                    }}>
                      {block.completedStatus !== 'none' ? 'EDIT LOG' : 'LOG SESSION'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  blockCard: {
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.012)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  blockName: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 0.8,
  },
  blockNotes: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    marginTop: 8,
    opacity: 0.8,
  },
  logBlockBtn: {
    borderWidth: 1.2,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(200, 160, 64, 0.05)',
  },
  logBlockBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
