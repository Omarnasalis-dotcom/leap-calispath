import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ProgramBlock, ExerciseDetail } from '../../screens/coaching/WarriorProgramScreen';
import { BlockConceptParser } from '../../lib/BlockConceptParser';
import { WarriorExerciseRow } from './WarriorExerciseRow';
import { SetRow, SetLogEntry } from './SetRow';
import { CircuitRoundCard } from './CircuitRoundCard';
import { LadderRungPicker } from './LadderRungPicker';
import { AmrapInlineTimer } from './AmrapInlineTimer';
import { ForTimeInlineTimer, ForTimeResult } from './ForTimeInlineTimer';
import { InlineVideoPlayer } from './InlineVideoPlayer';

interface WarriorBlockCardProps {
  block: ProgramBlock;
  isExpanded: boolean;
  theme: any;
  mode: 'light' | 'dark';
  solidCardBg: string;
  bronzeGold: string;
  strengthTier: number | string;
  toggleBlockExpanded: (blockId: string | number) => void;
  handleToggleBlockStatus: (blockId: string | number, targetStatus: 'none' | 'completed' | 'missed') => void;
  isTogglingStatus?: boolean;
  handleOpenLogging: (blockId: string | number, initialStatus?: 'completed' | 'missed') => void;
  startTimerForBlock: (block: ProgramBlock) => void;
  activeVideoExerciseId?: string | number | null;
  onToggleVideo: (exerciseId: string | number, url: string) => void;
  isLocked?: boolean;
  loggedSetsByExercise?: Record<string | number, SetLogEntry[]>;
  onSetLogged?: (blockId: string | number, exerciseId: string | number, entry: SetLogEntry) => void;
  onLadderFinalize?: (blockId: string | number, summary: string) => void;
  onAmrapFinalize?: (blockId: string | number, roundsCompleted: number) => void;
  onForTimeFinalize?: (blockId: string | number, result: ForTimeResult) => void;
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
  isTogglingStatus,
  handleOpenLogging,
  startTimerForBlock,
  activeVideoExerciseId,
  onToggleVideo,
  isLocked,
  loggedSetsByExercise,
  onSetLogged,
  onLadderFinalize,
  onAmrapFinalize,
  onForTimeFinalize,
}) => {
  const timingSystem = block.metadata?.timing_system;
  const structure = block.metadata?.structure || block.metadata?.type;
  const isAmrapLadder = timingSystem === 'amrap' && structure === 'ladder';
  const isForTimeLadder = timingSystem === 'fortime' && structure === 'ladder';
  const isPureStraightSet = (!timingSystem || timingSystem === 'straight_set') && (!structure || structure === 'single');
  const isCircuitOrSuperset = (!timingSystem || timingSystem === 'straight_set') && (structure === 'circuit' || structure === 'superset');
  const isLadder = ((!timingSystem || timingSystem === 'straight_set') && structure === 'ladder') || isAmrapLadder || isForTimeLadder;
  const isAmrap = (timingSystem === 'amrap' || block.metadata?.type === 'amrap') && !isLadder;
  const isForTime = (timingSystem === 'fortime' || block.metadata?.type === 'fortime') && !isLadder;
  const isActiveForSetLogging = isExpanded && !isLocked && isPureStraightSet && block.completedStatus === 'none';
  const isActiveForCircuitLogging = isExpanded && !isLocked && isCircuitOrSuperset && block.completedStatus === 'none';
  const isActiveForLadderLogging = isExpanded && !isLocked && isLadder && block.completedStatus === 'none';
  const isActiveForAmrapLogging = isExpanded && !isLocked && isAmrap && block.completedStatus === 'none';
  const isActiveForForTimeLogging = isExpanded && !isLocked && isForTime && block.completedStatus === 'none';
  const amrapTimeCapSeconds = (parseInt(String(block.metadata?.time_cap_min || block.metadata?.timer_seconds || '10'), 10) || 10) * 60;
  const forTimeCapSeconds = (parseInt(String(block.metadata?.time_cap_min || '15'), 10) || 15) * 60;
  const totalRounds = parseInt(String(block.metadata?.rounds || '1'), 10) || 1;
  const restAfterRound = parseInt(String(block.metadata?.rest_after_round || '60'), 10) || 60;
  const ladderRestSeconds = (isAmrapLadder || isForTimeLadder)
    ? (parseInt(String(block.metadata?.time_cap_min || '1'), 10) || 1) * 60
    : parseInt(String(block.exercises[0]?.rest_seconds || block.metadata?.rest_after_round || '0'), 10) || 0;
  const ladderTimerLabel = isAmrapLadder ? 'AMRAP' : isForTimeLadder ? 'FOR TIME' : 'REST';
  const ladderCountUp = isForTimeLadder;

  const isRoundLogged = (roundNum: number) =>
    block.exercises.length > 0 && block.exercises.every(ex =>
      (loggedSetsByExercise?.[ex.id] || []).some(s => s.setIndex === roundNum)
    );
  const router = useRouter();
  const isMissed = block.completedStatus === 'missed';
  const activeVideoExercise = block.exercises.find((ex: ExerciseDetail) => ex.id === activeVideoExerciseId) || null;

  return (
    <View style={{ gap: 12 }}>
    {activeVideoExercise && (
      <InlineVideoPlayer
        url={activeVideoExercise.youtube_url}
        theme={theme}
        onClose={() => onToggleVideo(activeVideoExercise.id, activeVideoExercise.youtube_url)}
      />
    )}
    <LinearGradient
      key={block.id}
      colors={['#7E57C2', '#FF5252', '#FF7043']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ padding: 1.2, borderRadius: 12, opacity: isLocked ? 0.5 : (isMissed ? 0.75 : 1) }}
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
                {isLocked && <Text style={{ fontSize: 13 }}>🔒</Text>}
              </View>
              {!isExpanded && (
                <Text style={{ color: theme.text.tertiary, fontSize: 11, marginTop: 4, fontFamily: 'BarlowCondensed-Bold' }} numberOfLines={1}>
                  {isLocked
                    ? 'COMPLETE THE PREVIOUS BLOCK TO UNLOCK'
                    : BlockConceptParser.getSubtitle(block.metadata || {}, block.exercises.map((ex: ExerciseDetail) => ex.name.toUpperCase()))}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* DONE — marking a block done opens the log modal so the warrior
                  fills in feel/RPE (and can't complete it with no detail at all);
                  tapping DONE again on an already-completed block is just an
                  instant undo back to unlogged, which stays a quick toggle.
                  Requires the block to be unlocked either way, since completing
                  it implies actually doing the work. */}
              <TouchableOpacity
                style={{
                  width: 40,
                  height: 32,
                  borderRadius: 6,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: (isTogglingStatus || isLocked) ? 0.4 : 1,
                  backgroundColor: block.completedStatus === 'completed' ? 'rgba(76,175,80,0.15)' : 'transparent',
                  borderColor: block.completedStatus === 'completed' ? '#4CAF50' : theme.card.border,
                }}
                disabled={isTogglingStatus || isLocked}
                onPress={(e) => {
                  e.stopPropagation();
                  if (block.completedStatus === 'completed') {
                    handleToggleBlockStatus(block.id, 'none');
                  } else {
                    handleOpenLogging(block.id, 'completed');
                  }
                }}
              >
                {block.completedStatus === 'completed' && (
                  <Text style={{ color: '#4CAF50', fontSize: 16, fontWeight: 'bold' }}>✓</Text>
                )}
              </TouchableOpacity>

              {/* SKIP — marking a block missed opens the log modal (as 'missed')
                  so the warrior can give a reason instead of it being logged
                  with none. Always tappable, even while locked, so a warrior
                  can skip past a block instead of being stuck on it — the
                  modal open itself bypasses the lock check the same way the
                  old quick-toggle always did. Tapping SKIP again on an
                  already-missed block is an instant undo, same as DONE. */}
              <TouchableOpacity
                style={{
                  width: 40,
                  height: 32,
                  borderRadius: 6,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isTogglingStatus ? 0.4 : 1,
                  backgroundColor: block.completedStatus === 'missed' ? 'rgba(255,107,107,0.15)' : 'transparent',
                  borderColor: block.completedStatus === 'missed' ? '#FF6B6B' : theme.card.border,
                }}
                disabled={isTogglingStatus}
                onPress={(e) => {
                  e.stopPropagation();
                  if (block.completedStatus === 'missed') {
                    handleToggleBlockStatus(block.id, 'none');
                  } else {
                    handleOpenLogging(block.id, 'missed');
                  }
                }}
              >
                <Text style={{ color: block.completedStatus === 'missed' ? '#FF6B6B' : theme.text.tertiary, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 0.5 }}>SKIP</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* Block Content (Expandable) */}
          {isExpanded && (
            <View style={{ paddingTop: 16 }}>
              {/* Structure Badge */}
              <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 12 }}>
                <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 12, letterSpacing: 1 }}>
                  {BlockConceptParser.getStructureBadge(block.metadata || {})}
                </Text>
              </View>


              {/* Block Description Notes */}
              {block.notes ? (
                <Text style={[styles.blockNotes, { color: theme.text.secondary, marginTop: 0 }]}>
                  {block.notes}
                </Text>
              ) : null}

              {/* Exercises Details */}
              <View style={{ gap: 12, marginTop: 12 }}>
                {!isActiveForCircuitLogging && !isActiveForLadderLogging && !isActiveForAmrapLogging && !isActiveForForTimeLogging && block.exercises.map((ex: ExerciseDetail) => {
                  const loggedSets = loggedSetsByExercise?.[ex.id] || [];
                  const targetSets = parseInt(String(ex.sets || '0'), 10) || 0;
                  return (
                    <View key={ex.id} style={{ gap: 8 }}>
                      <WarriorExerciseRow
                        exercise={ex}
                        blockMetadata={block.metadata}
                        theme={theme}
                        solidCardBg={solidCardBg}
                        bronzeGold={bronzeGold}
                        onToggleVideo={onToggleVideo}
                        isVideoActive={activeVideoExerciseId === ex.id}
                        hideSetControls={(isActiveForSetLogging && targetSets > 0) || isActiveForCircuitLogging}
                      />
                      {isActiveForSetLogging && targetSets > 0 && (
                        <View style={{ gap: 6 }}>
                          {Array.from({ length: targetSets }).map((_, i) => {
                            const setIndex = i + 1;
                            const isSetLogged = loggedSets.some(s => s.setIndex === setIndex);
                            return (
                              <SetRow
                                key={setIndex}
                                setIndex={setIndex}
                                targetReps={parseInt(String(ex.reps || '0'), 10) || 0}
                                isWeighted={!!ex.is_weighted}
                                restSeconds={parseInt(String(ex.rest_seconds || '0'), 10) || 0}
                                theme={theme}
                                bronzeGold={bronzeGold}
                                completed={isSetLogged}
                                onSetComplete={(entry) => onSetLogged?.(block.id, ex.id, entry)}
                              />
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}

                {isActiveForCircuitLogging && (
                  <View style={{ gap: 12, marginTop: 4 }}>
                    {Array.from({ length: totalRounds }).map((_, i) => {
                      const roundNum = i + 1;
                      const roundCompleted = isRoundLogged(roundNum);
                      const roundLocked = roundNum > 1 && !isRoundLogged(roundNum - 1);
                      return (
                        <CircuitRoundCard
                          key={roundNum}
                          roundNumber={roundNum}
                          totalRounds={totalRounds}
                          exercises={block.exercises.map(ex => ({
                            id: ex.id,
                            name: ex.name,
                            targetReps: parseInt(String(ex.reps || '0'), 10) || 0,
                            youtube_url: ex.youtube_url,
                          }))}
                          restSeconds={restAfterRound}
                          theme={theme}
                          bronzeGold={bronzeGold}
                          isLocked={roundLocked}
                          completed={roundCompleted}
                          onRoundComplete={(entries) => {
                            entries.forEach(e => onSetLogged?.(block.id, e.exerciseId, { setIndex: roundNum, reps: e.reps }));
                          }}
                          activeVideoExerciseId={activeVideoExerciseId}
                          onToggleVideo={onToggleVideo}
                        />
                      );
                    })}
                  </View>
                )}

                {isActiveForLadderLogging && (
                  <View style={{ marginTop: 4 }}>
                    <LadderRungPicker
                      theme={theme}
                      bronzeGold={bronzeGold}
                      sequence={BlockConceptParser.getLadderRungs(block.metadata || {})}
                      onChange={() => {}}
                      restSeconds={ladderRestSeconds}
                      timerLabel={ladderTimerLabel}
                      countUp={ladderCountUp}
                      onFinalize={(summary) => onLadderFinalize?.(block.id, summary)}
                      exerciseName={block.exercises[0]?.name}
                      youtubeUrl={block.exercises[0]?.youtube_url}
                      isVideoActive={!!block.exercises[0] && activeVideoExerciseId === block.exercises[0].id}
                      onToggleVideo={(url) => block.exercises[0] && onToggleVideo(block.exercises[0].id, url)}
                    />
                  </View>
                )}

                {isActiveForAmrapLogging && (
                  <View style={{ marginTop: 4 }}>
                    <AmrapInlineTimer
                      theme={theme}
                      bronzeGold={bronzeGold}
                      exercises={block.exercises.map(ex => ({ id: ex.id, name: ex.name, reps: ex.reps, youtube_url: ex.youtube_url }))}
                      timeCapSeconds={amrapTimeCapSeconds}
                      onFinalize={(roundsCompleted) => onAmrapFinalize?.(block.id, roundsCompleted)}
                      activeVideoExerciseId={activeVideoExerciseId}
                      onToggleVideo={onToggleVideo}
                    />
                  </View>
                )}

                {isActiveForForTimeLogging && (
                  <View style={{ marginTop: 4 }}>
                    <ForTimeInlineTimer
                      theme={theme}
                      exercises={block.exercises.map(ex => ({ id: ex.id, name: ex.name, reps: ex.reps, youtube_url: ex.youtube_url }))}
                      timeCapSeconds={forTimeCapSeconds}
                      totalRounds={totalRounds}
                      onFinalize={(result) => onForTimeFinalize?.(block.id, result)}
                      activeVideoExerciseId={activeVideoExerciseId}
                      onToggleVideo={onToggleVideo}
                    />
                  </View>
                )}
              </View>

              {/* Block Action Buttons Row */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                {(block.metadata?.timing_system === 'tabata') && (
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
                        backgroundColor: solidCardBg,
                        opacity: isLocked ? 0.5 : 1
                      }}
                      disabled={isLocked}
                      onPress={() => {
                        if (isLocked) return;
                        startTimerForBlock(block);
                      }}
                    >
                      <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5 }}>
                        START TIMER (TABATA)
                      </Text>
                    </TouchableOpacity>
                  </LinearGradient>
                )}
                
                {/* Advanced Logging Trigger — hidden while the inline ladder logger's own
                    "LOG BLOCK" button or the inline AMRAP/FOR TIME timer's "LOG WORKOUT" button
                    is the active way to finalize this block, to avoid two competing log entry points. */}
                {!isActiveForLadderLogging && !isActiveForAmrapLogging && !isActiveForForTimeLogging && (
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={{
                        paddingVertical: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: block.completedStatus !== 'none' ? '#4CAF50' : 'rgba(76, 175, 80, 0.4)',
                        borderRadius: 6,
                        backgroundColor: block.completedStatus !== 'none' ? 'rgba(76, 175, 80, 0.05)' : 'rgba(255,255,255,0.02)',
                        opacity: isLocked ? 0.5 : 1
                      }}
                      disabled={isLocked}
                      onPress={() => {
                        if (isLocked) return;
                        handleOpenLogging(block.id);
                      }}
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
                )}
              </View>
            </View>
          )}
        </View>
      )}
    </LinearGradient>
    </View>
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
