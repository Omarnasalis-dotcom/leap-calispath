import { useRouter, useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  BackHandler,
  Alert } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';
import { BlockConceptParser, ConceptMetadata } from '../../lib/BlockConceptParser';
import { SoundServiceInstance } from '../../lib/SoundService';
import { WarriorExerciseRow } from '../../components/coaching/WarriorExerciseRow';
import { WarriorBlockCard } from '../../components/coaching/WarriorBlockCard';
import { WarriorLogModal } from '../../components/coaching/WarriorLogModal';
import { useWarriorTimer } from '../../hooks/useWarriorTimer';
import { WarriorTimerModal } from '../../components/coaching/WarriorTimerModal';
import { ProgramHeaderCard, SwitchWorkoutButton, PointsDashboard, WeekNavigator } from '../../components/coaching/WarriorProgramSections';
import { GlobalErrorBoundary } from '../../components/GlobalErrorBoundary';
import { BodyweightCheckInModal } from '../../components/coaching/BodyweightCheckInModal';
import { SessionCompleteScreen } from '../../components/coaching/SessionCompleteScreen';
import { WorkoutProgressButton } from '../../components/coaching/WorkoutProgressButton';
import { SetLogEntry } from '../../components/coaching/SetRow';
import { Feel } from '../../components/coaching/FeelRpePicker';
import { NotificationService } from '../../services/NotificationService';
import { MissedReason } from '../../components/coaching/MissedReasonPicker';
import { ForTimeResult } from '../../components/coaching/ForTimeInlineTimer';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ExerciseDetail, ProgramBlock, ProgramDay } from '../../types/warriorProgram';
import { parseBlockName, deriveDayStates, estimateSessionMinutes, countMovements, isWarmUpBlock } from '../../lib/warriorProgramDays';
import { DayCardList } from '../../components/coaching/DayCardList';

function getStartOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as week start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface WarriorProgramScreenProps {
  warriorId?: string;
  onClose?: () => void;
}

export function WarriorProgramScreen({ warriorId, onClose }: WarriorProgramScreenProps) {
  const { theme, mode } = useTheme();
  const bronzeGold = '#C8A040';
  const solidCardBg = mode === 'dark' ? '#151515' : '#FFFFFF';

  // State Management
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [programName, setProgramName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [warriorProgramId, setWarriorProgramId] = useState<string>('');

  const [weeksData, setWeeksData] = useState<Record<number, ProgramDay[]>>({ 1: [] });
  const [activeWeek, setActiveWeek] = useState<number>(1);
  const days = weeksData[activeWeek] || [];
  const [activeDayIndex, setActiveDayIndex] = useState<number>(0);
  // 'list' = My Active Program (week/day cards, this screen's default).
  // 'running' = the exercise-logging UI, reached directly from a day
  // card's START/CONTINUE/REVIEW — this is exactly what used to render
  // under the day carousel; only when it renders (not what it renders)
  // changed. (A Session Detail brief screen was tried between these two
  // and removed — real usage found it just added an extra tap with no
  // benefit; SessionDetailView.tsx is left unused rather than deleted in
  // case a lighter-weight version of it is wanted later.)
  const [screenPhase, setScreenPhase] = useState<'list' | 'running'>('list');
  const activeDay = days[activeDayIndex] || null;
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string | number, boolean>>({});
  const [togglingBlockIds, setTogglingBlockIds] = useState<Record<string | number, boolean>>({});

  // In-progress per-set logging state, keyed by blockId -> exerciseId -> logged sets.
  // Only persisted (via log_block_with_sets) in one batch write when the block is logged.
  const [blockSetProgress, setBlockSetProgress] = useState<Record<string | number, Record<string | number, SetLogEntry[]>>>({});

  const handleSetLogged = (blockId: string | number, exerciseId: string | number, entry: SetLogEntry) => {
    setBlockSetProgress(prev => {
      const blockEntry = prev[blockId] || {};
      const existing = blockEntry[exerciseId] || [];
      const next = [...existing.filter(s => s.setIndex !== entry.setIndex), entry];
      return { ...prev, [blockId]: { ...blockEntry, [exerciseId]: next } };
    });
  };

  // Log Form State
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [activeLogBlockId, setActiveLogBlockId] = useState<string | number | null>(null);
  const [logNotes, setLogNotes] = useState('');
  const [logRating, setLogRating] = useState<number>(5);
  const [logLoading, setLogLoading] = useState(false);
  const [logStatus, setLogStatus] = useState<'completed' | 'missed'>('completed');
  const [logAmrapRounds, setLogAmrapRounds] = useState('');
  const [logForTimeDuration, setLogForTimeDuration] = useState('');
  const [logWeightUsed, setLogWeightUsed] = useState('');
  const [logLadderProgress, setLogLadderProgress] = useState('');
  const [pendingHoldTimes, setPendingHoldTimes] = useState<number[]>([]);
  const [logFeel, setLogFeel] = useState<Feel | null>(null);
  const [logRpe, setLogRpe] = useState<number | null>(null);
  const [logMissedReason, setLogMissedReason] = useState<MissedReason | null>(null);
  const [logMissedDetail, setLogMissedDetail] = useState('');
  // Today's already-submitted workout_logs rows, keyed by block_id — lets
  // "EDIT LOG" pre-fill the modal with what was actually saved instead of
  // opening blank and forcing the warrior to redo the whole entry.
  const [loggedDetails, setLoggedDetails] = useState<Record<string, {
    notes: string; feel: string | null; rpe: number | null;
    missed_reason: string | null; missed_detail: string | null;
  }>>({});

  // Active Timer State (Extracted to Hook)
  const [activeTimerBlock, setActiveTimerBlock] = useState<ProgramBlock | null>(null);

  // Blocks are no longer sequentially gated — a warrior can log any block in
  // any order (see the isLocked prop passed to WarriorBlockCard, which is
  // always false for the same reason). Kept as a function rather than
  // deleting the six call sites below, so this remains the one place to
  // re-enable a lock rule if that ever changes.
  const isBlockLocked = (blockId: string | number): boolean => {
    return false;
  };

  const startTimerForBlock = (block: ProgramBlock) => {
    if (isBlockLocked(block.id)) return;
    setActiveTimerBlock(block);
  };

  const formatTimerString = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Performance Points States
  const [staticPoints, setStaticPoints] = useState<number>(0);
  const [powerPoints, setPowerPoints] = useState<number>(0);
  const [oneMmPoints, setOneMmPoints] = useState<number>(0);
  const [strengthTier, setStrengthTier] = useState<number>(0);

  // Recommendations State

  // Weekly bodyweight check-in — optional (skippable), and once entered for
  // the week it can be reopened and changed rather than being locked in;
  // bodyweightLogId tracks whether a row already exists this week so
  // handleSubmitBodyweight updates it instead of inserting a duplicate.
  const [showBodyweightCheckIn, setShowBodyweightCheckIn] = useState(false);
  const [bodyweightSaving, setBodyweightSaving] = useState(false);
  const [bodyweightThisWeek, setBodyweightThisWeek] = useState<number | null>(null);
  const [bodyweightLogId, setBodyweightLogId] = useState<string | null>(null);

  // Session-complete tracking — the workout progress button at the bottom of
  // the block list is the only way into this now (no more auto-popup); it
  // opens the same stats view whether the day is finished or still in progress.
  const sessionStartRef = useRef<number>(Date.now());
  const [showSessionComplete, setShowSessionComplete] = useState(false);
  // Which exercise's demo video is currently open inline — only one at a time,
  // app-wide, so opening a new one closes whatever was previously playing.
  const [activeVideoExerciseId, setActiveVideoExerciseId] = useState<string | number | null>(null);
  // Total reps logged today — accumulated as blocks are submitted (see
  // handleLogWorkout/quickLogWorkout) since blockSetProgress for a block is
  // cleared once it's logged, so it can't be summed after the fact.
  const [sessionTotalReps, setSessionTotalReps] = useState(0);

  useEffect(() => {
    sessionStartRef.current = Date.now();
    setSessionTotalReps(0);
  }, [activeDayIndex, activeWeek]);

  const loggableBlocks = (days[activeDayIndex]?.blocks || []).filter(b => !b.metadata?.is_tier_trial);
  // "Addressed" = every block has some status (completed or missed) — this is
  // what flips the button/stats screen to "WORKOUT DONE" and unlocks Send to
  // Coach. "Completed-only" drives the fill bar / completion % / blocks-done
  // stat, since a missed block shouldn't visually count as progress.
  const blocksCompletedCount = loggableBlocks.filter(b => b.completedStatus === 'completed').length;
  const blocksAddressedCount = loggableBlocks.filter(b => b.completedStatus !== 'none').length;
  const blocksTotalCount = loggableBlocks.length;
  const isWorkoutAddressed = blocksTotalCount > 0 && blocksAddressedCount === blocksTotalCount;
  const exercisesDoneCount = loggableBlocks
    .filter(b => b.completedStatus !== 'none')
    .reduce((sum, b) => sum + b.exercises.length, 0);

  const handleWorkoutDonePress = () => {
    const unaddressedBlocks = loggableBlocks.filter(b => b.completedStatus === 'none');
    const unaddressedCount = unaddressedBlocks.length;
    if (unaddressedCount <= 0) {
      setShowSessionComplete(true);
      return;
    }
    Alert.alert(
      unaddressedCount === 1 ? '1 BLOCK NOT LOGGED YET' : `${unaddressedCount} BLOCKS NOT LOGGED YET`,
      'Mark them as completed or missed so your coach has the full picture — or continue anyway and they\'ll be marked as missed automatically.',
      [
        { text: 'REVIEW', style: 'cancel' },
        {
          text: 'CONTINUE ANYWAY',
          onPress: async () => {
            await Promise.all(unaddressedBlocks.map(b => handleToggleBlockStatus(b.id, 'missed')));
            setShowSessionComplete(true);
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadWarriorProgram();
    checkBodyweightCheckIn();
  }, [warriorId]);

  // Re-fetch whenever this screen regains focus (e.g. after selecting a
  // template from the recommendations screen and navigating back) — without
  // this, the screen keeps showing its stale "no program assigned" state
  // since expo-router reuses the existing screen instance on router.back().
  useFocusEffect(
    useCallback(() => {
      loadWarriorProgram();
    }, [warriorId])
  );

  async function checkBodyweightCheckIn() {
    if (!warriorId) return;
    const startOfWeek = getStartOfIsoWeek(new Date());
    const { data, error } = await supabase
      .from('bodyweight_logs')
      .select('id, weight_kg')
      .eq('warrior_id', warriorId)
      .gte('logged_at', startOfWeek.toISOString())
      .order('logged_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && !data) {
      setShowBodyweightCheckIn(true);
    } else if (data) {
      setBodyweightThisWeek(data.weight_kg);
      setBodyweightLogId(data.id);
    }
  }

  const handleSubmitBodyweight = async (weightKg: number) => {
    setBodyweightSaving(true);
    try {
      // Once a week already has an entry, editing it updates that same row
      // instead of inserting a second one for the week.
      if (bodyweightLogId) {
        const { error } = await supabase
          .from('bodyweight_logs')
          .update({ weight_kg: weightKg })
          .eq('id', bodyweightLogId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('bodyweight_logs')
          .insert({
            warrior_id: warriorId,
            warrior_program_id: warriorProgramId || null,
            weight_kg: weightKg,
          })
          .select('id')
          .single();
        if (error) throw error;
        setBodyweightLogId(data.id);
      }
      setBodyweightThisWeek(weightKg);
      setShowBodyweightCheckIn(false);
    } catch (err: any) {
      Alert.alert('ERROR', err.message?.toUpperCase() || 'FAILED TO SAVE BODYWEIGHT.');
    } finally {
      setBodyweightSaving(false);
    }
  };

  const handleClose = () => {
    if (activeTimerBlock !== null) {
      if (Platform.OS === 'web') {
        if (window.confirm('You have an active workout in progress. Leaving this screen will reset it. Are you sure you want to leave?')) {
          setActiveTimerBlock(null);
          if (onClose) onClose();
        }
      } else {
        Alert.alert(
          'ACTIVE WORKOUT',
          'You have an active workout in progress. Leaving this screen will reset it. Are you sure you want to leave?',
          [
            { text: 'STAY', style: 'cancel', onPress: () => {} },
            {
              text: 'LEAVE',
              style: 'destructive',
              onPress: () => {
                setActiveTimerBlock(null);
                if (onClose) onClose();
              },
            },
          ]
        );
      }
    } else {
      if (onClose) onClose();
    }
  };

  // Android hardware back returns to the day list instead of exiting the
  // screen, matching the header back chevron — only 'list' falls through
  // to the real exit.
  useEffect(() => {
    if (screenPhase === 'list') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setScreenPhase('list');
      return true;
    });
    return () => sub.remove();
  }, [screenPhase]);


  // Main loader for assigned program and completion state
  async function loadWarriorProgram() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Batch A: none of these three depend on each other's results, so fire
      // them together instead of one-at-a-time. This was previously a fully
      // sequential 6-query waterfall (profiles -> warrior_programs ->
      // program_week_archive -> program_blocks -> workout_logs ->
      // block_exercises) — on a mobile connection with ~200-300ms per round
      // trip that's 1.5-2s of pure network latency before any data shows up.
      // Only program_week_archive/program_blocks (need activeTemplateId) and
      // block_exercises (needs the resulting block ids) have a real
      // dependency chain — see batches B and C below.
      const [profileRes, assignmentRes, loggedTodayRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('statics_tier, power_points, one_mm_points, strength_tier')
          .eq('id', warriorId)
          .maybeSingle(),
        supabase
          .from('warrior_programs')
          .select(`
            id,
            template_id,
            coach_id,
            current_week,
            profiles:coach_id (
              display_name
            ),
            program_templates:template_id (
              name,
              description
            )
          `)
          .eq('warrior_id', warriorId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('workout_logs')
          .select('block_id, notes, feel, rpe, missed_reason, missed_detail')
          .eq('warrior_id', warriorId)
          .gte('completed_at', startOfToday.toISOString()),
      ]);

      const { data: profilePoints } = profileRes;
      if (profilePoints) {
        setStaticPoints(profilePoints.statics_tier || 0);
        setPowerPoints(profilePoints.power_points || 0);
        setOneMmPoints(profilePoints.one_mm_points || 0);
        setStrengthTier(profilePoints.strength_tier || 0);
      }

      const { data: assignment, error: assignmentError } = assignmentRes;
      if (assignmentError) throw assignmentError;

      const actualAssignment = Array.isArray(assignment) ? assignment[0] : assignment;

      if (!actualAssignment) {
        // No program assigned — skip the "NO PROGRAM ASSIGNED YET" empty
        // state entirely and go straight to picking one. Replace (not push)
        // so backing out of the recommendations screen returns to Profile
        // rather than bouncing back into this now-skipped screen.
        router.replace('/template-recommendations');
        return;
      }

      const templatesInfo: any = actualAssignment.program_templates;
      const progName = Array.isArray(templatesInfo)
        ? templatesInfo[0]?.name
        : templatesInfo?.name;

      const coachInfo: any = actualAssignment.profiles;
      const cName = Array.isArray(coachInfo)
        ? coachInfo[0]?.display_name
        : coachInfo?.display_name;

      const activeTemplateId = actualAssignment.template_id;
      setProgramName(progName || 'ASSIGNED WORKOUT PROGRAM');
      setCoachName(cName || 'COACH');
      setTemplateId(activeTemplateId);
      setWarriorProgramId(actualAssignment.id);

      const { data: loggedToday, error: loggedError } = loggedTodayRes;
      if (loggedError) throw loggedError;

      const loggedBlockMap = new Map((loggedToday || []).map((l: any) => [l.block_id, l.notes || '']));
      setLoggedDetails(Object.fromEntries(
        (loggedToday || []).map((l: any) => [l.block_id, {
          notes: l.notes || '',
          feel: l.feel,
          rpe: l.rpe,
          missed_reason: l.missed_reason,
          missed_detail: l.missed_detail,
        }])
      ));

      // Batch B: program_week_archive and program_blocks both only depend on
      // activeTemplateId (just resolved above), not on each other — run
      // together. program_week_archive excludes any week the coach has
      // archived, which stays fully visible to the coach but drops out of
      // the warrior's own program view here.
      const [archivedRes, blocksRes] = await Promise.all([
        supabase
          .from('program_week_archive')
          .select('week_number')
          .eq('template_id', activeTemplateId),
        supabase
          .from('program_blocks')
          .select('id, name, notes, order_index, week_number')
          .eq('template_id', activeTemplateId)
          .order('order_index', { ascending: true }),
      ]);

      const { data: archivedWeeksData, error: archivedWeeksError } = archivedRes;
      if (archivedWeeksError) throw archivedWeeksError;
      const archivedWeeks = new Set((archivedWeeksData || []).map(w => w.week_number));

      const { data: rawBlocksData, error: blocksError } = blocksRes;
      if (blocksError) throw blocksError;
      const blocksData = (rawBlocksData || []).filter(b => !archivedWeeks.has(b.week_number || 1));

      // Renumber remaining weeks sequentially for display only — the raw
      // week_number values aren't touched (coach-side views and the export
      // builder still use them as-is), but if e.g. week 1 got archived and
      // weeks 2-3 remain, the warrior should see "Week 1, Week 2", not a
      // confusing "Week 2, Week 3" gap.
      const remainingRawWeeks = Array.from(new Set((blocksData || []).map(b => b.week_number || 1))).sort((a, b) => a - b);
      const rawToDisplayWeek = new Map<number, number>(remainingRawWeeks.map((raw, idx) => [raw, idx + 1]));

      // Batch C: block_exercises needs the block ids from batch B, so it has
      // to wait — but it's still one batched IN(...) query for every block
      // rather than one query per block (fixed N+1, kept as-is here).
      const blockIds = (blocksData || []).map(b => b.id);
      let allExercisesData: any[] = [];

      if (blockIds.length > 0) {
        const { data: exercisesBatchData, error: batchError } = await supabase
          .from('block_exercises')
          .select(`
            id,
            block_id,
            exercise_id,
            sets,
            reps,
            rest_seconds,
            hold_seconds,
            is_weighted,
            notes,
            order_index,
            exercise_library (
              name,
              youtube_url
            )
          `)
          .in('block_id', blockIds)
          .order('order_index', { ascending: true });

        if (batchError) throw batchError;
        allExercisesData = exercisesBatchData || [];
      }

      const exercisesByBlock: Record<string, any[]> = {};
      allExercisesData.forEach(ex => {
        if (!exercisesByBlock[ex.block_id]) exercisesByBlock[ex.block_id] = [];
        exercisesByBlock[ex.block_id].push(ex);
      });

      const newWeeksMap: Record<number, ProgramDay[]> = {};
      const weekDaysMap: Record<number, Record<string, ProgramDay>> = {};
      const weekDayOrder: Record<number, string[]> = {};

      for (const block of blocksData || []) {
        const exercisesData = exercisesByBlock[block.id] || [];


        const mappedExercises: ExerciseDetail[] = (exercisesData || []).map((ex: any) => {
          const lib = Array.isArray(ex.exercise_library)
            ? ex.exercise_library[0]
            : ex.exercise_library;
          return {
            id: ex.id,
            name: lib?.name || 'UNNAMED EXERCISE',
            youtube_url: lib?.youtube_url || '',
            sets: ex.sets || '0',
            reps: ex.reps || '0',
            rest_seconds: ex.rest_seconds || '0',
            hold_seconds: ex.hold_seconds || '',
            is_weighted: ex.is_weighted || false,
            notes: ex.notes || ''
          };
        });

        const parsed = BlockConceptParser.parse(block.notes);
        const plainNotes = parsed.cleanNotes;

        const { dayName, blockName } = parseBlockName(block.name || '');

        const notesStr = loggedBlockMap.get(block.id) || '';
        const completedStatus = loggedBlockMap.has(block.id)
          ? (notesStr.startsWith('[STATUS:MISSED]') ? 'missed' : 'completed')
          : 'none';
          
        const rawWeekNum = block.week_number || 1;
        const weekNum = rawToDisplayWeek.get(rawWeekNum) ?? rawWeekNum;

        const mappedBlock: ProgramBlock = {
          id: block.id,
          name: blockName,
          notes: plainNotes,
          exercises: mappedExercises,
          completedStatus,
          metadata: parsed.metadata,
          week_number: weekNum
        };

        const dayKey = dayName.toUpperCase();
        if (!weekDaysMap[weekNum]) {
          weekDaysMap[weekNum] = {};
          weekDayOrder[weekNum] = [];
        }
        if (!weekDaysMap[weekNum][dayKey]) {
          weekDaysMap[weekNum][dayKey] = {
            name: dayName,
            blocks: []
          };
          weekDayOrder[weekNum].push(dayKey);
        }
        weekDaysMap[weekNum][dayKey].blocks.push(mappedBlock);
      }

      for (const weekNumStr of Object.keys(weekDaysMap)) {
        const weekNum = parseInt(weekNumStr, 10);
        newWeeksMap[weekNum] = weekDayOrder[weekNum].map(key => weekDaysMap[weekNum][key]);
      }
      
      if (Object.keys(newWeeksMap).length === 0) {
        newWeeksMap[1] = [];
      }
      
      setWeeksData(newWeeksMap);

      // current_week is the source of truth for which week the athlete
      // should land on (set by the RPCs that create/advance this assignment
      // — see 20260710100000_add_warrior_programs_current_week.sql). Map it
      // through the same raw->display renumbering as the blocks above, and
      // fall back to the highest displayed week if that raw week got
      // archived out from under it.
      const maxWeek = Math.max(...Object.keys(newWeeksMap).map(k => parseInt(k, 10)));
      const rawCurrentWeek = actualAssignment.current_week || 1;
      const targetWeek = rawToDisplayWeek.get(rawCurrentWeek) ?? maxWeek;
      setActiveWeek(targetWeek);
      setActiveDayIndex(0);

    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD ACTIVE PROGRAM.');
    } finally {
      setLoading(false);
    }
  }

  // targetStatus is the explicit state to switch to (not a cycle) — the DONE and
  // SKIP buttons in WarriorBlockCard each toggle their own status directly.
  // Marking "missed" (skip) is deliberately allowed even while the block is
  // locked, so a warrior can skip past a block they don't want to do instead
  // of being stuck; only marking "completed" requires it to be unlocked.
  const handleToggleBlockStatus = async (blockId: string | number, targetStatus: 'completed' | 'missed' | 'none') => {
    if (togglingBlockIds[blockId]) return;
    if (targetStatus === 'completed' && isBlockLocked(blockId)) return;

    const nextStatus = targetStatus;
    const previousStatus = days.flatMap(d => d.blocks).find(b => b.id === blockId)?.completedStatus || 'none';

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    setTogglingBlockIds(prev => ({ ...prev, [blockId]: true }));
    try {
      const { data: toggleResult, error } = await supabase.rpc('toggle_block_status', {
        p_warrior_id: warriorId,
        p_warrior_program_id: warriorProgramId,
        p_block_id: blockId,
        p_next_status: nextStatus,
        p_start_of_today: startOfToday.toISOString()
      });

      if (error) throw error;

      if ((nextStatus === 'completed' || nextStatus === 'missed') && toggleResult?.workout_log_id) {
        NotificationService.notifyCoachWorkoutLogged(toggleResult.workout_log_id);
      }

      // Optimistically update the UI state
      const updateBlockInDays = (dayList: ProgramDay[]) => {
        return dayList.map(d => ({
          ...d,
          blocks: d.blocks.map(b => b.id === blockId ? { ...b, completedStatus: nextStatus } : b)
        }));
      };

      setWeeksData(prev => {
        const next = { ...prev };
        if (next[activeWeek]) {
          next[activeWeek] = updateBlockInDays(next[activeWeek]);
        }
        return next;
      });

      // Quick-toggling straight to "completed" (no detailed per-set logging)
      // still needs to count toward the session's total reps, using the
      // prescribed sets × reps fallback in sumBlockReps. Reverting back off
      // "completed" removes what was added so the total stays accurate.
      if (nextStatus === 'completed' && previousStatus !== 'completed') {
        setSessionTotalReps(prev => prev + sumBlockReps(blockId));
      } else if (previousStatus === 'completed' && nextStatus !== 'completed') {
        setSessionTotalReps(prev => Math.max(0, prev - sumBlockReps(blockId)));
      }

    } catch (err: any) {
      console.error("Failed to toggle block status:", err);
      // Revert on failure
      await loadWarriorProgram();
    } finally {
      setTogglingBlockIds(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
    }
  };

  // Reverses handleLogWorkout/quickLogWorkout's finalNotes composition — pulls
  // the AMRAP/FOR TIME/ladder/weight '[LOG] ...' lines back out of a saved
  // notes string so "EDIT LOG" can restore them instead of opening blank.
  const parseLoggedNotes = (notes: string) => {
    let amrapRounds = '';
    let forTimeDuration = '';
    let ladderProgress = '';
    let weightUsed = '';
    const freeLines: string[] = [];
    (notes || '').split('\n').forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^\[LOG\] Completed: (.+) Rounds\/Reps$/))) {
        amrapRounds = m[1];
      } else if ((m = line.match(/^\[LOG\] Finished in: (.+)$/))) {
        forTimeDuration = m[1];
      } else if ((m = line.match(/^\[LOG\] Ladder Progress: (.+)$/))) {
        ladderProgress = m[1];
      } else if ((m = line.match(/^\[LOG\] Weight Used: (.+) KG$/))) {
        weightUsed = m[1];
      } else {
        freeLines.push(line);
      }
    });
    return { amrapRounds, forTimeDuration, ladderProgress, weightUsed, freeText: freeLines.join('\n') };
  };

  // Open Log modal for specific block — pre-fills from the already-submitted
  // log (if any) so "EDIT LOG" lets the warrior adjust what's there instead
  // of forcing a full rewrite. initialStatus is set when opened from the
  // header DONE/SKIP buttons (see WarriorBlockCard), so the modal comes up
  // already in that status for the warrior to fill in and submit — SKIP
  // bypasses the lock check the same way the quick-toggle path always has,
  // since skipping past a locked block must stay possible.
  const handleOpenLogModal = (blockId: string | number, initialStatus?: 'completed' | 'missed') => {
    if (isBlockLocked(blockId) && initialStatus !== 'missed') return;
    setActiveLogBlockId(blockId);
    setLogRating(5);

    const existing = loggedDetails[blockId];
    if (existing) {
      const isMissed = existing.notes.startsWith('[STATUS:MISSED]');
      setLogStatus(isMissed ? 'missed' : 'completed');
      setLogFeel((existing.feel as Feel) ?? null);
      setLogRpe(existing.rpe ?? null);
      setLogMissedReason((existing.missed_reason as MissedReason) ?? null);
      setLogMissedDetail(existing.missed_detail || '');
      if (isMissed) {
        // '[STATUS:MISSED]' replaces the whole notes field on save (see
        // log_block_with_sets), so there's nothing structured to recover here.
        setLogNotes('');
        setLogAmrapRounds('');
        setLogForTimeDuration('');
        setLogLadderProgress('');
        setLogWeightUsed('');
      } else {
        const parsed = parseLoggedNotes(existing.notes);
        setLogNotes(parsed.freeText);
        setLogAmrapRounds(parsed.amrapRounds);
        setLogForTimeDuration(parsed.forTimeDuration);
        setLogLadderProgress(parsed.ladderProgress);
        setLogWeightUsed(parsed.weightUsed);
      }
    } else {
      setLogNotes('');
      setLogStatus('completed');
      setLogFeel(null);
      setLogRpe(null);
      setLogMissedReason(null);
      setLogMissedDetail('');
      setLogAmrapRounds('');
      setLogForTimeDuration('');
      setLogLadderProgress('');
      setLogWeightUsed('');
    }

    if (initialStatus) {
      setLogStatus(initialStatus);
    }

    setLogModalVisible(true);
  };

  // Fired when the inline ladder logger (rendered inside the block card)
  // finalizes an attempt — opens the log modal pre-filled with the ladder
  // progress summary so the warrior can still add feel/RPE before submitting.
  const handleLadderFinalize = (blockId: string | number, summary: string) => {
    if (isBlockLocked(blockId)) return;
    setActiveLogBlockId(blockId);
    setLogNotes('');
    setLogStatus('completed');
    setLogRating(5);
    setLogFeel(null);
    setLogRpe(null);
    setLogMissedReason(null);
    setLogMissedDetail('');
    setLogLadderProgress(summary);
    setLogModalVisible(true);
  };

  // Fired when the inline AMRAP timer (rendered inside the block card) finalizes
  // an attempt — opens the log modal pre-filled with the round count, same as
  // the ladder logger above, so the warrior can still add feel/RPE before submitting.
  const handleAmrapFinalize = (blockId: string | number, roundsCompleted: number) => {
    if (isBlockLocked(blockId)) return;
    setActiveLogBlockId(blockId);
    setLogNotes('');
    setLogStatus('completed');
    setLogRating(5);
    setLogFeel(null);
    setLogRpe(null);
    setLogMissedReason(null);
    setLogMissedDetail('');
    setLogAmrapRounds(String(roundsCompleted));
    setLogModalVisible(true);
  };

  // Fired when the inline FOR TIME timer (rendered inside the block card)
  // finalizes an attempt — opens the log modal pre-filled with the result.
  // Submitting before the time cap means the full workout (all rounds) got
  // done, so the elapsed time itself is the score. If the cap ran out first,
  // the tracked round count is what's reported instead — "how far did you get."
  const handleForTimeFinalize = (blockId: string | number, result: ForTimeResult) => {
    if (isBlockLocked(blockId)) return;
    setActiveLogBlockId(blockId);
    setLogNotes('');
    setLogStatus('completed');
    setLogRating(5);
    setLogFeel(null);
    setLogRpe(null);
    setLogMissedReason(null);
    setLogMissedDetail('');
    setLogForTimeDuration(
      result.capped
        ? `Reached round ${result.roundsCompleted} of ${result.totalRounds} (time cap reached)`
        : formatTimerString(result.elapsedSeconds)
    );
    setLogModalVisible(true);
  };

  // Insert workout log into workout_logs table
  // Prescribed sets × reps for a block, from the program definition itself —
  // the fallback used when a block was marked done via the quick DONE/SKIP
  // header toggle rather than actual per-set logging, so "total reps" isn't
  // just silently 0 for blocks nobody opened up to log in detail.
  const getPrescribedReps = (blockId: string | number): number => {
    const block = days.flatMap(d => d.blocks).find(b => b.id === blockId);
    if (!block) return 0;
    return block.exercises.reduce((sum, ex) => {
      const sets = parseInt(String(ex.sets || '1'), 10) || 1;
      const reps = parseInt(String(ex.reps || '0'), 10) || 0;
      return sum + sets * reps;
    }, 0);
  };

  // Sum of reps logged for a block so far, used for the "total reps" session
  // stat. Prefers actual per-set/round reps tracked in blockSetProgress
  // (straight-set/circuit/superset/ladder); falls back to the prescribed
  // sets × reps when no detailed logging happened for this block at all.
  const sumBlockReps = (blockId: string | number): number => {
    const exerciseSets = blockSetProgress[blockId] || {};
    const logged = Object.values(exerciseSets).reduce(
      (sum, entries) => sum + entries.reduce((s, e: SetLogEntry) => s + (e.reps || 0), 0),
      0
    );
    return logged > 0 ? logged : getPrescribedReps(blockId);
  };

  // Assembles the workout_set_logs payload for a block: per-set entries from
  // blockSetProgress (straight-set blocks) plus any Tabata hold times logged
  // during the timer session. AMRAP round counts are captured in the notes
  // text (see finalNotes below) rather than as synthetic set rows, since
  // there's no per-round weight/reps detail worth storing structurally there.
  const buildSetsPayload = (blockId: string | number) => {
    const sets: { block_exercise_id: string | number | null; set_index: number; reps_completed: number | null; weight_used: number | null; hold_seconds: number | null }[] = [];

    const exerciseSets = blockSetProgress[blockId] || {};
    Object.entries(exerciseSets).forEach(([exerciseId, entries]) => {
      entries.forEach((entry: SetLogEntry) => {
        sets.push({
          block_exercise_id: exerciseId,
          set_index: entry.setIndex,
          reps_completed: entry.reps,
          weight_used: entry.weight ?? null,
          hold_seconds: null,
        });
      });
    });

    pendingHoldTimes.forEach((seconds, i) => {
      sets.push({
        block_exercise_id: null,
        set_index: i + 1,
        reps_completed: null,
        weight_used: null,
        hold_seconds: seconds,
      });
    });

    return sets;
  };

  const handleLogWorkout = async () => {
    if (!activeLogBlockId || !templateId) return;

    setLogLoading(true);
    try {
      let finalNotes = '';
      if (logAmrapRounds) finalNotes += `[LOG] Completed: ${logAmrapRounds} Rounds/Reps\n`;
      if (logForTimeDuration) finalNotes += `[LOG] Finished in: ${logForTimeDuration}\n`;
      if (logLadderProgress) finalNotes += `[LOG] Ladder Progress: ${logLadderProgress}\n`;
      if (logWeightUsed) finalNotes += `[LOG] Weight Used: ${logWeightUsed} KG\n`;
      if (logNotes) finalNotes += logNotes;
      finalNotes = finalNotes.trim();

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { data: logResult, error } = await supabase.rpc('log_block_with_sets', {
        p_warrior_id: warriorId,
        p_warrior_program_id: warriorProgramId,
        p_block_id: activeLogBlockId,
        p_status: logStatus,
        p_feel: logStatus === 'completed' ? logFeel : null,
        p_rpe: logStatus === 'completed' ? logRpe : null,
        p_missed_reason: logStatus === 'missed' ? logMissedReason : null,
        p_missed_detail: logStatus === 'missed' ? logMissedDetail : null,
        p_notes: finalNotes,
        p_session_seconds: null,
        p_start_of_today: startOfToday.toISOString(),
        p_sets: buildSetsPayload(activeLogBlockId),
      }).abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        if (error.message?.toLowerCase().includes('abort')) {
          throw new Error('Network request timed out. Please check your connection.');
        }
        throw error;
      }

      if ((logStatus === 'completed' || logStatus === 'missed') && logResult?.workout_log_id) {
        NotificationService.notifyCoachWorkoutLogged(logResult.workout_log_id);
      }

      setLogModalVisible(false);
      setSessionTotalReps(prev => prev + sumBlockReps(activeLogBlockId));
      setBlockSetProgress(prev => {
        const next = { ...prev };
        delete next[activeLogBlockId];
        return next;
      });
      setPendingHoldTimes([]);
      // Collapse the just-logged block so the next unlocked block is easy to open.
      setExpandedBlocks(prev => ({ ...prev, [activeLogBlockId]: false }));

      // Optimistically update UI
      const nextStatus = logStatus;
      const updateBlockInDays = (dayList: ProgramDay[]) => {
        return dayList.map(d => ({
          ...d,
          blocks: d.blocks.map(b => b.id === activeLogBlockId ? { ...b, completedStatus: nextStatus } : b)
        }));
      };

      setWeeksData(prev => {
        const next = { ...prev };
        if (next[activeWeek]) {
          next[activeWeek] = updateBlockInDays(next[activeWeek]);
        }
        return next;
      });

    } catch (err: any) {
      Alert.alert('ERROR', err.message?.toUpperCase() || 'FAILED TO LOG WORKOUT.');
      await loadWarriorProgram();
    } finally {
      setLogLoading(false);
    }
  };


  const promptOptionalLogging = (blockId: string | number, status: 'completed' | 'missed', isWeighted: boolean = false) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Would you like to add custom notes and intensity rating to this workout?\n\nOK for YES, Cancel for NO (Submit Directly)")) {
        setActiveLogBlockId(blockId);
        setLogStatus(status);
        setLogNotes('');
        setLogRating(5);
        setLogFeel(null);
        setLogRpe(null);
        setLogMissedReason(null);
        setLogMissedDetail('');
        setLogAmrapRounds('');
        setLogForTimeDuration('');
        setLogWeightUsed('');
        setLogLadderProgress('');
        setLogModalVisible(true);
      } else {
        quickLogWorkout(blockId, status);
      }
    } else {
      Alert.alert(
        "LOG DETAILS (OPTIONAL)",
        "Would you like to add custom notes and intensity rating to this workout?",
        [
          {
            text: "ADD DETAILS & NOTES",
            onPress: () => {
              setActiveLogBlockId(blockId);
              setLogStatus(status);
              setLogNotes('');
              setLogRating(5);
            setLogFeel(null);
            setLogRpe(null);
            setLogMissedReason(null);
            setLogMissedDetail('');
              setLogAmrapRounds('');
              setLogForTimeDuration('');
              setLogWeightUsed('');
              setLogLadderProgress('');
              setLogModalVisible(true);
            }
          },
          {
            text: "DISMISS / SUBMIT DIRECTLY",
            onPress: () => quickLogWorkout(blockId, status)
          }
        ],
        { cancelable: false }
      );
    }
  };

  const quickLogWorkout = async (blockId: string | number, status: 'completed' | 'missed') => {
    if (!templateId) return;
    setLogLoading(true);
    try {
      let finalNotes = '';
      if (logAmrapRounds) finalNotes += `[LOG] Completed: ${logAmrapRounds} Rounds/Reps\n`;
      if (logForTimeDuration) finalNotes += `[LOG] Finished in: ${logForTimeDuration}\n`;
      if (logLadderProgress) finalNotes += `[LOG] Ladder Progress: ${logLadderProgress}\n`;
      if (logWeightUsed) finalNotes += `[LOG] Weight Used: ${logWeightUsed} KG\n`;
      if (logNotes) finalNotes += logNotes;

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      let timerId: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Network request timed out. Please check your connection.')), 10000);
      });

      const { data: quickLogResult, error } = await Promise.race([
        supabase.rpc('log_block_with_sets', {
          p_warrior_id: warriorId,
          p_warrior_program_id: warriorProgramId,
          p_block_id: blockId,
          p_status: status,
          p_feel: status === 'completed' ? logFeel : null,
          p_rpe: status === 'completed' ? logRpe : null,
          p_missed_reason: status === 'missed' ? logMissedReason : null,
          p_missed_detail: status === 'missed' ? logMissedDetail : null,
          p_notes: finalNotes.trim(),
          p_session_seconds: null,
          p_start_of_today: startOfToday.toISOString(),
          p_sets: buildSetsPayload(blockId),
        }),
        timeoutPromise
      ]) as any;

      if (timerId) clearTimeout(timerId);
      if (error) throw error;

      if ((status === 'completed' || status === 'missed') && quickLogResult?.workout_log_id) {
        NotificationService.notifyCoachWorkoutLogged(quickLogResult.workout_log_id);
      }

      setSessionTotalReps(prev => prev + sumBlockReps(blockId));
      setBlockSetProgress(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
      setPendingHoldTimes([]);
      // Collapse the just-logged block so the next unlocked block is easy to open.
      setExpandedBlocks(prev => ({ ...prev, [blockId]: false }));
      await loadWarriorProgram();
      setLogModalVisible(false);
    } catch (err: any) {
      Alert.alert('ERROR', err.message?.toUpperCase() || 'FAILED TO LOG WORKOUT.');
    } finally {
      setLogLoading(false);
    }
  };


  const toggleBlockExpanded = (blockId: string | number) => {
    setExpandedBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };

  const handleToggleVideo = (exerciseId: string | number, url: string) => {
    if (!url) return;
    setActiveVideoExerciseId(prev => (prev === exerciseId ? null : exerciseId));
  };

  return (
    <GlobalErrorBoundary>
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS !== 'web'}
    >
      {screenPhase === 'running' && activeDay ? (
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="never" onScrollBeginDrag={Keyboard.dismiss}>
          {/* Compact header — the branded LEAP PROGRAM header only makes
              sense for the top-level day list, not while running a session. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: Platform.OS === 'ios' ? 54 : 20, paddingBottom: 16 }}>
            <TouchableOpacity onPress={() => setScreenPhase('list')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={theme.text.primary} />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18, letterSpacing: 1, color: theme.text.primary, flexShrink: 1 }} numberOfLines={1}>
              {activeDay.name.toUpperCase()}
            </Text>
          </View>
          {/* BLOCKS / WORKOUTS LIST — unchanged from before this screen had
              phases, just no longer glued directly under the day carousel. */}
          <View style={{ gap: 16, paddingBottom: 100 }}>
            {(activeDay.blocks || []).map((block: ProgramBlock, index: number) => {
              // Blocks are no longer gated behind completing the previous
              // one in order — a warrior can log any block whenever they
              // want. handleWorkoutDonePress below nudges them to log any
              // still-unaddressed blocks before finishing instead.
              const isLocked = false;
              return (
                <WarriorBlockCard
                  key={block.id}
                  block={block}
                  isExpanded={!!expandedBlocks[block.id]}
                  theme={theme}
                  mode={mode as "light" | "dark"}
                  solidCardBg={solidCardBg}
                  bronzeGold={bronzeGold}
                  strengthTier={strengthTier}
                  toggleBlockExpanded={toggleBlockExpanded}
                  handleToggleBlockStatus={handleToggleBlockStatus}
                  isTogglingStatus={!!togglingBlockIds[block.id]}
                  handleOpenLogging={handleOpenLogModal}
                  startTimerForBlock={startTimerForBlock}
                  activeVideoExerciseId={activeVideoExerciseId}
                  onToggleVideo={handleToggleVideo}
                  isLocked={isLocked}
                  loggedSetsByExercise={blockSetProgress[block.id]}
                  onSetLogged={handleSetLogged}
                  onLadderFinalize={handleLadderFinalize}
                  onAmrapFinalize={handleAmrapFinalize}
                  onForTimeFinalize={handleForTimeFinalize}
                />
              );
            })}

            {blocksTotalCount > 0 && (
              <WorkoutProgressButton
                theme={theme}
                blocksCompleted={blocksCompletedCount}
                blocksTotal={blocksTotalCount}
                isAddressed={isWorkoutAddressed}
                onPress={handleWorkoutDonePress}
              />
            )}
          </View>
        </ScrollView>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="never" onScrollBeginDrag={Keyboard.dismiss}>
        {/* HEADER BAR */}
        <View style={[styles.header, { borderBottomWidth: 0, paddingTop: Platform.OS === 'ios' ? 54 : 20, paddingBottom: 10, marginBottom: 0, justifyContent: 'center', alignItems: 'center', position: 'relative' }]}>
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', left: 0, padding: 1.2, borderRadius: 20 }}
          >
            <TouchableOpacity
              style={[styles.closeButton, { borderWidth: 0, backgroundColor: theme.card.background, paddingVertical: 4, paddingHorizontal: 12 }]}
              onPress={handleClose}
            >
              <Text style={[styles.closeButtonText, { color: theme.text.primary, fontSize: 10 }]}>CLOSE</Text>
            </TouchableOpacity>
          </LinearGradient>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 30, letterSpacing: 8, color: theme.text.primary, paddingLeft: 8 }}>
              L E Ʌ P
            </Text>
            <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 5, color: '#C8A040', marginTop: 2, paddingLeft: 5 }}>
              P R O G R A M
            </Text>
          </View>
        </View>
        <LinearGradient
          colors={['#7E57C2', '#FF5252', '#FF7043']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 1.5, width: '100%', marginBottom: 20 }}
        />

        {loading ? (
          <View style={styles.centerContainer}>
            <LeapLogo size={40} animated />
            <Text style={[styles.loadingText, { color: theme.text.secondary }]}>FETCHING ASSIGNED WORKOUTS...</Text>
          </View>
        ) : (
          <View style={{ width: '100%', gap: 20 }}>
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {!templateId ? (
              <View style={[styles.emptyContainer, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                <Text style={[styles.emptyTitle, { color: theme.text.primary }]}>NO PROGRAM ASSIGNED YET</Text>
                <Text style={[styles.emptySubtitle, { color: theme.text.secondary }]}>
                  ASK YOUR COACH TO ASSIGN A CUSTOM PROGRAM, OR START ONE FROM OUR TEMPLATE LIBRARY.
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 16, backgroundColor: bronzeGold, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' }}
                  onPress={() => router.push('/template-recommendations')}
                >
                  <Text style={{ color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>
                    BROWSE WORKOUT PROGRAMS
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 20 }}>
                {/* PROGRAM INTRO CARD */}
                <ProgramHeaderCard
                  programName={programName}
                  coachName={coachName}
                  theme={theme}
                  solidCardBg={solidCardBg}
                />
                <SwitchWorkoutButton
                  theme={theme}
                  onPress={() => router.push('/template-recommendations')}
                />

                {/* CIRCLES DASHBOARD */}
                <PointsDashboard
                  staticPoints={staticPoints}
                  powerPoints={powerPoints}
                  oneMmPoints={oneMmPoints}
                />
                {/* WEEK NAVIGATOR */}
                <WeekNavigator
                  weeksData={weeksData}
                  activeWeek={activeWeek}
                  onSelectWeek={(wNum) => {
                    setActiveWeek(wNum);
                    setActiveDayIndex(0);
                    setScreenPhase('list');
                  }}
                  theme={theme}
                />
                {/* WEEKLY BODYWEIGHT — optional, once per week, tap to log or change it */}
                <TouchableOpacity
                  onPress={() => setShowBodyweightCheckIn(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    alignSelf: 'center',
                    borderWidth: 1,
                    borderRadius: 20,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderColor: bodyweightThisWeek !== null ? bronzeGold : theme.card.border,
                    backgroundColor: bodyweightThisWeek !== null ? 'rgba(200,160,64,0.08)' : 'transparent',
                  }}
                >
                  <Text style={{
                    fontFamily: 'BarlowCondensed-Bold',
                    fontSize: 11,
                    letterSpacing: 0.5,
                    color: bodyweightThisWeek !== null ? bronzeGold : theme.text.secondary,
                  }}>
                    {bodyweightThisWeek !== null ? `BODYWEIGHT: ${bodyweightThisWeek}KG` : '+ LOG BODYWEIGHT (OPTIONAL)'}
                  </Text>
                  {bodyweightThisWeek !== null && (
                    <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.tertiary }}>
                      EDIT
                    </Text>
                  )}
                </TouchableOpacity>
                {/* DAY LIST — every day tappable in any order, showing real
                    logging progress (clean/in-progress %/done) instead of a
                    locked sequence. Tapping a card jumps straight into that
                    day's exercise-logging UI — no interstitial screen. */}
                <DayCardList
                  days={days}
                  onStartDay={(dayIndex) => {
                    setActiveDayIndex(dayIndex);
                    setScreenPhase('running');
                  }}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>
      )}

      {/* WEEKLY BODYWEIGHT CHECK-IN */}
      <BodyweightCheckInModal
        visible={showBodyweightCheckIn}
        theme={theme}
        bronzeGold={bronzeGold}
        onSubmit={handleSubmitBodyweight}
        onSkip={() => setShowBodyweightCheckIn(false)}
        loading={bodyweightSaving}
        currentValue={bodyweightThisWeek}
      />

      {/* SESSION COMPLETE / WORKOUT STATS */}
      <SessionCompleteScreen
        visible={showSessionComplete}
        theme={theme}
        bronzeGold={bronzeGold}
        programName={programName}
        dayName={days[activeDayIndex]?.name || ''}
        blocksCompleted={blocksCompletedCount}
        blocksTotal={blocksTotalCount}
        isAddressed={isWorkoutAddressed}
        exercisesDone={exercisesDoneCount}
        totalReps={sessionTotalReps}
        bodyweightKg={bodyweightThisWeek}
        sessionSeconds={Math.floor((Date.now() - sessionStartRef.current) / 1000)}
        onClose={() => setShowSessionComplete(false)}
      />

      {/* LOG DETAILS MODAL */}
      <WarriorLogModal
        logModalVisible={logModalVisible}
        setLogModalVisible={setLogModalVisible}
        theme={theme}
        bronzeGold={bronzeGold}
        logStatus={logStatus}
        setLogStatus={setLogStatus}
        days={days}
        activeLogBlockId={activeLogBlockId}
        logAmrapRounds={logAmrapRounds}
        setLogAmrapRounds={setLogAmrapRounds}
        logForTimeDuration={logForTimeDuration}
        setLogForTimeDuration={setLogForTimeDuration}
        logWeightUsed={logWeightUsed}
        setLogWeightUsed={setLogWeightUsed}
        logLadderProgress={logLadderProgress}
        setLogLadderProgress={setLogLadderProgress}
        logRating={logRating}
        setLogRating={setLogRating}
        logNotes={logNotes}
        setLogNotes={setLogNotes}
        handleLogWorkout={handleLogWorkout}
        logLoading={logLoading}
        logFeel={logFeel}
        setLogFeel={setLogFeel}
        logRpe={logRpe}
        setLogRpe={setLogRpe}
        logMissedReason={logMissedReason}
        setLogMissedReason={setLogMissedReason}
        logMissedDetail={logMissedDetail}
        setLogMissedDetail={setLogMissedDetail}
      />

      {/* VISUAL TIMER MODAL */}
      {activeTimerBlock && (
        <WarriorTimerModal
          activeBlock={activeTimerBlock}
          theme={theme}
          bronzeGold={bronzeGold}
          onClose={() => setActiveTimerBlock(null)}
          onAmrapComplete={(blockId, roundsCompleted) => {
            setActiveTimerBlock(null);
            setActiveLogBlockId(blockId);
            setLogStatus('completed');
            setLogNotes('');
            setLogRating(5);
            setLogFeel(null);
            setLogRpe(null);
            setLogMissedReason(null);
            setLogMissedDetail('');
            setLogAmrapRounds(String(roundsCompleted));
            setLogModalVisible(true);
          }}
          onForTimeComplete={(blockId, elapsedSeconds) => {
            setActiveTimerBlock(null);
            setActiveLogBlockId(blockId);
            setLogStatus('completed');
            setLogNotes('');
            setLogRating(5);
            setLogFeel(null);
            setLogRpe(null);
            setLogMissedReason(null);
            setLogMissedDetail('');
            setLogForTimeDuration(formatTimerString(elapsedSeconds));
            setLogModalVisible(true);
          }}
          onBlockComplete={(blockId, roundsCompleted, tabataHoldTimes) => {
            setActiveTimerBlock(null);
            setActiveLogBlockId(blockId);
            setLogStatus('completed');
            setLogNotes('');
            setLogRating(5);
            setLogFeel(null);
            setLogRpe(null);
            setLogMissedReason(null);
            setLogMissedDetail('');
            setLogAmrapRounds(roundsCompleted !== undefined ? String(roundsCompleted) : '');
            setPendingHoldTimes(tabataHoldTimes || []);
            setLogModalVisible(true);
          }}
        />
      )}

    </KeyboardAvoidingView>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    marginBottom: 20,
  },
  closeButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C8A040',
    backgroundColor: 'rgba(200, 160, 64, 0.08)',
  },
  closeButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#C8A040',
  },
  centerContainer: {
    paddingVertical: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    padding: 12,
    borderRadius: 6,
  },
  errorText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    marginTop: 40,
  },
  emptyTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 1,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  completedBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  completedBadgeText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
    color: '#4CAF50',
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
});
