import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  TextInput,
  Alert } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { LeapLogo } from '../../components/LeapLogo';
import { fetchWeekExportPayload, shareWeekExportPayload } from '../../lib/ProgramExportBuilder';
import { validateWeekImportPayload, resolveImportedExercises, buildImportBlocksPayload } from '../../lib/ProgramImportParser';


interface WarriorProgress {
  warriorId?: string;
  warriorProgramId: string;
  displayName: string;
  strengthTier: number;
  programName: string;
  templateId: string;
  totalBlocks: number;
  completedBlocks: number;
  percentage: number;
}

interface SetLogHistory {
  set_index: number;
  reps_completed: number | null;
  weight_used: number | null;
  hold_seconds: number | null;
  exercise_name: string | null;
}

interface WorkoutLogHistory {
  id: string;
  blockId: string;
  blockName: string;
  weekNumber: number | null;
  notes: string;
  status: 'completed' | 'missed';
  feel: string | null;
  rpe: number | null;
  missedReason: string | null;
  missedDetail: string | null;
  sessionSeconds: number | null;
  createdAt: string;
  sets: SetLogHistory[];
}

interface BodyweightEntry {
  logged_at: string;
  weight_kg: number;
}

const FEEL_LABELS: Record<string, string> = { hard: 'HARD', ok: 'OK', good: 'GOOD', strong: 'STRONG', beast: 'BEAST' };
const MISSED_LABELS: Record<string, string> = { no_time: 'NO TIME', too_tired: 'TOO TIRED', injury: 'INJURY', other: 'OTHER' };

interface ProgressTrackingScreenProps {
  coachId?: string;
  isAdmin?: boolean;
  onClose?: () => void;
}

export function ProgressTrackingScreen({ coachId, isAdmin = false, onClose }: ProgressTrackingScreenProps) {
  const { theme } = useTheme();
  const solidCardBg = theme.card.background === '#151515' || theme.card.background === '#1C1C1E' || theme.card.background === '#121212' || theme.card.background === '#000000' ? '#151515' : '#FFFFFF';
  const bronzeGold = '#C8A040';

  // State Management
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warriorList, setWarriorList] = useState<WarriorProgress[]>([]);

  // Detailed Warrior Log Modal State
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedWarrior, setSelectedWarrior] = useState<WarriorProgress | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<WorkoutLogHistory[]>([]);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Coach note for the currently-viewed week — one per (warrior_program, week).
  const [weekNote, setWeekNote] = useState('');
  const [weekNoteId, setWeekNoteId] = useState<string | null>(null);
  const [weekNoteLoading, setWeekNoteLoading] = useState(false);
  const [weekNoteSaving, setWeekNoteSaving] = useState(false);
  const [weekNoteDirty, setWeekNoteDirty] = useState(false);
  const [bodyweightTrend, setBodyweightTrend] = useState<BodyweightEntry[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  // Which week's logs are shown in the history modal — also what a future
  // "export this week" action would scope to, so this doubles as the week
  // picker for that.
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    loadProgressData();
  }, [coachId, isAdmin]);

  // Load all progress data for assigned warriors
  async function loadProgressData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch active programs
      let query = supabase
        .from('warrior_programs')
        .select(`
          id,
          warrior_id,
          template_id,
          coach_id,
          profiles:warrior_id (
            id,
            display_name,
            strength_tier
          ),
          program_templates:template_id (
            id,
            name
          )
        `)
        .eq('status', 'active');

      if (!isAdmin) {
        query = query.eq('coach_id', coachId);
      }

      const { data: assignments, error: assignmentsError } = await query;

      if (assignmentsError) throw assignmentsError;

      if (!assignments || assignments.length === 0) {
        setWarriorList([]);
        setLoading(false);
        return;
      }

      // 2. Fetch all templates blocks
      const templateIds = Array.from(new Set(assignments.map((a: any) => a.template_id).filter(Boolean)));
      
      const { data: blocksData, error: blocksError } = await supabase
        .from('program_blocks')
        .select('id, template_id')
        .in('template_id', templateIds);

      if (blocksError) throw blocksError;

      const blockCounts: Record<string, number> = {};
      const templateBlocksMap: Record<string, string[]> = {};
      
      (blocksData || []).forEach((b: any) => {
        blockCounts[b.template_id] = (blockCounts[b.template_id] || 0) + 1;
        if (!templateBlocksMap[b.template_id]) {
          templateBlocksMap[b.template_id] = [];
        }
        templateBlocksMap[b.template_id].push(b.id);
      });

      // 3. Fetch unique completed logs in batch for these warriors
      const warriorIds = Array.from(new Set(assignments.map((a: any) => a.warrior_id).filter(Boolean)));

      const { data: logsData, error: logsError } = await supabase
        .from('workout_logs')
        .select('warrior_id, block_id, notes')
        .in('warrior_id', warriorIds);

      if (logsError) throw logsError;

      // Status ('completed' vs 'missed') is encoded as the '[STATUS:MISSED]'
      // notes prefix (see log_block_with_sets/toggle_block_status) — a missed
      // block still has a workout_logs row, so it must be excluded here or
      // it would inflate completion % the same way it did on the warrior side.
      const completedBlocksSet = new Set<string>();
      (logsData || []).forEach((l: any) => {
        if (!l.notes?.startsWith('[STATUS:MISSED]')) {
          completedBlocksSet.add(`${l.warrior_id}:${l.block_id}`);
        }
      });

      // 4. Map the final progress stats per warrior
      const mappedProgress: WarriorProgress[] = (assignments || []).map((a: any) => {
        const warriorId = a.profiles?.id || '';
        const displayName = a.profiles?.display_name || 'UNKNOWN WARRIOR';
        const strengthTier = a.profiles?.strength_tier || 0;
        const programName = a.program_templates?.name || 'ASSIGNED WORKOUT PROGRAM';
        const templateId = a.template_id || '';
        
        const totalBlocks = blockCounts[templateId] || 0;
        
        // Count how many unique blocks from this template were completed by this warrior
        let completedBlocks = 0;
        const blockIds = templateBlocksMap[templateId] || [];
        blockIds.forEach(bId => {
          if (completedBlocksSet.has(`${warriorId}:${bId}`)) {
            completedBlocks++;
          }
        });

        const percentage = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0;

        return {
          warriorId,
          warriorProgramId: a.id,
          displayName,
          strengthTier,
          programName,
          templateId,
          totalBlocks,
          completedBlocks,
          percentage
        };
      });

      setWarriorList(mappedProgress);
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD WARRIOR PROGRESS.');
    } finally {
      setLoading(false);
    }
  }

  // Load detailed log history for a specific warrior via the coach-scoped
  // get_warrior_progress RPC — one call gets logs, per-set detail, weekly
  // completion, and bodyweight trend instead of the old block-id-list +
  // workout_logs join (which also only ever showed the 5-star rating/notes,
  // not feel/RPE/missed-reason/per-set data).
  const handleOpenHistoryModal = async (warrior: WarriorProgress) => {
    setSelectedWarrior(warrior);
    setHistoryLoading(true);
    setHistoryLogs([]);
    setBodyweightTrend([]);
    setHistoryModalVisible(true);
    setExpandedLogId(null);
    setSelectedWeek(null);
    setWeekNote('');
    setWeekNoteId(null);
    setWeekNoteDirty(false);

    try {
      const { data, error } = await supabase.rpc('get_warrior_progress', {
        p_warrior_program_id: warrior.warriorProgramId,
      });
      if (error) throw error;

      const mappedLogs: WorkoutLogHistory[] = (data?.logs || []).map((l: any) => ({
        id: l.id,
        blockId: l.block_id,
        blockName: l.block_name || 'WORKOUT BLOCK',
        weekNumber: l.week_number,
        notes: l.notes || '',
        status: l.status,
        feel: l.feel,
        rpe: l.rpe,
        missedReason: l.missed_reason,
        missedDetail: l.missed_detail,
        sessionSeconds: l.session_seconds,
        createdAt: l.completed_at,
        sets: l.sets || [],
      }));

      setHistoryLogs(mappedLogs);
      setBodyweightTrend(data?.bodyweight_trend || []);
      // Default to the most recently logged week rather than showing every
      // week mixed together in one scroll.
      const weekNumbers = Array.from(new Set(mappedLogs.map(l => l.weekNumber || 1)));
      if (weekNumbers.length > 0) {
        setSelectedWeek(Math.max(...weekNumbers));
      }
    } catch (err: any) {
      console.error('Failed to load log history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Coach note for the selected week — one row per (warrior_program, week),
  // reloaded whenever the week toggle changes.
  useEffect(() => {
    if (!historyModalVisible || !selectedWarrior || selectedWeek === null) return;
    loadWeekNote(selectedWarrior.warriorProgramId, selectedWeek);
  }, [historyModalVisible, selectedWarrior, selectedWeek]);

  const loadWeekNote = async (warriorProgramId: string, weekNumber: number) => {
    setWeekNoteLoading(true);
    try {
      const { data, error } = await supabase
        .from('coach_week_notes')
        .select('id, note')
        .eq('warrior_program_id', warriorProgramId)
        .eq('week_number', weekNumber)
        .maybeSingle();
      if (error) throw error;
      setWeekNote(data?.note || '');
      setWeekNoteId(data?.id || null);
      setWeekNoteDirty(false);
    } catch (err: any) {
      console.error('Failed to load week note:', err);
    } finally {
      setWeekNoteLoading(false);
    }
  };

  const handleSaveWeekNote = async () => {
    if (!selectedWarrior || selectedWeek === null || !coachId) return;
    setWeekNoteSaving(true);
    try {
      if (weekNoteId) {
        const { error } = await supabase
          .from('coach_week_notes')
          .update({ note: weekNote, updated_at: new Date().toISOString() })
          .eq('id', weekNoteId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('coach_week_notes')
          .insert({
            warrior_program_id: selectedWarrior.warriorProgramId,
            week_number: selectedWeek,
            coach_id: coachId,
            note: weekNote,
          })
          .select('id')
          .single();
        if (error) throw error;
        setWeekNoteId(data.id);
      }
      setWeekNoteDirty(false);
    } catch (err: any) {
      console.error('Failed to save week note:', err);
    } finally {
      setWeekNoteSaving(false);
    }
  };

  const handleExportWeek = async () => {
    if (!selectedWarrior || selectedWeek === null) return;
    setExporting(true);
    try {
      const payload = await fetchWeekExportPayload({
        templateId: selectedWarrior.templateId,
        templateName: selectedWarrior.programName,
        weekNumber: selectedWeek,
        warriorId: selectedWarrior.warriorId || '',
        warriorDisplayName: selectedWarrior.displayName,
        warriorStrengthTier: selectedWarrior.strengthTier,
        logs: visibleLogs.map(l => ({
          blockId: l.blockId,
          status: l.status,
          feel: l.feel,
          rpe: l.rpe,
          missedReason: l.missedReason,
          missedDetail: l.missedDetail,
          sessionSeconds: l.sessionSeconds,
          notes: l.notes,
          sets: l.sets,
        })),
        bodyweightTrend,
        coachWeekNote: weekNote,
      });
      await shareWeekExportPayload(payload, `${selectedWarrior.displayName}_week${selectedWeek}`);
    } catch (err: any) {
      console.error('Failed to export week:', err);
    } finally {
      setExporting(false);
    }
  };

  // Picks an AI-edited (or hand-edited) week JSON file, validates it,
  // resolves each exercise to a real exercise_library row, and always adds
  // it as a new week onto the client's program via the same append-only
  // RPC used elsewhere in this screen — an import never overwrites or
  // archives anything on its own.
  const handleImportWeek = async () => {
    if (!selectedWarrior || !coachId) return;
    setImporting(true);
    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || !result.assets?.[0]) {
        setImporting(false);
        return;
      }

      const asset = result.assets[0];
      const text = Platform.OS === 'web'
        ? await (await fetch(asset.uri)).text()
        : await require('expo-file-system/legacy').readAsStringAsync(asset.uri, { encoding: 'utf8' });

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        Alert.alert('IMPORT FAILED', 'That file is not valid JSON.');
        return;
      }

      const validation = validateWeekImportPayload(parsed);
      if (!validation.valid) {
        Alert.alert('IMPORT FAILED', validation.error || 'The file is not in the expected shape.');
        return;
      }

      const resolved = await resolveImportedExercises(parsed.blocks, coachId);
      const blocks = buildImportBlocksPayload(parsed, resolved);

      const { error } = await supabase.rpc('append_weeks_to_client_program', {
        p_warrior_program_id: selectedWarrior.warriorProgramId,
        p_blocks: blocks,
      });
      if (error) throw error;

      Alert.alert('IMPORTED', `Added ${validation.blockCount} block(s) as a new week.`);
      await handleOpenHistoryModal(selectedWarrior);
    } catch (err: any) {
      console.error('Failed to import week:', err);
      Alert.alert('IMPORT FAILED', err.message?.toUpperCase() || 'FAILED TO IMPORT WEEK.');
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // '[LOG] Completed: 3 Rounds/Reps' / '[LOG] Finished in: 0:14' / '[LOG] Ladder
  // Progress: ...' are the AMRAP/FOR TIME/ladder result lines the warrior client
  // appends to notes (see WarriorProgramScreen.tsx handleLogWorkout/quickLogWorkout).
  // Anything else in notes is the warrior's own free-text comment.
  const parseLogNotes = (notes: string): { summaryLines: string[]; freeText: string } => {
    if (!notes) return { summaryLines: [], freeText: '' };
    const summaryLines: string[] = [];
    const freeTextLines: string[] = [];
    notes.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const match = line.match(/^\[LOG\]\s*(.+)$/);
      if (match) summaryLines.push(match[1]);
      else freeTextLines.push(line);
    });
    return { summaryLines, freeText: freeTextLines.join(' ') };
  };

  const availableWeeks = Array.from(new Set(historyLogs.map(l => l.weekNumber || 1))).sort((a, b) => a - b);
  const visibleLogs = selectedWeek === null
    ? historyLogs
    : historyLogs.filter(l => (l.weekNumber || 1) === selectedWeek);

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* HEADER BAR */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 16,
          position: 'relative',
          marginBottom: 20
        }}>


          {/* Centered Logo Branding */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ 
              fontFamily: 'BarlowCondensed-ExtraBold', 
              fontSize: 30, 
              letterSpacing: 8, 
              color: theme.text.primary,
              textAlign: 'center'
            }}>
              W Ʌ R R I O R
            </Text>
            <Text style={{ 
              fontFamily: 'BarlowCondensed-ExtraBold', 
              fontSize: 12, 
              letterSpacing: 5, 
              color: bronzeGold,
              textAlign: 'center',
              marginTop: -2
            }}>
              P R O G R E S S
            </Text>
          </View>
        </View>

        {/* Glowing 3-World Separator line under header */}
        <LinearGradient
          colors={['#7E57C2', '#FF5252', '#FF7043']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 1.5, width: '100%', marginBottom: 20 }}
        />

        {loading ? (
          <View style={styles.centerContainer}>
            <LeapLogo size={40} animated />
            <Text style={[styles.loadingText, { color: theme.text.secondary }]}>FETCHING WARRIORS METRICS...</Text>
          </View>
        ) : (
          <View style={{ width: '100%', gap: 20 }}>
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            <View style={{ gap: 16 }}>
              {warriorList.length === 0 ? (
                <View style={[styles.emptyContainer, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                  <Text style={[styles.emptyTitle, { color: theme.text.primary }]}>NO ASSIGNED WARRIORS</Text>
                  <Text style={[styles.emptySubtitle, { color: theme.text.secondary }]}>
                    ASSIGN PROGRAMS TO WARRIORS TO COMMENCE PROGRESS MONITORING.
                  </Text>
                </View>
              ) : (
                warriorList.map((warrior: WarriorProgress) => (
                  <TouchableOpacity
                    key={warrior.warriorId}
                    style={[styles.progressCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}
                    onPress={() => handleOpenHistoryModal(warrior)}
                    activeOpacity={0.8}
                  >
                    {/* Warrior Header */}
                    <View style={styles.warriorHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.warriorName, { color: theme.text.primary }]}>
                          {warrior.displayName.toUpperCase()}
                        </Text>
                        <Text style={[styles.programName, { color: bronzeGold }]} numberOfLines={1}>
                          {warrior.programName.toUpperCase()}
                        </Text>
                      </View>
                      <View style={[styles.tierBadge, { backgroundColor: 'rgba(200, 160, 64, 0.1)', borderColor: bronzeGold }]}>
                        <Text style={[styles.tierText, { color: bronzeGold }]}>TIER {warrior.strengthTier}</Text>
                      </View>
                    </View>

                    {/* Progress details */}
                    <View style={styles.progressDetailRow}>
                      <Text style={[styles.progressCountLabel, { color: theme.text.secondary }]}>
                        BLOCKS COMPLETED: <Text style={{ color: theme.text.primary, fontWeight: 'bold' }}>{warrior.completedBlocks} / {warrior.totalBlocks}</Text>
                      </Text>
                      <Text style={[styles.progressPercentLabel, { color: bronzeGold }]}>
                        {warrior.percentage}%
                      </Text>
                    </View>

                    {/* Progress Bar */}
                    <View style={[styles.progressBarBackground, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                      <LinearGradient
                        colors={['#7E57C2', '#FF5252', '#FF7043']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.progressBarFill, 
                          { width: `${warrior.percentage}%` }
                        ]}
                      />
                    </View>

                    <Text style={[styles.tapHint, { color: theme.text.tertiary }]}>
                      TAP TO VIEW DETAILED HISTORY LOGS
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* DETAILED LOG HISTORY MODAL */}
      <Modal
        visible={historyModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>
              {(selectedWarrior?.displayName || '').toUpperCase()}'S HISTORY
            </Text>

            {!historyLoading && availableWeeks.length > 1 && (
              <View style={styles.weekToggleRow}>
                {availableWeeks.map(w => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setSelectedWeek(w)}
                    style={[
                      styles.weekPill,
                      {
                        borderColor: selectedWeek === w ? bronzeGold : theme.card.border,
                        backgroundColor: selectedWeek === w ? 'rgba(200,160,64,0.12)' : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{
                      fontFamily: 'BarlowCondensed-Bold',
                      fontSize: 12,
                      letterSpacing: 0.5,
                      color: selectedWeek === w ? bronzeGold : theme.text.secondary,
                    }}>
                      WEEK {w}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!historyLoading && selectedWeek !== null && (
              <View style={[styles.weekNoteSection, { borderColor: theme.card.border }]}>
                <View style={styles.weekNoteHeader}>
                  <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1 }}>
                    COACH NOTE FOR WEEK {selectedWeek}
                  </Text>
                  {weekNoteLoading && <LeapLogo size={14} animated />}
                </View>
                <TextInput
                  style={[styles.weekNoteInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                  placeholder="Leave feedback or instructions for this week..."
                  placeholderTextColor={theme.text.tertiary}
                  multiline
                  value={weekNote}
                  onChangeText={(text) => { setWeekNote(text); setWeekNoteDirty(true); }}
                  editable={!weekNoteLoading && !weekNoteSaving}
                />
                {weekNoteDirty && (
                  <TouchableOpacity
                    onPress={handleSaveWeekNote}
                    disabled={weekNoteSaving}
                    style={[styles.weekNoteSaveBtn, { backgroundColor: bronzeGold, opacity: weekNoteSaving ? 0.6 : 1 }]}
                  >
                    <Text style={styles.weekNoteSaveBtnText}>{weekNoteSaving ? 'SAVING...' : 'SAVE NOTE'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {historyLoading ? (
              <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                <LeapLogo size={40} animated />
              </View>
            ) : (
              <ScrollView style={{ width: '100%', maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {bodyweightTrend.length > 0 && (
                  <View style={[styles.bwSection, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}>
                    <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
                      LATEST BODYWEIGHT
                    </Text>
                    <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16 }}>
                      {bodyweightTrend[0].weight_kg}KG
                      <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>
                        {'  '}({formatDate(bodyweightTrend[0].logged_at)})
                      </Text>
                    </Text>
                  </View>
                )}

                {visibleLogs.length === 0 ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13 }}>
                      {historyLogs.length === 0 ? 'NO WORKOUT LOGS RECORDED YET.' : 'NOTHING LOGGED THIS WEEK YET.'}
                    </Text>
                  </View>
                ) : (
                  visibleLogs.map((log: WorkoutLogHistory) => {
                    const isMissed = log.status === 'missed';
                    const isExpanded = expandedLogId === log.id;
                    return (
                      <TouchableOpacity
                        key={log.id}
                        activeOpacity={0.8}
                        onPress={() => setExpandedLogId(isExpanded ? null : log.id)}
                        style={[styles.historyRow, { borderBottomColor: 'rgba(255,255,255,0.03)' }]}
                      >
                        <View style={styles.historyRowHeader}>
                          <Text style={[styles.historyBlock, { color: theme.text.primary }]}>
                            {log.blockName.toUpperCase()}
                          </Text>
                          <View style={[
                            styles.statusPill,
                            { borderColor: isMissed ? '#FF6B6B' : '#4CAF50', backgroundColor: isMissed ? 'rgba(255,107,107,0.1)' : 'rgba(76,175,80,0.1)' }
                          ]}>
                            <Text style={{ color: isMissed ? '#FF6B6B' : '#4CAF50', fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 }}>
                              {isMissed ? 'MISSED' : 'DONE'}
                            </Text>
                          </View>
                        </View>

                        <Text style={[styles.historyDate, { color: theme.text.tertiary }]}>
                          WEEK {log.weekNumber || 1} • {formatDate(log.createdAt)}
                        </Text>

                        {isMissed ? (
                          <Text style={[styles.historyNotes, { color: theme.text.secondary }]}>
                            {log.missedReason ? (MISSED_LABELS[log.missedReason] || log.missedReason.toUpperCase()) : 'NO REASON GIVEN'}
                            {log.missedDetail ? ` — ${log.missedDetail}` : ''}
                          </Text>
                        ) : (
                          <>
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                              {!!log.feel && (
                                <Text style={{ color: bronzeGold, fontSize: 11, fontFamily: 'BarlowCondensed-Bold' }}>
                                  {FEEL_LABELS[log.feel] || log.feel.toUpperCase()}
                                </Text>
                              )}
                              {log.rpe !== null && (
                                <Text style={{ color: theme.text.secondary, fontSize: 11, fontFamily: 'BarlowCondensed-Bold' }}>
                                  RPE {log.rpe}
                                </Text>
                              )}
                            </View>

                            {/* AMRAP rounds / FOR TIME duration / ladder rung reached have no
                                per-set rows — the warrior client only writes them as '[LOG] ...'
                                lines in notes (see WarriorProgramScreen's handleLogWorkout), so
                                this is the only place that data exists to show. */}
                            {(() => {
                              const { summaryLines, freeText } = parseLogNotes(log.notes);
                              return (
                                <>
                                  {summaryLines.length > 0 && (
                                    <View style={{ marginTop: 6, gap: 2 }}>
                                      {summaryLines.map((line, i) => (
                                        <Text key={i} style={{ color: theme.text.primary, fontSize: 12, fontFamily: 'BarlowCondensed-Bold' }}>
                                          {line.toUpperCase()}
                                        </Text>
                                      ))}
                                    </View>
                                  )}
                                  {!!freeText && (
                                    <Text style={[styles.historyNotes, { color: theme.text.secondary }]}>{freeText}</Text>
                                  )}
                                </>
                              );
                            })()}
                          </>
                        )}

                        {isExpanded && log.sets.length > 0 && (
                          <View style={[styles.setsBlock, { borderTopColor: 'rgba(255,255,255,0.06)' }]}>
                            {log.sets.map((s, i) => (
                              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={{ color: theme.text.tertiary, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', width: 44 }}>
                                  SET {s.set_index}
                                </Text>
                                <Text style={{ color: theme.text.secondary, fontSize: 11, fontFamily: 'BarlowCondensed-Bold', flex: 1 }} numberOfLines={1}>
                                  {s.exercise_name || 'EXERCISE'}
                                </Text>
                                <Text style={{ color: theme.text.primary, fontSize: 11, fontFamily: 'BarlowCondensed-ExtraBold' }}>
                                  {s.reps_completed !== null ? `${s.reps_completed} REPS` : ''}
                                  {s.weight_used !== null ? ` @ ${s.weight_used}KG` : ''}
                                  {s.hold_seconds !== null ? ` ${s.hold_seconds}S HOLD` : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {log.sets.length > 0 && (
                          <Text style={{ color: theme.text.tertiary, fontSize: 9, fontFamily: 'BarlowCondensed-Bold', marginTop: 6 }}>
                            {isExpanded ? '▲ HIDE SETS' : `▼ ${log.sets.length} SET${log.sets.length === 1 ? '' : 'S'} LOGGED`}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            {!historyLoading && selectedWeek !== null && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
                <TouchableOpacity
                  onPress={handleExportWeek}
                  disabled={exporting || importing}
                  style={[styles.exportBtn, { borderColor: bronzeGold, opacity: exporting ? 0.6 : 1 }]}
                >
                  <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
                    {exporting ? 'EXPORTING...' : `EXPORT WEEK ${selectedWeek}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleImportWeek}
                  disabled={exporting || importing}
                  style={[styles.exportBtn, { borderColor: theme.card.border, opacity: importing ? 0.6 : 1 }]}
                >
                  <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
                    {importing ? 'IMPORTING...' : 'IMPORT WEEK'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1, borderRadius: 6 }}
              >
                <TouchableOpacity
                  style={{
                    width: '100%',
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => setHistoryModalVisible(false)}
                >
                  <Text style={{ color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>CLOSE</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    borderBottomWidth: 1,
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 26,
    letterSpacing: 1.5,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
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
  progressCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  warriorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  warriorName: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  programName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    marginTop: 2,
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tierText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  progressDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  progressCountLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  progressPercentLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  tapHint: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 16,
    opacity: 0.7,
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
    maxWidth: 420,
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
  weekToggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  weekPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  weekNoteSection: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  weekNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  weekNoteInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  weekNoteSaveBtn: {
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  weekNoteSaveBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
    color: '#000',
  },
  bwSection: {
    borderBottomWidth: 1,
    paddingBottom: 14,
    marginBottom: 14,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  setsBlock: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
    gap: 6,
  },
  historyRow: {
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  historyRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  historyBlock: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 0.5,
    flex: 1,
  },
  historyDate: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    marginTop: 2,
  },
  historyNotes: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
  exportBtn: {
    flex: 1,
    borderWidth: 1.2,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
