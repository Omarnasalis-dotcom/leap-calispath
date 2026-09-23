import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated, Easing, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ProgramBlock, ExerciseDetail } from '../../types/warriorProgram';
import { BlockConceptParser } from '../../lib/BlockConceptParser';
import { inferBlockAccent, estimateSessionMinutes } from '../../lib/warriorProgramDays';
import { WarriorExerciseRow } from './WarriorExerciseRow';
import { SetRow, SetLogEntry } from './SetRow';
import { CircuitRoundCard } from './CircuitRoundCard';
import { LadderRungPicker } from './LadderRungPicker';
import { AmrapInlineTimer } from './AmrapInlineTimer';
import { ForTimeInlineTimer, ForTimeResult } from './ForTimeInlineTimer';
import { InlineVideoPlayer } from './InlineVideoPlayer';
import { SlideToCompleteButton } from './SlideToCompleteButton';

// Design handoff (assets/design_handoff_workout_runner, "Day Blocks") — was
// a fixed dark-only palette independent of the app's own theme toggle; now
// split {dark, light} on request, same relationship-preservation approach
// used for TC_COLORS/COACH_COLORS/WarriorProgramSections' PD_COLORS. Only
// fields actually read are kept (cardOpenBg/cardClosedBg/rowBg — the
// non-"End" variants — were already dead in the prior version).
interface DBPalette {
  cardOpenBgEnd: string;
  cardClosedBgEnd: string;
  borderClosed: string;
  borderDim: string;
  skippedRail: string;
  textPrimary: string;
  textDim: string;
  textFaint: string;
  textMuted: string;
  textFainter: string;
  divider: string;
  chipBg: string;
  chipBorder: string;
  chipBorderDim: string;
  chipText: string;
  chipTextDim: string;
  indexPlateBorderClosed: string;
  logCheckBorder: string;
  washFaint: string;
  washSoft: string;
}

const DB_COLORS: { dark: DBPalette; light: DBPalette } = {
  dark: {
    cardOpenBgEnd: '#0f0f0f',
    cardClosedBgEnd: '#0f0f0f',
    borderClosed: '#1f1f1f',
    borderDim: '#1f1f1f',
    skippedRail: '#3a3a3a',
    textPrimary: '#FFFFFF',
    textDim: '#a0a0a0',
    textFaint: '#8a8a8a',
    textMuted: '#a0a0a0',
    textFainter: '#8a8a8a',
    divider: '#5a5a5a',
    chipBg: '#1a1a1a',
    chipBorder: '#242424',
    chipBorderDim: '#2a2a2a',
    chipText: '#e6e6e6',
    chipTextDim: '#a0a0a0',
    indexPlateBorderClosed: '#1f1f1f',
    logCheckBorder: '#242424',
    washFaint: 'rgba(255,255,255,.02)',
    washSoft: 'rgba(255,255,255,.05)',
  },
  light: {
    cardOpenBgEnd: '#FBF8F8',
    cardClosedBgEnd: '#FCFAFA',
    borderClosed: '#E5DADA',
    borderDim: '#EEE4E4',
    skippedRail: '#D4C4C4',
    textPrimary: '#2A2A2A',
    textDim: '#7A7A7A',
    textFaint: '#8A8A8A',
    textMuted: '#8A8A8A',
    textFainter: '#B0A8A8',
    divider: '#E5DADA',
    chipBg: 'rgba(0,0,0,.03)',
    chipBorder: '#E5DADA',
    chipBorderDim: '#EEE4E4',
    chipText: '#7A7A7A',
    chipTextDim: '#B0A8A8',
    indexPlateBorderClosed: '#E5DADA',
    logCheckBorder: '#DDD0D0',
    washFaint: 'rgba(0,0,0,.03)',
    washSoft: 'rgba(0,0,0,.05)',
  },
};

function hex(color: string, alpha: number): string {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function schemeLabel(block: ProgramBlock, isAmrap: boolean, isForTime: boolean, isLadder: boolean): string {
  const timingSystem = block.metadata?.timing_system;
  if (isAmrap) return 'AMRAP';
  if (isForTime) return 'FOR TIME';
  if (timingSystem === 'tabata') return 'TABATA';
  if (isLadder) return 'LADDER';
  const usesHolds = block.exercises.length > 0 && block.exercises.every((ex) => !!ex.hold_seconds && !ex.reps);
  return usesHolds ? 'HOLDS' : 'STRAIGHT SETS';
}

interface WarriorBlockCardProps {
  block: ProgramBlock;
  /** 1-indexed position within the day's block list — shown on the index plate. */
  index: number;
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
  /** True while the log-details modal handleOpenLogging opens is up for
   * this block — lets the COMPLETE button hold its slid position instead
   * of snapping back while it's open, then reconcile once it closes. */
  isLogPending?: boolean;
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
  index,
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
  isLogPending,
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
  const db = DB_COLORS[mode];
  const styles = getStyles(db);
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
  // These four hold elapsed time / rounds / rung / reps only in local component
  // state (no lifted state, nothing persisted mid-session) — collapsing the
  // block unmounts that subtree and silently destroys it. Each child reports
  // via onActiveChange whether it actually has unsaved progress right now
  // (a running timer, a counted round, a selected rung) — merely being
  // expanded on one of these block types isn't enough to warrant a confirm.
  const [amrapActive, setAmrapActive] = useState(false);
  const [forTimeActive, setForTimeActive] = useState(false);
  const [ladderActive, setLadderActive] = useState(false);
  const [activeCircuitRounds, setActiveCircuitRounds] = useState<Record<number, boolean>>({});
  const handleCircuitActiveChange = useCallback((roundNumber: number, active: boolean) => {
    setActiveCircuitRounds(prev => (prev[roundNumber] === active ? prev : { ...prev, [roundNumber]: active }));
  }, []);
  const hasActiveTimedSession =
    amrapActive || forTimeActive || ladderActive || Object.values(activeCircuitRounds).some(Boolean);
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

  // A coach-assigned fixed tier only applies if the warrior has actually
  // unlocked it (reached it via progression) — sending them at a tier they
  // haven't gotten to yet doesn't make sense, so fall back to their current
  // tier same as when no fixed tier is set at all.
  const currentTierNum = Number(strengthTier) || 0;
  const fixedTrialTier = block.metadata?.tier_trial_tier;
  const tierTrialTargetTier = (fixedTrialTier !== undefined && fixedTrialTier <= currentTierNum)
    ? fixedTrialTier
    : currentTierNum;

  // Day Blocks design: one accent color per block "type", inferred from
  // the block's own name (see inferBlockAccent's comment — no structured
  // type field exists to key off instead).
  const isDone = block.completedStatus === 'completed';
  const skipped = block.completedStatus === 'missed';
  const dim = isDone || skipped;
  const accent = inferBlockAccent(block.name);
  const railColor = skipped ? db.skippedRail : accent.color;
  const scheme = schemeLabel(block, isAmrap, isForTime, isLadder);
  const estMinutes = estimateSessionMinutes({ name: block.name, blocks: [block] });
  const stateLabel = isDone ? 'DONE' : skipped ? 'SKIPPED' : isExpanded ? 'OPEN' : '';
  // Design handoff shipped choice: pills, one row, max 2 names + a
  // separate "+N" pill (not folded into the last name pill's label).
  const previewChips = [
    ...block.exercises.slice(0, 2).map((ex) => ({ key: String(ex.id), label: ex.name, isMore: false })),
    ...(block.exercises.length > 2 ? [{ key: 'more', label: `+${block.exercises.length - 2}`, isMore: true }] : []),
  ];

  // Card entry animation (design handoff §3): fade + translateY(12→0),
  // staggered by index. Classic RN Animated with useNativeDriver:true —
  // same proven pattern as DayCardList's row entry animation
  // (src/components/coaching/DayCardList.tsx) — not reanimated, which
  // crashed here (Hermes abort inside worklets::scheduleOnUI, see the
  // rn_animated_mixed_native_js_driver_crash incident writeup for the
  // general "don't introduce a new animation driver combo untested on
  // device" lesson this repeats).
  const entryAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        entryAnim.setValue(1);
        return;
      }
      Animated.timing(entryAnim, {
        toValue: 1,
        duration: 400,
        delay: 50 + index * 60,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }).catch(() => {
      Animated.timing(entryAnim, { toValue: 1, duration: 400, delay: 50 + index * 60, useNativeDriver: true }).start();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cardOpacity = isLocked ? 0.5 : skipped ? 0.45 : isDone ? 0.66 : 1;
  const entryStyle = {
    opacity: Animated.multiply(entryAnim, cardOpacity),
    transform: [{ translateY: entryAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  // Action row (design handoff §3.4) — SKIP + slide-to-complete. Same
  // handlers the old header-row controls used: handleOpenLogging
  // ('completed'|'missed') / handleToggleBlockStatus(..., 'none'). Rendered
  // right under the pills when collapsed, or at the end of the expanded
  // content when open (see the two render sites below).
  const actionRow = (
    <View style={styles.dbActionRow}>
      {!isDone && (
        <TouchableOpacity
          disabled={isTogglingStatus || isLocked}
          onPress={() => {
            if (skipped) handleToggleBlockStatus(block.id, 'none');
            else handleOpenLogging(block.id, 'missed');
          }}
          style={[
            styles.dbSkipBtn,
            { opacity: (isTogglingStatus || isLocked) ? 0.4 : 1 },
          ]}
        >
          <Text style={{ color: skipped ? '#fff' : db.textMuted, fontSize: 12, fontFamily: 'BarlowCondensed-ExtraBold', letterSpacing: 1.5 }}>
            {skipped ? 'UNDO SKIP' : 'SKIP'}
          </Text>
        </TouchableOpacity>
      )}
      {!skipped && (
        <SlideToCompleteButton
          done={isDone}
          disabled={isTogglingStatus || isLocked}
          pending={isLogPending}
          accentColor={accent.color}
          label="COMPLETE"
          onComplete={() => handleOpenLogging(block.id, 'completed')}
          onUndo={() => handleToggleBlockStatus(block.id, 'none')}
        />
      )}
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
    {activeVideoExercise && (
      <InlineVideoPlayer
        url={activeVideoExercise.youtube_url}
        theme={theme}
        onClose={() => onToggleVideo(activeVideoExercise.id, activeVideoExercise.youtube_url)}
      />
    )}
    {block.metadata?.is_tier_trial ? (
      <LinearGradient
        key={block.id}
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ padding: 1.2, borderRadius: 12, opacity: isLocked ? 0.5 : (isMissed ? 0.75 : 1) }}
      >
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
              params: { mode: 'practice', tier: tierTrialTargetTier }
            });
          }}
        >
          <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 24, color: theme.text.primary, letterSpacing: 2 }}>
            PRACTICE TIER {tierTrialTargetTier}
          </Text>
          <Text style={{ color: theme.text.secondary, fontSize: 12, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 1, marginTop: 4 }}>
            START OFFICIAL TIER ASSESSMENT
          </Text>
        </TouchableOpacity>
      </LinearGradient>
    ) : (
        // Flat card, no outer rainbow gradient border — an earlier version
        // wrapped every block (including this one) in the same purple/red/
        // orange LinearGradient border used for Program cards elsewhere.
        // It wasn't dimmed by isDone (only by isMissed/isLocked), so once a
        // block was logged done the inner content faded but that border
        // stayed at full opacity, reading as "the block turned gradient."
        // Dropped in favor of the card's own accent-tinted border below.
        <Animated.View
          key={block.id}
          style={[
            styles.dbCard,
            { borderColor: isExpanded ? hex(accent.color, 0.32) : dim ? db.borderDim : db.borderClosed },
            entryStyle,
          ]}
        >
          {/* Flat background, no accent-tinted gradient wash — an earlier
              version tinted this with the block's own accent color at open
              time and it read as too heavy, washing out the text above it. */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isExpanded ? db.cardOpenBgEnd : db.cardClosedBgEnd }]} pointerEvents="none" />
          <View style={[styles.dbRail, { backgroundColor: railColor, opacity: isExpanded ? 1 : dim ? 0.4 : 0.6 }]} />

          {/* Collapsible Block Header */}
          <TouchableOpacity
            style={styles.dbHeaderRow}
            onPress={() => {
              if (isExpanded && hasActiveTimedSession) {
                Alert.alert(
                  'Collapse this block?',
                  'This section tracks elapsed time, rounds and reps locally — collapsing it now will lose that progress.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Collapse Anyway', style: 'destructive', onPress: () => toggleBlockExpanded(block.id) },
                  ],
                );
                return;
              }
              toggleBlockExpanded(block.id);
            }}
          >
            {/* Index plate — a read-only status badge (design handoff §3.1):
                shows the block number, a check once done, a dash once
                skipped. Completing/undoing now happens only via the action
                row below, so this is no longer its own tap target. */}
            <View
              style={[
                styles.dbIndexPlate,
                {
                  borderColor: isExpanded ? hex(accent.color, 0.38) : db.indexPlateBorderClosed,
                  backgroundColor: isDone ? accent.color : isExpanded ? hex(accent.color, 0.12) : hex(accent.color, 0.14),
                },
              ]}
            >
              <Text style={{ color: isDone ? '#000' : skipped ? db.textFainter : accent.color, fontSize: 18, fontFamily: 'BarlowCondensed-Bold', fontWeight: '700' }}>
                {skipped ? '–' : isDone ? '✓' : String(index + 1)}
              </Text>
            </View>

            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={[styles.dbTitle, { textDecorationLine: skipped ? 'line-through' : 'none' }]}>
                  {block.name.toUpperCase()}
                </Text>
                {isLocked && <Text style={{ fontSize: 13 }}>🔒</Text>}
                {!!stateLabel && (
                  <View style={[styles.dbStateChip, { backgroundColor: isExpanded ? hex(accent.color, 0.16) : db.washSoft }]}>
                    <Text style={{ color: isExpanded ? accent.color : db.textFaint, fontSize: 7, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 1.2 }}>{stateLabel}</Text>
                  </View>
                )}
              </View>
              <View style={styles.dbMetaRow}>
                <Text style={[styles.dbSchemeText, { color: skipped ? '#8A8A8A' : accent.color }]} numberOfLines={1}>{scheme}</Text>
                <View style={styles.dbDivider} />
                <Text style={styles.dbMetaText} numberOfLines={1}>{block.exercises.length} MOVES</Text>
                <View style={styles.dbDivider} />
                <Text style={styles.dbMetaText} numberOfLines={1}>~{estMinutes} MIN</Text>
              </View>
            </View>

            <View style={styles.dbChevBtn}>
              <MaterialCommunityIcons
                name="chevron-down"
                size={18}
                color={db.textDim}
                style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
              />
            </View>
          </TouchableOpacity>

          {/* Movement preview pills — their own full-width row flush with
              the card's left edge (same inset as the action row below),
              not indented under the index plate/title column. Max 2 name
              pills + a "+N" pill (design handoff shipped choice). */}
          {!isExpanded && previewChips.length > 0 && (
            <View style={styles.dbChipRow}>
              {previewChips.map((c) => (
                <View
                  key={c.key}
                  style={[
                    styles.dbPreviewChip,
                    c.isMore
                      ? { flexGrow: 0, flexShrink: 0, backgroundColor: 'transparent', borderColor: '#2A2A2A' }
                      : { flexGrow: 0, flexShrink: 1, minWidth: 0, backgroundColor: '#1A1A1A', borderColor: '#242424' },
                  ]}
                >
                  <Text
                    style={[styles.dbPreviewChipText, { color: c.isMore ? '#A0A0A0' : '#E6E6E6' }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {c.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Collapsed: action row sits right under the pills. Expanded: it
              moves to the end of the block, after the exercises/timers
              (rendered below, design handoff request: "shows at the end of
              the block" once opened) rather than sitting above them. */}
          {!isExpanded && actionRow}

          {/* Block Content (Expandable) — dbHeaderRow above supplies its own
              padding (13/17 left), this needs the matching horizontal inset
              itself since the old shared blockCard padding wrapper is gone. */}
          {isExpanded && (
            <View style={{ paddingTop: 2, paddingHorizontal: 13, paddingBottom: 13 }}>
              {/* Structure Badge */}
              <View style={{ backgroundColor: db.washSoft, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 12 }}>
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
                          onActiveChange={handleCircuitActiveChange}
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
                      exercises={block.exercises.map(ex => ({ id: ex.id, name: ex.name, youtube_url: ex.youtube_url }))}
                      activeVideoExerciseId={activeVideoExerciseId}
                      onToggleVideo={onToggleVideo}
                      onActiveChange={setLadderActive}
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
                      onActiveChange={setAmrapActive}
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
                      onActiveChange={setForTimeActive}
                    />
                  </View>
                )}
              </View>

              {/* Block Action Buttons Row — the old "LOG SESSION"/"EDIT LOG"
                  trigger here was dropped: it opened the exact same log
                  modal as the persistent SKIP/COMPLETE row now rendered for
                  every block (design handoff §3.4), so it was a duplicate
                  entry point once that row stopped being expanded-only.
                  TABATA's own timer trigger stays — nothing else covers it. */}
              {block.metadata?.timing_system === 'tabata' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
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
                </View>
              )}
            </View>
          )}
          {isExpanded && actionRow}
        </Animated.View>
      )}
    </View>
  );
};


const getStyles = (db: DBPalette) => StyleSheet.create({
  // Day Blocks design tokens (assets/design_handoff_workout_runner) — see
  // the DB constant above for the fixed-dark color palette these draw from.
  dbCard: {
    position: 'relative',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dbRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  dbHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingTop: 16,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 16,
  },
  dbIndexPlate: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dbChevBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dbActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 12,
    paddingBottom: 16,
  },
  dbSkipBtn: {
    flex: 1,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dbTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 19,
    letterSpacing: 1.2,
    lineHeight: 19 * 1.1,
    color: '#FFFFFF',
  },
  dbStateChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  dbMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  dbSchemeText: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 12,
    letterSpacing: 1.3,
  },
  dbDivider: {
    width: 1,
    height: 9,
    backgroundColor: db.divider,
  },
  dbMetaText: {
    color: db.textMuted,
    fontFamily: 'Barlow-Regular',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  // Vertical rhythm: 16 card padding top/bottom, 12 between every section
  // (header -> pills -> actions). Horizontal: every row shares the header's
  // 16 left (incl. the 4px rail) / 12 right, so plate, pills and buttons
  // line up on both edges.
  dbChipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    paddingLeft: 16,
    paddingRight: 12,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  dbPreviewChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: db.chipBg,
  },
  dbPreviewChipText: {
    fontFamily: 'BarlowCondensed-Medium',
    fontSize: 13,
    letterSpacing: 0.3,
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
