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
  Alert,
  KeyboardAvoidingView } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';


interface WarriorProfile {
  id: string;
  display_name: string;
  strength_tier: number;
}

interface ProgramTemplate {
  id: string;
  name: string;
  description?: string;
  coach_id: string;
  block_count: number;
}

interface WarriorProgramAssignment {
  id: string;
  coach_id: string;
  warrior_id: string;
  template_id: string;
  status: 'active' | 'paused' | 'completed';
  created_at?: string;
  profiles: {
    display_name: string;
    strength_tier: number;
  } | null;
  program_templates: {
    name: string;
  } | null;
}

interface MyClientsScreenProps {
  coachId?: string;
  isAdmin?: boolean;
}

export function MyClientsScreen({ coachId, isAdmin = false }: MyClientsScreenProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const solidCardBg = theme.card.background === '#151515' || theme.card.background === '#1C1C1E' || theme.card.background === '#121212' || theme.card.background === '#000000' ? '#151515' : '#FFFFFF';
  const bronzeGold = '#C8A040';

  // State Management
  const [warriors, setWarriors] = useState<WarriorProfile[]>([]);
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [assignments, setAssignments] = useState<WarriorProgramAssignment[]>([]);
  
  const [searchWarrior, setSearchWarrior] = useState('');
  const [selectedWarrior, setSelectedWarrior] = useState<WarriorProfile | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplate | null>(null);
  
  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit Assignment Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [activeEditingAssignment, setActiveEditingAssignment] = useState<WarriorProgramAssignment | null>(null);
  const [editStatus, setEditStatus] = useState<'active' | 'paused' | 'completed'>('active');

  useEffect(() => {
    loadAllData();
  }, [coachId, isAdmin]);

  // Load all initial profiles, templates, and active assignments
  async function loadAllData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch all profiles (warriors)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, strength_tier')
        .order('display_name', { ascending: true });

      if (profilesError) throw profilesError;
      setWarriors(profilesData || []);

      let templatesQuery = supabase
        .from('program_templates')
        .select('id, name, description, coach_id')
        .not('name', 'ilike', '[CUSTOM]%');

      if (!isAdmin) {
        templatesQuery = templatesQuery.eq('coach_id', coachId);
      }

      const { data: templatesData, error: templatesError } = await templatesQuery
        .order('name', { ascending: true });

      if (templatesError) throw templatesError;

      // 3. Fetch block counts for templates
      const { data: blocksData, error: blocksError } = await supabase
        .from('program_blocks')
        .select('id, template_id');

      if (blocksError) throw blocksError;

      const blockCountMap: Record<string, number> = {};
      (blocksData || []).forEach((b: any) => {
        blockCountMap[b.template_id] = (blockCountMap[b.template_id] || 0) + 1;
      });

      const mappedTemplates: ProgramTemplate[] = (templatesData || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description || '',
        coach_id: t.coach_id,
        block_count: blockCountMap[t.id] || 0
      }));

      setTemplates(mappedTemplates);

      // 4. Fetch assignments
      await fetchAssignmentsList();
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD ASSIGNMENT DATA.');
    } finally {
      setLoading(false);
    }
  }

  // Fetch active assignments list
  async function fetchAssignmentsList() {
    try {
      let query = supabase
        .from('warrior_programs')
        .select(`
          id,
          coach_id,
          warrior_id,
          template_id,
          status,
          profiles:warrior_id (
            display_name,
            strength_tier
          ),
          program_templates:template_id (
            name
          )
        `);

      if (!isAdmin) {
        query = query.eq('coach_id', coachId);
      }

      const { data, error } = await query.order('id', { ascending: false });

      if (error) throw error;
      setAssignments((data as any) || []);
    } catch (err: any) {
      console.error('Failed to load assignments list:', err);
    }
  }

  // Trigger program template assignment
  const handleAssignProgram = async () => {
    setErrorMsg(null);
    if (!selectedWarrior) {
      setErrorMsg('PLEASE SELECT A WARRIOR.');
      return;
    }
    if (!selectedTemplate) {
      setErrorMsg('PLEASE SELECT A WORKOUT TEMPLATE.');
      return;
    }

    setActionLoading(true);
    try {
      // Use the newly created RPC to clone the template and all blocks/exercises on the DB side instantly
      const customName = `${selectedWarrior.display_name.split(' ')[0]}'s ${selectedTemplate.name}`;
      
      const { data: newTemplateId, error: rpcError } = await supabase.rpc('assign_program_template', {
        p_coach_id: coachId,
        p_warrior_id: selectedWarrior.id,
        p_template_id: selectedTemplate.id,
        p_custom_name: customName
      });

      if (rpcError) throw rpcError;

      setSelectedWarrior(null);
      setSelectedTemplate(null);
      setSearchWarrior('');
      await fetchAssignmentsList();
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO ASSIGN WORKOUT PROGRAM.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open status editor modal
  const handleOpenEditModal = (assignment: WarriorProgramAssignment) => {
    setActiveEditingAssignment(assignment);
    setEditStatus(assignment.status);
    setEditModalVisible(true);
  };

  // Update assignment status inside supabase
  const handleUpdateAssignmentStatus = async () => {
    if (!activeEditingAssignment) return;
    setErrorMsg(null);
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('warrior_programs')
        .update({ status: editStatus })
        .eq('id', activeEditingAssignment.id);

      if (error) throw error;
      setEditModalVisible(false);
      setActiveEditingAssignment(null);
      await fetchAssignmentsList();
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO UPDATE PROGRAM STATUS.');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete program assignment and entirely wipe client program data
  const handleDeleteClientData = (assignment: WarriorProgramAssignment) => {
    const performWipe = async () => {
      setErrorMsg(null);
      try {
        const { error: rpcErr } = await supabase.rpc('delete_coach_client_data', {
          p_assignment_id: assignment.id
        });

        if (rpcErr) throw rpcErr;

        await fetchAssignmentsList();
      } catch (err: any) {
        const fullErr = `Error: ${err.message || 'Unknown'}\nCode: ${err.code || 'N/A'}\nDetails: ${err.details || 'N/A'}`;
        console.error('Delete Client Error:', err);
        setErrorMsg(fullErr.toUpperCase());
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('ARE YOU SURE YOU WANT TO DELETE THIS CLIENT AND WIPE ALL PROGRAM/LOG DATA?')) {
        performWipe();
      }
    } else {
      Alert.alert(
        'DELETE CLIENT DATA',
        'ARE YOU SURE YOU WANT TO DELETE THIS CLIENT AND WIPE ALL PROGRAM/LOG DATA?',
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'DELETE', style: 'destructive', onPress: performWipe }
        ]
      );
    }
  };

  const getInitials = (name: string): string => {
    if (!name) return 'W';
    return name.trim().charAt(0).toUpperCase();
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Filter Warriors based on search query AND exclude clients already in active roster
  const activeWarriorIds = new Set(assignments.map(a => a.warrior_id));
  const filteredWarriors = warriors.filter(w =>
    !activeWarriorIds.has(w.id) &&
    (w.display_name || '').toLowerCase().includes(searchWarrior.toLowerCase())
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background.primary }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
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
              letterSpacing: 4, 
              color: theme.text.primary,
              textAlign: 'center'
            }}>
              MY CLIENTS
            </Text>
            <Text style={{ 
              fontFamily: 'BarlowCondensed-ExtraBold', 
              fontSize: 12, 
              letterSpacing: 2.5, 
              color: bronzeGold,
              textAlign: 'center',
              marginTop: -2
            }}>
              A C T I V E  R O S T E R
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
            <Text style={[styles.loadingText, { color: theme.text.secondary }]}>LOADING ASSIGNMENT SYSTEM...</Text>
          </View>
        ) : (
          <View style={{ width: '100%', gap: 24 }}>
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* FORM CARD */}
            <View style={[styles.card, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.cardHeading, { color: theme.text.primary }]}>NEW PROGRAM ASSIGNMENT</Text>

              {/* STEP 1: SELECT WARRIOR */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.text.secondary }]}>SELECT WARRIOR (SEARCH)</Text>
                
                {selectedWarrior ? (
                  <View style={[styles.selectedPreview, { borderColor: bronzeGold }]}>
                    <View style={[styles.avatarCircle, { backgroundColor: 'rgba(200, 160, 64, 0.15)' }]}>
                      <Text style={[styles.avatarText, { color: bronzeGold }]}>
                        {getInitials(selectedWarrior.display_name)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.previewName, { color: theme.text.primary }]}>
                        {(selectedWarrior.display_name || 'UNNAMED WARRIOR').toUpperCase()}
                      </Text>
                      <Text style={[styles.previewSubtitle, { color: bronzeGold }]}>
                        STRENGTH TIER {selectedWarrior.strength_tier}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.clearBtn} 
                      onPress={() => setSelectedWarrior(null)}
                    >
                      <Text style={{ color: '#FF6B6B', fontSize: 11, fontWeight: 'bold' }}>CHANGE</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <TextInput
                      style={[styles.inputField, { color: theme.text.primary, borderColor: theme.card.border }]}
                      placeholder="TYPE TO SEARCH WARRIORS..."
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={searchWarrior}
                      onChangeText={(val: string) => setSearchWarrior(val)}
                    />
                    
                    {searchWarrior.length > 0 && (
                      <ScrollView 
                        style={[styles.dropdownScroll, { backgroundColor: theme.background.secondary || '#121212', borderColor: theme.card.border }]}
                        nestedScrollEnabled={true}
                      >
                        {filteredWarriors.length === 0 ? (
                          <Text style={[styles.noResultText, { color: theme.text.tertiary }]}>
                            NO MATCHING WARRIORS.
                          </Text>
                        ) : (
                          filteredWarriors.slice(0, 5).map((w: WarriorProfile) => (
                            <TouchableOpacity
                              key={w.id}
                              style={[styles.dropdownItem, { borderBottomColor: 'rgba(255,255,255,0.02)' }]}
                              onPress={() => setSelectedWarrior(w)}
                            >
                              <View style={[styles.avatarCircleMini, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
                                <Text style={[styles.avatarTextMini, { color: theme.text.secondary }]}>
                                  {getInitials(w.display_name)}
                                </Text>
                              </View>
                              <View>
                                <Text style={[styles.dropdownName, { color: theme.text.primary }]}>
                                  {(w.display_name || 'UNNAMED WARRIOR').toUpperCase()}
                                </Text>
                                <Text style={[styles.dropdownSub, { color: bronzeGold }]}>
                                  TIER {w.strength_tier}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>

              {/* STEP 2: SELECT WORKOUT TEMPLATE */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.text.secondary }]}>SELECT PROGRAM TEMPLATE</Text>
                
                {selectedTemplate ? (
                  <View style={[styles.selectedPreview, { borderColor: bronzeGold }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.previewName, { color: theme.text.primary }]}>
                        {selectedTemplate.name.toUpperCase()}
                      </Text>
                      <Text style={[styles.previewSubtitle, { color: bronzeGold }]}>
                        {selectedTemplate.block_count} WORKOUT BLOCKS / DAYS
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.clearBtn} 
                      onPress={() => setSelectedTemplate(null)}
                    >
                      <Text style={{ color: '#FF6B6B', fontSize: 11, fontWeight: 'bold' }}>CHANGE</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={styles.templateListScroll}>
                    {templates.length === 0 ? (
                      <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
                        <Text style={{ color: theme.text.tertiary, fontSize: 12 }}>NO TEMPLATES AVAILABLE</Text>
                      </View>
                    ) : (
                      templates.map((t: ProgramTemplate) => (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.templateSelectCard, { backgroundColor: 'rgba(255,255,255,0.01)', borderColor: theme.card.border }]}
                          onPress={() => setSelectedTemplate(t)}
                        >
                          <Text style={[styles.templateSelectName, { color: theme.text.primary }]} numberOfLines={1}>
                            {t.name.toUpperCase()}
                          </Text>
                          <Text style={[styles.templateSelectBlocks, { color: bronzeGold }]}>
                            {t.block_count} BLOCKS
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                )}
              </View>

              {/* ASSIGN PROGRAM BUTTON */}
              <View style={{ marginTop: 8 }}>
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 8, opacity: (!selectedWarrior || !selectedTemplate || actionLoading) ? 0.5 : 1 }}
                >
                  <TouchableOpacity
                    onPress={handleAssignProgram}
                    disabled={!selectedWarrior || !selectedTemplate || actionLoading}
                    style={{
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {actionLoading ? (
                      <Text style={{ color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 1 }}>ASSIGNING...</Text>
                    ) : (
                      <Text style={{ color: '#FFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 1 }}>ASSIGN PROGRAM TEMPLATE</Text>
                    )}
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>

            {/* ACTIVE ASSIGNMENTS VIEW */}
            <View style={{ gap: 12 }}>
              <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
                {isAdmin ? 'ALL ACTIVE ASSIGNMENTS' : 'YOUR ACTIVE ASSIGNMENTS'}
              </Text>

              {assignments.length === 0 ? (
                <View style={[styles.emptyStateCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                  <Text style={[styles.emptyStateText, { color: theme.text.secondary }]}>
                    NO PROGRAMS CURRENTLY ASSIGNED.
                  </Text>
                </View>
              ) : (
                assignments.map((assignment: WarriorProgramAssignment) => (
                  <View
                    key={assignment.id}
                    style={[styles.assignmentCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}
                  >
                    <View style={styles.assignmentHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assignmentWarrior, { color: theme.text.primary }]}>
                          {assignment.profiles?.display_name?.toUpperCase() || 'UNKNOWN WARRIOR'}
                        </Text>
                        <Text style={[styles.assignmentProgram, { color: bronzeGold }]}>
                          {assignment.program_templates?.name?.toUpperCase() || 'DELETED PROGRAM TEMPLATE'}
                        </Text>
                      </View>

                      {/* Status Badges */}
                      <View style={[
                        styles.statusBadge, 
                        assignment.status === 'active' && { backgroundColor: 'rgba(200, 160, 64, 0.1)', borderColor: bronzeGold },
                        assignment.status === 'paused' && { backgroundColor: 'rgba(255, 152, 0, 0.1)', borderColor: '#FF9800' },
                        assignment.status === 'completed' && { backgroundColor: 'rgba(76, 175, 80, 0.1)', borderColor: '#4CAF50' }
                      ]}>
                        <Text style={[
                          styles.statusBadgeText,
                          assignment.status === 'active' && { color: bronzeGold },
                          assignment.status === 'paused' && { color: '#FF9800' },
                          assignment.status === 'completed' && { color: '#4CAF50' }
                        ]}>
                          {assignment.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.assignedDate, { color: theme.text.tertiary }]}>
                      ASSIGNED ON: {formatDate(assignment.created_at)}
                    </Text>

                    {/* Controls Row */}
                    <View style={[styles.assignmentControls, { borderTopColor: 'rgba(255,255,255,0.03)' }]}>
                      <LinearGradient
                        colors={['#7E57C2', '#FF5252', '#FF7043']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ borderRadius: 6, flex: 1 }}
                      >
                        <TouchableOpacity
                          style={{
                            paddingVertical: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onPress={() => router.push(`/client-dashboard?warriorId=${assignment.warrior_id}&templateId=${assignment.template_id}`)}
                        >
                          <Text style={[styles.controlBtnText, { color: '#FFF' }]}>MANAGE CLIENT</Text>
                        </TouchableOpacity>
                      </LinearGradient>

                      <TouchableOpacity
                        style={[styles.controlBtn, { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: theme.card.border }]}
                        onPress={() => handleOpenEditModal(assignment)}
                      >
                        <Text style={[styles.controlBtnText, { color: theme.text.primary }]}>EDIT STATUS</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.controlBtn, { backgroundColor: 'rgba(255,107,107,0.03)', borderColor: 'rgba(255,107,107,0.2)' }]}
                        onPress={() => handleDeleteClientData(assignment)}
                      >
                        <Text style={[styles.controlBtnText, { color: '#FF6B6B' }]}>DELETE CLIENT</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* EDIT STATUS MODAL */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>UPDATE PROGRAM STATUS</Text>
            
            {activeEditingAssignment && (
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ color: theme.text.secondary, fontSize: 13, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 0.5 }}>
                  WARRIOR: {activeEditingAssignment.profiles?.display_name?.toUpperCase()}
                </Text>
                <Text style={{ color: bronzeGold, fontSize: 12, fontFamily: 'BarlowCondensed-Bold', marginTop: 4 }}>
                  PROGRAM: {activeEditingAssignment.program_templates?.name?.toUpperCase()}
                </Text>
              </View>
            )}

            {/* Status options selections */}
            <View style={styles.statusOptionsContainer}>
              {(['active', 'paused', 'completed'] as const).map(statusOpt => (
                <TouchableOpacity
                  key={statusOpt}
                  style={[
                    styles.statusOptCard,
                    { borderColor: theme.card.border },
                    editStatus === statusOpt && { borderColor: bronzeGold, backgroundColor: 'rgba(200, 160, 64, 0.05)' }
                  ]}
                  onPress={() => setEditStatus(statusOpt)}
                >
                  <Text style={[
                    styles.statusOptText, 
                    { color: theme.text.secondary },
                    editStatus === statusOpt && { color: bronzeGold, fontWeight: 'bold' }
                  ]}>
                    {statusOpt.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { borderColor: theme.card.border }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>CANCEL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: bronzeGold }]}
                onPress={handleUpdateAssignmentStatus}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <LeapLogo size={40} animated />
                ) : (
                  <Text style={{ color: '#000000', fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>SAVE</Text>
                )}
              </TouchableOpacity>
            </View>
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
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
  },
  cardHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 15,
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 20,
    position: 'relative',
  },
  label: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  inputField: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
  },
  selectedPreview: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
  },
  previewName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  previewSubtitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    marginTop: 2,
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  dropdownScroll: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    zIndex: 50,
    borderWidth: 1,
    borderRadius: 6,
    maxHeight: 220,
  },
  noResultText: {
    padding: 16,
    fontSize: 12,
    fontFamily: 'BarlowCondensed-Bold',
    textAlign: 'center',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  avatarCircleMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextMini: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
  },
  dropdownName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  dropdownSub: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    marginTop: 1,
  },
  templateListScroll: {
    flexDirection: 'row',
    width: '100%',
  },
  templateSelectCard: {
    width: 140,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginRight: 10,
  },
  templateSelectName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  templateSelectBlocks: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    marginTop: 6,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  sectionTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 1.5,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  assignmentCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  assignmentWarrior: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  assignmentProgram: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statusBadgeText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  assignedDate: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    marginTop: 10,
  },
  assignmentControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  controlBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  controlBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
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
    marginBottom: 20,
    letterSpacing: 1,
  },
  statusOptionsContainer: {
    gap: 10,
    marginBottom: 24,
  },
  statusOptCard: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    alignItems: 'center',
  },
  statusOptText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
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
});
