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
      }).then(id => notificationIdRef.current = id).catch(err => console.log('Notification Schedule Error:', err));
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
      const finalNotes = logStatus === 'missed'
        ? `[STATUS:MISSED] ${logNotes.trim()}`.trim()
        : logNotes.trim();

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
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ padding: 1.2, borderRadius: 12 }}
                >
                  <View style={[styles.introCard, { backgroundColor: solidCardBg, borderWidth: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 11 }]}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.programName, { color: theme.text.primary, fontSize: 15, fontFamily: 'BarlowCondensed-ExtraBold' }]} numberOfLines={1}>
                        {programName.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: theme.card.border, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 }}>
                      <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.secondary }}>
                        COACH: <Text style={{ color: bronzeGold }}>{coachName.toUpperCase()}</Text>
                      </Text>
                    </View>
                  </View>
                </LinearGradient>

                {/* CIRCLES DASHBOARD */}
                <View style={styles.dashboardContainer}>
                  <View style={styles.circleMetric}>
                    <View style={[styles.outerRing, { borderColor: '#7E57C2', shadowColor: '#7E57C2' }]}>
                      <Text style={[styles.pointsNumber, { color: '#7E57C2' }]}>{staticPoints}</Text>
                    </View>
                    <Text style={[styles.metricLabel, { color: '#7E57C2' }]}>STATIC PTS</Text>
                  </View>

                  <View style={styles.circleMetric}>
                    <View style={[styles.outerRing, { borderColor: '#FF5252', shadowColor: '#FF5252' }]}>
                      <Text style={[styles.pointsNumber, { color: '#FF5252' }]}>{powerPoints}</Text>
                    </View>
                    <Text style={[styles.metricLabel, { color: '#FF5252' }]}>POWER PTS</Text>
                  </View>

                  <View style={styles.circleMetric}>
                    <View style={[styles.outerRing, { borderColor: '#FF7043', shadowColor: '#FF7043' }]}>
                      <Text style={[styles.pointsNumber, { color: '#FF7043' }]}>{oneMmPoints}</Text>
                    </View>
                    <Text style={[styles.metricLabel, { color: '#FF7043' }]}>1MM PTS</Text>
                  </View>
                </View>

                {/* WEEK NAVIGATOR */}
                {Object.keys(weeksData).length > 1 && (
                  <View style={{ marginBottom: 16 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
                      {Object.keys(weeksData).map((weekStr) => {
                        const wNum = parseInt(weekStr, 10);
                        const isActive = wNum === activeWeek;
                        const weekBlocks = weeksData[wNum].flatMap(d => d.blocks);
                        const allCompleted = weekBlocks.length > 0 && weekBlocks.every(b => b.completedStatus === 'completed');

                        return (
                          <TouchableOpacity
                            key={wNum}
                            onPress={() => {
                              setActiveWeek(wNum);
                              setActiveDayIndex(0);
                              if (weeksData[wNum] && weeksData[wNum].length > 0) {
                                generateRecsForDay(weeksData[wNum][0], strengthTier, oneMmPoints, powerPoints, staticPoints);
                              }
                            }}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 20,
                              borderRadius: 20,
                              backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : theme.card.background,
                              borderWidth: 1,
                              borderColor: isActive ? bronzeGold : theme.card.border,
                            }}
                          >
                            <Text style={{
                              fontFamily: 'BarlowCondensed-Bold',
                              fontSize: 14,
                              color: isActive ? bronzeGold : theme.text.secondary
                            }}>
                              WEEK {wNum} {allCompleted ? '✓' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* PROGRESS STATS BAR */}
                {days.length > 0 && (() => {
                  const activeBlocks = days[activeDayIndex]?.blocks || [];
                  const totalBlocksToday = activeBlocks.length;
                  const completedBlocksToday = activeBlocks.filter(b => b.completedStatus === 'completed').length;
                  const progressPercent = totalBlocksToday > 0 ? Math.round((completedBlocksToday / totalBlocksToday) * 100) : 0;

                  return (
                    <View style={[styles.progressBarWrapper, { borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.01)' }]}>
                      <View style={styles.progressHeader}>
                        <Text style={[styles.progressLabel, { color: theme.text.secondary }]}>TODAY'S WORKOUT PROGRESS</Text>
                        <Text style={[styles.progressValue, { color: '#FF7043', fontFamily: 'BarlowCondensed-ExtraBold' }]}>{progressPercent}% <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold' }}>({completedBlocksToday}/{totalBlocksToday} BLOCKS)</Text></Text>
                      </View>
                      <View style={[styles.progressTrack, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                        {progressPercent > 0 && (
                          <LinearGradient
                            colors={['#7E57C2', '#FF5252', '#FF7043']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ width: `${progressPercent}%`, height: '100%', borderRadius: 3 }}
                          />
                        )}
                      </View>
                    </View>
                  );
                })()}

                {/* Carousel Day Navigator */}
                {days.length > 0 && (
                  <LinearGradient
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ padding: 1.2, borderRadius: 10, marginVertical: 4 }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: solidCardBg, padding: 12, borderRadius: 9 }}>
                      <TouchableOpacity
                        disabled={activeDayIndex === 0}
                        onPress={() => {
                          const newIdx = activeDayIndex - 1;
                          setActiveDayIndex(newIdx);
                          generateRecsForDay(days[newIdx], strengthTier, oneMmPoints, powerPoints, staticPoints);
                        }}
                        style={{ paddingHorizontal: 16, paddingVertical: 8 }}
                      >
                        <Text style={{ color: activeDayIndex === 0 ? theme.text.tertiary : (mode === 'dark' ? '#A78BFA' : '#7E57C2'), fontSize: 18, fontFamily: 'BarlowCondensed-Bold' }}>◄</Text>
                      </TouchableOpacity>

                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16, letterSpacing: 0.5 }}>
                          {(days[activeDayIndex]?.name || 'UNNAMED DAY').toUpperCase()}
                        </Text>
                        <Text style={{ color: theme.text.tertiary, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', marginTop: 2 }}>
                          DAY {activeDayIndex + 1} OF {days.length} • {days[activeDayIndex]?.blocks?.length || 0} BLOCKS
                        </Text>
                      </View>

                      <TouchableOpacity
                        disabled={activeDayIndex === days.length - 1}
                        onPress={() => {
                          const newIdx = activeDayIndex + 1;
                          setActiveDayIndex(newIdx);
                          generateRecsForDay(days[newIdx], strengthTier, oneMmPoints, powerPoints, staticPoints);
                        }}
                        style={{ paddingHorizontal: 16, paddingVertical: 8 }}
                      >
                        <Text style={{ color: activeDayIndex === days.length - 1 ? theme.text.tertiary : '#FF7043', fontSize: 18, fontFamily: 'BarlowCondensed-Bold' }}>►</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                )}

                {/* --- SMART RECOMMENDATION BANNER --- */}
                {recommendations.length > 0 && (
                  <View style={{ marginBottom: 24 }}>
                    <LinearGradient
                      colors={['rgba(200,160,64,0.15)', 'rgba(200,160,64,0.05)']}
                      style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: bronzeGold }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={{ fontSize: 18, marginRight: 8 }}>🧠</Text>
                        <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16, color: bronzeGold, letterSpacing: 1 }}>
                          ASSESSMENT ENGINE: {recommendations[0].world} PRIORITY
                        </Text>
                      </View>
                      
                      <Text style={{ color: theme.text.primary, fontSize: 13, fontFamily: 'BarlowCondensed-Bold', marginBottom: 12 }}>
                        {recommendations[0].priorityReason}
                      </Text>
                      
                      <View style={{ gap: 8 }}>
                        {recommendations.slice(0, 2).map((rec, idx) => (
                          <TouchableOpacity
                            key={rec.movementId}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: solidCardBg,
                              padding: 12,
                              borderRadius: 8,
                              borderWidth: rec.isPriority ? 1 : 0,
                              borderColor: bronzeGold
                            }}
                            onPress={() => {
                              if (rec.world === 'ENDURANCE') router.push('/one-min-max');
                              else if (rec.world === 'POWER') router.push('/power-world');
                              else router.push('/static-world');
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              {rec.isPriority && <Text style={{ fontSize: 12 }}>⭐</Text>}
                              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }}>
                                {rec.movementName.toUpperCase()}
                              </Text>
                            </View>
                            <Text style={{ color: theme.text.tertiary, fontSize: 11, fontFamily: 'BarlowCondensed-Medium', letterSpacing: 1 }}>
                              TEST NOW ▶
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </LinearGradient>
                  </View>
                )}

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
  headerTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 28,
    letterSpacing: 2,
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
  introCard: {
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
    shadowColor: '#C8A040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  introLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 6,
    color: '#C8A040',
  },
  programName: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 24,
    letterSpacing: 0.8,
  },
  coachName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: 4,
    opacity: 0.8,
  },
  sectionHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 1.5,
  },
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
  blockNotes: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
    opacity: 0.9,
  },
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
  ytIcon: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    borderWidth: 2,
    borderRadius: 8,
  },
  modalHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
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
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  starBtn: {
    padding: 4,
  },
  starChar: {
    fontSize: 32,
  },
  notesSection: {
    marginBottom: 24,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCloseBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSaveBtn: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  videoContentCard: {
    width: '100%',
    maxWidth: 640,
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 16,
    overflow: 'hidden',
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  videoHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 1,
  },
  videoCloseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 6,
  },
  dashboardContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
    gap: 12,
  },
  circleMetric: {
    flex: 1,
    alignItems: 'center',
  },
  outerRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#C8A040',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 6,
  },
  pointsNumber: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  metricLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  progressBarWrapper: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  progressValue: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
