import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { LeapLogo } from '../../components/LeapLogo';


interface WarriorProgress {
  warriorId?: string;
  displayName: string;
  strengthTier: number;
  programName: string;
  templateId: string;
  totalBlocks: number;
  completedBlocks: number;
  percentage: number;
}

interface WorkoutLogHistory {
  id: string | number;
  blockName: string;
  notes: string;
  rating: number;
  createdAt: string;
}

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
  const [selectedWarriorName, setSelectedWarriorName] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<WorkoutLogHistory[]>([]);

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
        .select('warrior_id, block_id')
        .in('warrior_id', warriorIds);

      if (logsError) throw logsError;

      const completedBlocksSet = new Set<string>();
      (logsData || []).forEach((l: any) => {
        completedBlocksSet.add(`${l.warrior_id}:${l.block_id}`);
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

  // Load detailed log history for a specific warrior
  const handleOpenHistoryModal = async (warrior: WarriorProgress) => {
    setSelectedWarriorName(warrior.displayName);
    setHistoryLoading(true);
    setHistoryLogs([]);
    setHistoryModalVisible(true);

    try {
      // 1. Fetch block IDs for this template since template_id doesn't exist in workout_logs table
      const { data: blocksData, error: blocksErr } = await supabase
        .from('program_blocks')
        .select('id')
        .eq('template_id', warrior.templateId);

      if (blocksErr) throw blocksErr;
      const blockIds = (blocksData || []).map(b => b.id);

      if (blockIds.length === 0) {
        setHistoryLogs([]);
        setHistoryLoading(false);
        return;
      }

      // 2. Fetch completed logs for those block IDs
      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          id,
          notes,
          rating,
          completed_at,
          program_blocks:block_id (
            name
          )
        `)
        .eq('warrior_id', warrior.warriorId)
        .in('block_id', blockIds)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      const mappedLogs: WorkoutLogHistory[] = (data || []).map((l: any) => ({
        id: l.id,
        blockName: l.program_blocks?.name || 'WORKOUT BLOCK',
        notes: l.notes || '',
        rating: l.rating || 5,
        createdAt: l.completed_at
      }));

      setHistoryLogs(mappedLogs);
    } catch (err: any) {
      console.error('Failed to load log history:', err);
    } finally {
      setHistoryLoading(false);
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
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { backgroundColor: bronzeGold, width: `${warrior.percentage}%` }
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
              {selectedWarriorName.toUpperCase()}'S HISTORY
            </Text>

            {historyLoading ? (
              <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                <LeapLogo size={40} animated />
              </View>
            ) : (
              <ScrollView style={{ width: '100%', maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {historyLogs.length === 0 ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13 }}>
                      NO WORKOUT LOGS RECORDED YET.
                    </Text>
                  </View>
                ) : (
                  historyLogs.map((log: WorkoutLogHistory) => (
                    <View
                      key={log.id}
                      style={[styles.historyRow, { borderBottomColor: 'rgba(255,255,255,0.03)' }]}
                    >
                      <View style={styles.historyRowHeader}>
                        <Text style={[styles.historyBlock, { color: theme.text.primary }]}>
                          {log.blockName.toUpperCase()}
                        </Text>
                        <Text style={{ color: bronzeGold, fontSize: 12, fontWeight: 'bold' }}>
                          {'★'.repeat(log.rating)}{'☆'.repeat(5 - log.rating)}
                        </Text>
                      </View>

                      <Text style={[styles.historyDate, { color: theme.text.tertiary }]}>
                        {formatDate(log.createdAt)}
                      </Text>

                      {log.notes ? (
                        <Text style={[styles.historyNotes, { color: theme.text.secondary }]}>
                          {log.notes}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.modalCloseBtn, { borderColor: theme.card.border, marginTop: 24 }]}
              onPress={() => setHistoryModalVisible(false)}
            >
              <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>CLOSE</Text>
            </TouchableOpacity>
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
  modalCloseBtn: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
