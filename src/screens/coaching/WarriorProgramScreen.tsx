import { useRouter, useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Linking,
  KeyboardAvoidingView,
  Alert } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';
import { BlockConceptParser, ConceptMetadata } from '../../lib/BlockConceptParser';
import { SoundServiceInstance } from '../../lib/SoundService';
import { AssessmentEngine, AssessmentRecommendation } from '../../lib/AssessmentEngine';
import { OneMMService } from '../../services/OneMMService';
import { PowerService } from '../../services/PowerService';
import { StaticService } from '../../services/StaticService';
import { WarriorExerciseRow } from '../../components/coaching/WarriorExerciseRow';
import { WarriorBlockCard } from '../../components/coaching/WarriorBlockCard';
import { WarriorLogModal } from '../../components/coaching/WarriorLogModal';
import { useWarriorTimer } from '../../hooks/useWarriorTimer';
import { WarriorTimerModal } from '../../components/coaching/WarriorTimerModal';
import { ProgramHeaderCard, PointsDashboard, WeekNavigator, DayProgressBar, DayCarousel, AssessmentBanner } from '../../components/coaching/WarriorProgramSections';
import { GlobalErrorBoundary } from '../../components/GlobalErrorBoundary';


export interface ExerciseDetail {
  id: string | number;
  name: string;
  youtube_url: string;
  sets: string | number;
  reps: string;
  rest_seconds: string | number;
  hold_seconds?: string | number;
  notes: string;
}

export interface ProgramBlock {
  id: string | number;
  name: string;
  notes: string;
  exercises: ExerciseDetail[];
  completedStatus: 'completed' | 'missed' | 'none';
  metadata?: ConceptMetadata;
  week_number?: number;
}

export interface ProgramDay {
  name: string;
  blocks: ProgramBlock[];
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
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string | number, boolean>>({});

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

  // Active Timer State (Extracted to Hook)
  const {
    activeTimerBlockId,
    timerType,
    timeLeft,
    timerRunning,
    setTimerRunning,
    elapsedTime,
    timerModalVisible,
    setTimerModalVisible,
    timerPrepCountdown,
    startTimerForBlock,
    formatTimerString,
    currentRound,
    totalRounds,
    handleStartRest,
    restSeconds,
    tabataPhase,
    tabataWorkSecs,
    tabataRestSecs
  } = useWarriorTimer({ 
    onAmrapComplete: (blockId) => {
      if (!blockId) return;
      setTimerModalVisible(false);
      setActiveLogBlockId(blockId);
      setLogStatus('completed');
      setLogNotes('');
      setLogRating(5);
      setLogAmrapRounds('');
      setLogModalVisible(true);
    }
  });

  // Video Preview Modal State removed (now opens natively)

  // Performance Points States
  const [staticPoints, setStaticPoints] = useState<number>(0);
  const [powerPoints, setPowerPoints] = useState<number>(0);
  const [oneMmPoints, setOneMmPoints] = useState<number>(0);
  const [strengthTier, setStrengthTier] = useState<number>(0);

  // Recommendations State
  const [recommendations, setRecommendations] = useState<AssessmentRecommendation[]>([]);
  
  const notificationIdRef = useRef<string | null>(null);

  // Background Notification Guard
  useEffect(() => {
    if (timerRunning && (timerType === 'amrap' || timerType === 'rest') && timeLeft > 0) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Time's up!",
          body: "Your timer has finished. Get back to work!",
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: timeLeft
        }
      }).then(id => notificationIdRef.current = id).catch(err => console.error('Notification Schedule Error:', err));
    } else {
      if (notificationIdRef.current) {
        Notifications.cancelScheduledNotificationAsync(notificationIdRef.current).catch(() => {});
        notificationIdRef.current = null;
      }
    }
  }, [timerRunning]);

  useEffect(() => {
    loadWarriorProgram();
  }, [warriorId]);

  const handleClose = () => {
    if (timerRunning) {
      Alert.alert(
        'ACTIVE TIMER',
        'You have an active timer running. Leaving this screen will reset it. Are you sure you want to leave?',
        [
          { text: 'STAY', style: 'cancel', onPress: () => {} },
          {
            text: 'LEAVE',
            style: 'destructive',
            onPress: () => {
              setTimerRunning(false);
              if (onClose) onClose();
            },
          },
        ]
      );
    } else {
      if (onClose) onClose();
    }
  };


  // Main loader for assigned program and completion state
  async function loadWarriorProgram() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 0. Fetch warrior points stats
      const { data: profilePoints } = await supabase
        .from('profiles')
        .select('statics_tier, power_points, one_mm_points, strength_tier')
        .eq('id', warriorId)
        .maybeSingle();

      if (profilePoints) {
        setStaticPoints(profilePoints.statics_tier || 0);
        setPowerPoints(profilePoints.power_points || 0);
        setOneMmPoints(profilePoints.one_mm_points || 0);
        setStrengthTier(profilePoints.strength_tier || 0);
      }

      // 1. Fetch active warrior program
      const { data: assignment, error: assignmentError } = await supabase
        .from('warrior_programs')
        .select(`
          id,
          template_id,
          coach_id,
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
        .maybeSingle();

      if (assignmentError) throw assignmentError;

      const actualAssignment = Array.isArray(assignment) ? assignment[0] : assignment;

      if (!actualAssignment) {
        setProgramName('');
        setWeeksData({ 1: [] });
        setLoading(false);
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

      // 2. Fetch program blocks
      const { data: blocksData, error: blocksError } = await supabase
        .from('program_blocks')
        .select('id, name, notes, order_index, week_number')
        .eq('template_id', activeTemplateId)
        .order('order_index', { ascending: true });

      if (blocksError) throw blocksError;

      // 3. Fetch completion status today
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: loggedToday, error: loggedError } = await supabase
        .from('workout_logs')
        .select('block_id, notes')
        .eq('warrior_id', warriorId)
        .gte('completed_at', startOfToday.toISOString());

      if (loggedError) throw loggedError;

      const loggedBlockMap = new Map((loggedToday || []).map((l: any) => [l.block_id, l.notes || '']));

      // 4. FIX N+1: Batch Fetch all block exercises for all blocks
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

        let dayName = block.name || '';
        let blockName = 'Workout Routine';

        if (dayName.includes(' | ')) {
          const parts = dayName.split(' | ');
          dayName = parts[0].trim();
          blockName = parts.slice(1).join(' | ').trim();
        }

        const notesStr = loggedBlockMap.get(block.id) || '';
        const completedStatus = loggedBlockMap.has(block.id)
          ? (notesStr.startsWith('[STATUS:MISSED]') ? 'missed' : 'completed')
          : 'none';
          
        const weekNum = block.week_number || 1;

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
      
      const maxWeek = Math.max(...Object.keys(newWeeksMap).map(k => parseInt(k, 10)));
      setActiveWeek(maxWeek); // Default to the highest week for the athlete
      setActiveDayIndex(0);
      
      if (newWeeksMap[maxWeek] && newWeeksMap[maxWeek].length > 0) {
        generateRecsForDay(newWeeksMap[maxWeek][0], profilePoints?.strength_tier || 0, profilePoints?.one_mm_points || 0, profilePoints?.power_points || 0, profilePoints?.statics_tier || 0);
      }
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD ACTIVE PROGRAM.');
    } finally {
      setLoading(false);
    }
  }

  async function generateRecsForDay(day: ProgramDay, tier: number, oneMmPts: number, powerPts: number, staticPts: number) {
    if (!day) return;
    
    // Day's focus tag is stored on the blocks metadata (since program_days is virtual)
    let focusTag = 'NONE';
    for (const block of day.blocks) {
      if (block.metadata?.focus_tag) {
        focusTag = block.metadata.focus_tag;
        break;
      }
    }

    if (focusTag === 'NONE') {
      setRecommendations([]);
      return;
    }

    try {
      const [oneMmStats, powerStats, staticStats] = await Promise.all([
        OneMMService.getUserStats(warriorId as string),
        PowerService.getUserStats(warriorId as string),
        StaticService.getUserStats(warriorId as string)
      ]);

      const recs = AssessmentEngine.generateRecommendations(
        focusTag as any,
        tier,
        oneMmPts,
        powerPts,
        staticPts,
        oneMmStats.pbs,
        powerStats.pbs,
        staticStats.pbs
      );
      setRecommendations(recs);
    } catch (e) {
      console.error('Failed to generate recommendations:', e);
    }
  }

  const handleToggleBlockStatus = async (blockId: string | number, currentStatus: 'completed' | 'missed' | 'none') => {
    let nextStatus: 'completed' | 'missed' | 'none' = 'completed';
    if (currentStatus === 'completed') {
      nextStatus = 'missed';
    } else if (currentStatus === 'missed') {
      nextStatus = 'none';
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    try {
      // 1. Delete any workout logs today for this block
      await supabase
        .from('workout_logs')
        .delete()
        .eq('warrior_id', warriorId)
        .eq('block_id', blockId)
        .gte('completed_at', startOfToday.toISOString());

      // 2. Insert new log if not none
      if (nextStatus !== 'none') {
        const notes = nextStatus === 'missed' ? '[STATUS:MISSED]' : '';
        await supabase
          .from('workout_logs')
          .insert({
            warrior_program_id: warriorProgramId,
            warrior_id: warriorId,
            block_id: blockId,
            notes,
            rating: 5
          });
      }

      // Optimistically update the UI state
      const updateBlockInDays = (dayList: ProgramDay[]) => {
        return dayList.map(d => ({
          ...d,
          blocks: d.blocks.map(b => b.id === blockId ? { ...b, completedStatus: nextStatus } : b)
        }));
      };

      if (days && days.length > 0) {
        // NOTE: setDays is undefined in the original snippet, correcting to use setWeeksData pattern
      }
      
      setWeeksData(prev => {
        const next = { ...prev };
        if (next[activeWeek]) {
          next[activeWeek] = updateBlockInDays(next[activeWeek]);
        }
        return next;
      });

    } catch (err: any) {
      console.error("Failed to toggle block status:", err);
      // Revert on failure
      await loadWarriorProgram();
    }
  };

  // Open Log modal for specific block
  const handleOpenLogModal = (blockId: string | number) => {
    setActiveLogBlockId(blockId);
    setLogNotes('');
    setLogStatus('completed');
    setLogRating(5);
    setLogModalVisible(true);
  };

  // Insert workout log into workout_logs table
  const handleLogWorkout = async () => {
    if (!activeLogBlockId || !templateId) return;

    setLogLoading(true);
    try {
      let finalNotes = logStatus === 'missed' ? '[STATUS:MISSED] ' : '';
      if (logAmrapRounds) finalNotes += `[LOG] Completed: ${logAmrapRounds} Rounds/Reps\n`;
      if (logForTimeDuration) finalNotes += `[LOG] Finished in: ${logForTimeDuration}\n`;
      if (logLadderProgress) finalNotes += `[LOG] Ladder Progress: ${logLadderProgress}\n`;
      if (logWeightUsed) finalNotes += `[LOG] Weight Used: ${logWeightUsed} KG\n`;
      if (logNotes) finalNotes += logNotes;
      finalNotes = finalNotes.trim();

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network request timed out. Please check your connection.')), 10000)
      );

      const { error } = await Promise.race([
        supabase.from('workout_logs').insert({
          warrior_program_id: warriorProgramId,
          warrior_id: warriorId,
          block_id: activeLogBlockId,
          notes: finalNotes,
          rating: logRating
        }),
        timeoutPromise
      ]) as any;

      if (error) throw error;

      setLogModalVisible(false);
      
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



  const handleForTimeCompletion = (blockId: string | number | null, elapsedSeconds: number) => {
    if (!blockId) return;
    setTimerRunning(false);
    setTimerModalVisible(false);

    // Auto-open modal for FOR TIME to log time
    setActiveLogBlockId(blockId);
    setLogStatus('completed');
    setLogNotes('');
    setLogRating(5);
    setLogForTimeDuration(formatTimerString(elapsedSeconds));
    setLogModalVisible(true);
  };

  const promptOptionalLogging = (blockId: string | number, status: 'completed' | 'missed', isWeighted: boolean = false) => {
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
  };

  const quickLogWorkout = async (blockId: string | number, status: 'completed' | 'missed') => {
    if (!templateId) return;
    setLogLoading(true);
    try {
      let finalNotes = status === 'missed' ? '[STATUS:MISSED] ' : '';
      if (logAmrapRounds) finalNotes += `[LOG] Completed: ${logAmrapRounds} Rounds/Reps\n`;
      if (logForTimeDuration) finalNotes += `[LOG] Finished in: ${logForTimeDuration}\n`;
      if (logLadderProgress) finalNotes += `[LOG] Ladder Progress: ${logLadderProgress}\n`;
      if (logWeightUsed) finalNotes += `[LOG] Weight Used: ${logWeightUsed} KG\n`;
      if (logNotes) finalNotes += logNotes;

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network request timed out. Please check your connection.')), 10000)
      );

      const { error } = await Promise.race([
        supabase.from('workout_logs').insert({
          warrior_program_id: warriorProgramId,
          warrior_id: warriorId,
          block_id: blockId,
          notes: finalNotes.trim(),
          rating: logRating
        }),
        timeoutPromise
      ]) as any;

      if (error) throw error;
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

  const handleOpenVideo = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Could not open video. Please try again.');
      });
    }
  };

  return (
    <GlobalErrorBoundary>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background.primary }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
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
                  ASK YOUR COACH TO ASSIGN A CUSTOM PROGRAM TO GET STARTED.
                </Text>
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
                    if (weeksData[wNum]?.[0]) generateRecsForDay(weeksData[wNum][0], strengthTier, oneMmPoints, powerPoints, staticPoints);
                  }}
                  theme={theme}
                />
                {/* PROGRESS STATS BAR */}
                <DayProgressBar
                  blocks={days[activeDayIndex]?.blocks || []}
                  theme={theme}
                />
                {/* Carousel Day Navigator */}
                <DayCarousel
                  days={days}
                  activeDayIndex={activeDayIndex}
                  onPrev={() => {
                    const newIdx = activeDayIndex - 1;
                    setActiveDayIndex(newIdx);
                    generateRecsForDay(days[newIdx], strengthTier, oneMmPoints, powerPoints, staticPoints);
                  }}
                  onNext={() => {
                    const newIdx = activeDayIndex + 1;
                    setActiveDayIndex(newIdx);
                    generateRecsForDay(days[newIdx], strengthTier, oneMmPoints, powerPoints, staticPoints);
                  }}
                  theme={theme}
                  solidCardBg={solidCardBg}
                  mode={mode}
                />
                {/* SMART RECOMMENDATION BANNER */}
                <AssessmentBanner
                  recommendations={recommendations}
                  solidCardBg={solidCardBg}
                  theme={theme}
                />
                {/* BLOCKS / WORKOUTS LIST */}
                <View style={{ gap: 16, paddingBottom: 100 }}>
                  {days.length > 0 && (days[activeDayIndex]?.blocks || []).map((block: ProgramBlock) => {
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
                        handleOpenLogging={handleOpenLogModal}
                        startTimerForBlock={startTimerForBlock}
                        handleOpenVideo={handleOpenVideo}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

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
      />

      {/* VISUAL TIMER MODAL */}
      <WarriorTimerModal
        timerModalVisible={timerModalVisible}
        setTimerModalVisible={setTimerModalVisible}
        setTimerRunning={setTimerRunning}
        timerRunning={timerRunning}
        theme={theme}
        bronzeGold={bronzeGold}
        timerType={timerType}
        timerPrepCountdown={timerPrepCountdown}
        timeLeft={timeLeft}
        elapsedTime={elapsedTime}
        formatTimerString={formatTimerString}
        handleForTimeCompletion={handleForTimeCompletion}
        activeTimerBlockId={activeTimerBlockId}
        days={days}
        currentRound={currentRound}
        totalRounds={totalRounds}
        restSeconds={restSeconds}
        handleStartRest={handleStartRest}
        tabataPhase={tabataPhase}
        tabataWorkSecs={tabataWorkSecs}
        tabataRestSecs={tabataRestSecs}
        handleBlockComplete={(blockId) => {
          if (!blockId) return;
          setTimerModalVisible(false);
          setActiveLogBlockId(blockId);
          setLogStatus('completed');
          setLogNotes('');
          setLogRating(5);
          setLogAmrapRounds('');
          setLogModalVisible(true);
        }}
      />

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
