import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';


interface ExerciseDetail {
  id: string | number;
  name: string;
  youtube_url: string;
  sets: string | number;
  reps: string;
  rest_seconds: string | number;
  notes: string;
}

interface ProgramBlock {
  id: string | number;
  name: string;
  notes: string;
  exercises: ExerciseDetail[];
  completedStatus: 'completed' | 'missed' | 'none';
  type?: 'single' | 'superset' | 'circuit' | 'amrap' | 'fortime';
  rounds?: string;
  rest_after_round?: string;
  timer_seconds?: string;
}

interface ProgramDay {
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

  const [days, setDays] = useState<ProgramDay[]>([]);
  const [activeDayIndex, setActiveDayIndex] = useState<number>(0);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string | number, boolean>>({});

  // Log Form State
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [activeLogBlockId, setActiveLogBlockId] = useState<string | number | null>(null);
  const [logNotes, setLogNotes] = useState('');
  const [logRating, setLogRating] = useState<number>(5);
  const [logLoading, setLogLoading] = useState(false);
  const [logStatus, setLogStatus] = useState<'completed' | 'missed'>('completed');

  // Active Timer State
  const [activeTimerBlockId, setActiveTimerBlockId] = useState<string | number | null>(null);
  const [timerType, setTimerType] = useState<'amrap' | 'fortime' | 'rest' | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerModalVisible, setTimerModalVisible] = useState<boolean>(false);

  // Video Preview Modal State removed (now opens natively)

  // Performance Points States
  const [staticPoints, setStaticPoints] = useState<number>(0);
  const [powerPoints, setPowerPoints] = useState<number>(0);
  const [oneMmPoints, setOneMmPoints] = useState<number>(0);

  useEffect(() => {
    loadWarriorProgram();
  }, [warriorId]);

  // Main loader for assigned program and completion state
  async function loadWarriorProgram() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 0. Fetch warrior points stats
      const { data: profilePoints } = await supabase
        .from('profiles')
        .select('statics_tier, power_points, one_mm_points')
        .eq('id', warriorId)
        .maybeSingle();

      if (profilePoints) {
        setStaticPoints(profilePoints.statics_tier || 0);
        setPowerPoints(profilePoints.power_points || 0);
        setOneMmPoints(profilePoints.one_mm_points || 0);
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
        setDays([]);
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
        .select('id, name, notes, order_index')
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

      // 4. Fetch all block exercises in parallel/sequence
      const dayMap: Record<string, ProgramDay> = {};
      const dayOrder: string[] = [];

      for (const block of blocksData || []) {
        const { data: exercisesData, error: exercisesError } = await supabase
          .from('block_exercises')
          .select(`
            id,
            exercise_id,
            sets,
            reps,
            rest_seconds,
            notes,
            exercise_library (
              name,
              youtube_url
            )
          `)
          .eq('block_id', block.id)
          .order('order_index', { ascending: true });

        if (exercisesError) throw exercisesError;

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
            notes: ex.notes || ''
          };
        });

        // Parse concept metadata
        let plainNotes = block.notes || '';
        let blockType: 'single' | 'superset' | 'circuit' | 'amrap' | 'fortime' = 'single';
        let rounds = '4';
        let restAfterRound = '90';
        let timerSeconds = '10';

        const conceptMatch = plainNotes.match(/^\[CONCEPT:(.*?)\](.*)$/s);
        if (conceptMatch) {
          try {
            const metadata = JSON.parse(conceptMatch[1]);
            blockType = metadata.type || 'single';
            rounds = String(metadata.rounds ?? '4');
            restAfterRound = String(metadata.rest_after_round ?? '90');
            timerSeconds = String(metadata.timer_seconds ?? '10');
            plainNotes = conceptMatch[2];
          } catch (e) {
            console.error('Failed to parse block concept metadata:', e);
          }
        }

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

        const mappedBlock: ProgramBlock = {
          id: block.id,
          name: blockName,
          notes: plainNotes,
          exercises: mappedExercises,
          completedStatus,
          type: blockType,
          rounds,
          rest_after_round: restAfterRound,
          timer_seconds: timerSeconds
        };

        const dayKey = dayName.toUpperCase();
        if (!dayMap[dayKey]) {
          dayMap[dayKey] = {
            name: dayName,
            blocks: []
          };
          dayOrder.push(dayKey);
        }
        dayMap[dayKey].blocks.push(mappedBlock);
      }

      const loadedDays = dayOrder.map(k => dayMap[k]);
      setDays(loadedDays);
      setActiveDayIndex(0);
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD ACTIVE PROGRAM.');
    } finally {
      setLoading(false);
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

      await loadWarriorProgram();
    } catch (err: any) {
      console.error("Failed to toggle block status:", err);
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

      const { error } = await supabase
        .from('workout_logs')
        .insert({
          warrior_program_id: warriorProgramId,
          warrior_id: warriorId,
          block_id: activeLogBlockId,
          notes: finalNotes,
          rating: logRating
        });

      if (error) throw error;

      setLogModalVisible(false);
      await loadWarriorProgram();
    } catch (err: any) {
      Alert.alert('ERROR', err.message?.toUpperCase() || 'FAILED TO LOG WORKOUT.');
    } finally {
      setLogLoading(false);
    }
  };

  // Dynamic Block Timer Utilities & Tick Effect
  useEffect(() => {
    let interval: any = null;
    if (timerRunning) {
      interval = setInterval(() => {
        if (timerType === 'amrap' || timerType === 'rest') {
          setTimeLeft(prev => {
            if (prev <= 1) {
              setTimerRunning(false);
              clearInterval(interval);

              if (timerType === 'amrap') {
                handleTimerCompletion(activeTimerBlockId);
              } else {
                Alert.alert("TIME'S UP!", "REST TIME OVER! GET READY FOR YOUR NEXT ROUND.");
              }
              return 0;
            }
            return prev - 1;
          });
        } else if (timerType === 'fortime') {
          setElapsedTime(prev => prev + 1);
        }
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerType, activeTimerBlockId]);

  const handleTimerCompletion = (blockId: string | number | null) => {
    if (!blockId) return;
    setTimerModalVisible(false);

    Alert.alert(
      "AMRAP WORKOUT COMPLETED!",
      "Choose how you would like to log this AMRAP block:",
      [
        {
          text: "MARK AS COMPLETED",
          onPress: () => promptOptionalLogging(blockId, 'completed')
        },
        {
          text: "MARK AS MISSED / SKIPPED",
          onPress: () => promptOptionalLogging(blockId, 'missed'),
          style: 'destructive'
        }
      ],
      { cancelable: false }
    );
  };

  const promptOptionalLogging = (blockId: string | number, status: 'completed' | 'missed') => {
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
      const finalNotes = status === 'missed' ? '[STATUS:MISSED]' : '';
      const { error } = await supabase
        .from('workout_logs')
        .insert({
          warrior_program_id: warriorProgramId,
          warrior_id: warriorId,
          block_id: blockId,
          notes: finalNotes,
          rating: 5
        });

      if (error) throw error;
      await loadWarriorProgram();
    } catch (err: any) {
      Alert.alert('ERROR', err.message?.toUpperCase() || 'FAILED TO LOG WORKOUT.');
    } finally {
      setLogLoading(false);
    }
  };

  const startTimerForBlock = (block: ProgramBlock) => {
    setActiveTimerBlockId(block.id);
    if (block.type === 'amrap') {
      setTimerType('amrap');
      const min = parseInt(block.timer_seconds || '10', 10);
      setTimeLeft(min * 60);
      setTimerRunning(true);
      setTimerModalVisible(true);
    } else if (block.type === 'fortime') {
      setTimerType('fortime');
      setElapsedTime(0);
      setTimerRunning(true);
      setTimerModalVisible(true);
    } else if (block.type === 'superset' || block.type === 'circuit') {
      setTimerType('rest');
      const restSec = parseInt(block.rest_after_round || '90', 10);
      setTimeLeft(restSec);
      setTimerRunning(true);
      setTimerModalVisible(true);
    }
  };

  const formatTimerString = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
              onPress={onClose}
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
                        onPress={() => setActiveDayIndex(prev => prev - 1)}
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
                        onPress={() => setActiveDayIndex(prev => prev + 1)}
                        style={{ paddingHorizontal: 16, paddingVertical: 8 }}
                      >
                        <Text style={{ color: activeDayIndex === days.length - 1 ? theme.text.tertiary : '#FF7043', fontSize: 18, fontFamily: 'BarlowCondensed-Bold' }}>►</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                )}

                {/* BLOCKS / WORKOUTS LIST */}
                <View style={{ gap: 16 }}>
                  {days.length > 0 && (days[activeDayIndex]?.blocks || []).map((block: ProgramBlock) => {
                    const isExpanded = !!expandedBlocks[block.id];
                    const isMissed = block.completedStatus === 'missed';
                    return (
                      <LinearGradient
                        key={block.id}
                        colors={['#7E57C2', '#FF5252', '#FF7043']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ padding: 1.2, borderRadius: 12, opacity: isMissed ? 0.75 : 1 }}
                      >
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
                                  {(block.type === 'amrap' || block.type === 'fortime')
                                    ? `${block.type.toUpperCase()} (${block.timer_seconds} MIN)`
                                    : (block.type?.toUpperCase() || 'SINGLE')
                                  } • {block.exercises.map(ex => ex.name.toUpperCase()).join(', ') || 'NO EXERCISES'}
                                </Text>
                              )}
                            </View>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 }}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleToggleBlockStatus(block.id, block.completedStatus);
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

                          {/* Collapsible Content */}
                          {isExpanded && (
                            <View style={{ marginTop: 12 }}>
                              {/* Block Description Notes */}
                              {block.notes ? (
                                <Text style={[styles.blockNotes, { color: theme.text.secondary, marginTop: 0 }]}>
                                  {block.notes}
                                </Text>
                              ) : null}

                              {/* Exercises Details */}
                              <View style={{ gap: 12, marginTop: 12 }}>
                                {block.exercises.map((ex: ExerciseDetail) => (
                                  <View
                                    key={ex.id}
                                    style={[styles.exerciseRow, { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: theme.card.border }]}
                                  >
                                    <View style={styles.exInfoRow}>
                                      <Text style={[styles.exTitle, { color: theme.text.primary }]}>
                                        {ex.name.toUpperCase()}
                                      </Text>

                                      {ex.youtube_url ? (
                                        <LinearGradient
                                          colors={['#7E57C2', '#FF5252', '#FF7043']}
                                          start={{ x: 0, y: 0 }}
                                          end={{ x: 1, y: 0 }}
                                          style={{ borderRadius: 12, padding: 1.2 }}
                                        >
                                          <TouchableOpacity
                                            onPress={() => handleOpenVideo(ex.youtube_url)}
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
                                      {(!block.type || block.type === 'single') ? (
                                        <>
                                          <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
                                            <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>SETS</Text>
                                            <Text style={[styles.detailValue, { color: theme.text.primary }]}>{ex.sets}</Text>
                                          </View>
                                          <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
                                            <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REPS</Text>
                                            <Text style={[styles.detailValue, { color: theme.text.primary }]}>{ex.reps}</Text>
                                          </View>
                                          <View style={[styles.detailBadge, { borderColor: theme.card.border }]}>
                                            <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>REST</Text>
                                            <Text style={[styles.detailValue, { color: theme.text.primary }]}>{ex.rest_seconds}S</Text>
                                          </View>
                                        </>
                                      ) : (
                                        <View style={[styles.detailBadge, { borderColor: theme.card.border, flex: 1, alignItems: 'flex-start' }]}>
                                          <Text style={[styles.detailLabel, { color: theme.text.tertiary }]}>TARGET REPS / WORK DETAILS</Text>
                                          <Text style={[styles.detailValue, { color: theme.text.primary, fontSize: 13, marginTop: 2 }]}>{ex.reps || 'AS ASSIGNED'}</Text>
                                        </View>
                                      )}
                                    </View>

                                    {ex.notes ? (
                                      <Text style={[styles.exNotes, { color: theme.text.secondary }]}>
                                        NOTE: {ex.notes}
                                      </Text>
                                    ) : null}
                                  </View>
                                ))}
                              </View>

                              {/* Block Action Buttons Row */}
                              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                                {block.type && block.type !== 'single' && (
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
                                        START TIMER ({block.type === 'amrap' ? `${block.timer_seconds} MIN` : block.type === 'fortime' ? 'FOR TIME' : 'REST'})
                                      </Text>
                                    </TouchableOpacity>
                                  </LinearGradient>
                                )}

                                <LinearGradient
                                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={{ flex: 1, padding: block.completedStatus !== 'none' ? 1.2 : 0, borderRadius: 6 }}
                                >
                                  <TouchableOpacity
                                    style={{
                                      flex: 1,
                                      borderRadius: block.completedStatus !== 'none' ? 5 : 6,
                                      paddingVertical: 12,
                                      alignItems: 'center',
                                      backgroundColor: block.completedStatus !== 'none' ? solidCardBg : 'transparent'
                                    }}
                                    onPress={() => handleOpenLogModal(block.id)}
                                  >
                                    <Text style={{ color: block.completedStatus !== 'none' ? theme.text.primary : '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5 }}>
                                      {block.completedStatus !== 'none' ? 'EDIT BLOCK LOG' : 'LOG WORKOUT BLOCK'}
                                    </Text>
                                  </TouchableOpacity>
                                </LinearGradient>
                              </View>
                            </View>
                          )}
                        </View>
                      </LinearGradient>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* LOG DETAILS MODAL */}
      <Modal
        visible={logModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLogModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>LOG WORKOUT DETAILS</Text>

            {/* Done vs. Missed Selection */}
            <View style={{ marginBottom: 20, width: '100%', gap: 8 }}>
              <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>WORKOUT STATUS</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: logStatus === 'completed' ? '#4CAF50' : 'rgba(255,255,255,0.05)',
                    backgroundColor: logStatus === 'completed' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(0,0,0,0.2)',
                    alignItems: 'center'
                  }}
                  onPress={() => setLogStatus('completed')}
                >
                  <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: logStatus === 'completed' ? '#4CAF50' : theme.text.secondary }}>COMPLETED</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: logStatus === 'missed' ? '#FF6B6B' : 'rgba(255,255,255,0.05)',
                    backgroundColor: logStatus === 'missed' ? 'rgba(255, 107, 107, 0.12)' : 'rgba(0,0,0,0.2)',
                    alignItems: 'center'
                  }}
                  onPress={() => setLogStatus('missed')}
                >
                  <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: logStatus === 'missed' ? '#FF6B6B' : theme.text.secondary }}>SKIPPED / MISSED</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Performance rating */}
            <View style={styles.ratingSection}>
              <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>RATE INTENSITY / PERFORMANCE</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((ratingVal) => (
                  <TouchableOpacity
                    key={ratingVal}
                    style={styles.starBtn}
                    onPress={() => setLogRating(ratingVal)}
                  >
                    <Text style={[styles.starChar, { color: ratingVal <= logRating ? bronzeGold : 'rgba(255,255,255,0.1)' }]}>
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Performance notes */}
            <View style={styles.notesSection}>
              <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>WORKOUT PERFORMANCE NOTES</Text>
              <TextInput
                style={[styles.notesInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                placeholder="How did it feel? Any highlights or modifications..."
                placeholderTextColor="rgba(255,255,255,0.15)"
                value={logNotes}
                onChangeText={(val: string) => setLogNotes(val)}
                multiline={true}
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { borderColor: theme.card.border }]}
                onPress={() => setLogModalVisible(false)}
              >
                <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>CANCEL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: bronzeGold }]}
                onPress={handleLogWorkout}
                disabled={logLoading}
              >
                {logLoading ? (
                  <LeapLogo size={40} animated />
                ) : (
                  <Text style={{ color: '#000000', fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>LOG WORKOUT</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* VISUAL TIMER MODAL */}
      <Modal
        visible={timerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setTimerRunning(false);
          setTimerModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold, maxWidth: 420, alignItems: 'center' }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>
              {timerType === 'amrap' ? 'AMRAP COUNTDOWN' : timerType === 'fortime' ? 'FOR TIME STOPWATCH' : 'REST INTERVAL'}
            </Text>

            {/* Timer visual circle */}
            <View style={{
              width: 160,
              height: 160,
              borderRadius: 80,
              borderWidth: 6,
              borderColor: bronzeGold,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.3)',
              marginVertical: 20
            }}>
              <Text style={{
                color: theme.text.primary,
                fontSize: 36,
                fontFamily: 'BarlowCondensed-ExtraBold',
                letterSpacing: 1
              }}>
                {timerType === 'amrap' || timerType === 'rest'
                  ? formatTimerString(timeLeft)
                  : formatTimerString(elapsedTime)}
              </Text>
              <Text style={{ color: theme.text.secondary, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', marginTop: 4 }}>
                {timerRunning ? 'ACTIVE' : 'PAUSED'}
              </Text>
            </View>

            {/* Controls */}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  borderRadius: 6,
                  paddingVertical: 12,
                  alignItems: 'center',
                  backgroundColor: timerRunning ? 'rgba(230,70,70,0.15)' : 'rgba(76,175,80,0.15)',
                  borderWidth: 1,
                  borderColor: timerRunning ? '#FF6B6B' : '#4CAF50'
                }}
                onPress={() => setTimerRunning(!timerRunning)}
              >
                <Text style={{
                  color: timerRunning ? '#FF6B6B' : '#4CAF50',
                  fontFamily: 'BarlowCondensed-Bold',
                  fontSize: 12
                }}>{timerRunning ? 'PAUSE' : 'RESUME'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  borderRadius: 6,
                  paddingVertical: 12,
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderWidth: 1,
                  borderColor: theme.card.border
                }}
                onPress={() => {
                  setTimerRunning(false);
                  setTimerModalVisible(false);
                }}
              >
                <Text style={{
                  color: theme.text.secondary,
                  fontFamily: 'BarlowCondensed-Bold',
                  fontSize: 12
                }}>{timerType === 'fortime' ? 'COMPLETE' : 'CLOSE'}</Text>
              </TouchableOpacity>
            </View>

            {/* Exercises reference inside the timer */}
            <ScrollView style={{ width: '100%', maxHeight: 150 }} showsVerticalScrollIndicator={false}>
              {(() => {
                const activeBlock = days.flatMap(d => d.blocks).find(b => b.id === activeTimerBlockId);
                if (!activeBlock) return null;
                return (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 0.5, textAlign: 'center' }}>
                      BLOCK: {activeBlock.name.toUpperCase()}
                    </Text>
                    {activeBlock.exercises.map((ex, idx) => (
                      <View key={ex.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                        <Text style={{ color: theme.text.primary, fontSize: 12, fontFamily: 'BarlowCondensed-Bold' }}>
                          {idx + 1}. {ex.name}
                        </Text>
                        <Text style={{ color: theme.text.secondary, fontSize: 11 }}>
                          {ex.reps}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
