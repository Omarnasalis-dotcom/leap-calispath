import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  Linking,
  KeyboardAvoidingView,
  TextInput,
  Alert } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/Input';
import { ExercisePickerModal } from '../../components/coaching/ExercisePickerModal';
import { CopyBlockModal } from '../../components/coaching/CopyBlockModal';
import { BuilderExerciseRow } from '../../components/coaching/BuilderExerciseRow';
import { BuilderBlockCard } from '../../components/coaching/BuilderBlockCard';
import { BuilderDayCard } from '../../components/coaching/BuilderDayCard';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';
import { BlockConceptParser, ConceptMetadata } from '../../lib/BlockConceptParser';
import { BlockConfigWizard } from '../../components/coaching/BlockConfigWizard';


interface ExerciseLibraryItem {
  id: string | number;
  name: string;
  youtube_url: string;
  category: string;
  difficulty: string;
}

export interface SelectedExercise {
  id: string; // client-side unique key
  exercise_id: string | number;
  name: string;
  youtube_url: string;
  sets: string;
  reps: string;
  rest_seconds: string;
  hold_seconds: string;
  notes: string;
  is_weighted?: boolean;
}

export interface ProgramBlock {
  id: string; // client-side unique key
  db_id?: string | number;
  name: string;
  notes: string;
  exercises: SelectedExercise[];
  metadata?: ConceptMetadata;
  week_number?: number;
  previous_log_from_block_id?: string | number;
}

export interface ProgramDay {
  id: string; // client-side unique key
  name: string; // E.g. "Saturday"
  blocks: ProgramBlock[];
  focusTag?: 'PULL' | 'PUSH' | 'LEGS' | 'FULL_BODY' | 'CORE' | 'NONE';
}

interface ProgramWeek {
  weekNumber: number;
  days: ProgramDay[];
}

interface ProgramBuilderScreenProps {
  coachId?: string;
  templateId?: string; // Optional for edit mode
  weekNum?: string; // Optional specific week to edit
  onSave?: () => void;
  onClose?: () => void;
}

export function ProgramBuilderScreen({ coachId: propCoachId, templateId, weekNum, onSave, onClose }: ProgramBuilderScreenProps) {
  const { theme, mode } = useTheme();
  const solidCardBg = mode === 'dark' ? '#151515' : '#FFFFFF';
  const inactiveBorder = mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
  const bronzeGold = '#C8A040';

  // Template State
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(templateId);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [masterTemplates, setMasterTemplates] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [weeks, setWeeks] = useState<Record<number, ProgramDay[]>>({ 1: [] });
  const [activeWeek, setActiveWeek] = useState<number>(weekNum ? parseInt(weekNum, 10) : 1);
  const [coachId, setCoachId] = useState<string | undefined>(propCoachId === 'undefined' ? undefined : propCoachId);

  useEffect(() => {
    if (!coachId) {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.id) setCoachId(data.user.id);
      });
    }
  }, [coachId]);
  const days = weeks[activeWeek] || [];
  const setDays = (updater: ProgramDay[] | ((prev: ProgramDay[]) => ProgramDay[])) => {
    setWeeks(prevWeeks => {
      const currentDays = prevWeeks[activeWeek] || [];
      const newDays = typeof updater === 'function' ? updater(currentDays) : updater;
      return { ...prevWeeks, [activeWeek]: newDays };
    });
  };

  // Page Load State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Accordion State
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});

  const toggleDay = (dayId: string) => setExpandedDays(prev => ({ ...prev, [dayId]: !prev[dayId] }));
  const toggleBlock = (blockId: string) => setExpandedBlocks(prev => ({ ...prev, [blockId]: !prev[blockId] }));
  
  // Athlete Logs State
  const [athleteLogs, setAthleteLogs] = useState<Record<string, string>>({});

  // Exercise Picker Modal State
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [selectedDayIdForAdd, setSelectedDayIdForAdd] = useState<string | null>(null);
  const [selectedBlockIdForAdd, setSelectedBlockIdForAdd] = useState<string | null>(null);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Weekly structure state
  const [useWeeklyStructure, setUseWeeklyStructure] = useState(false);

  // Copy Block Modal State
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [sourceBlock, setSourceBlock] = useState<ProgramBlock | null>(null);
  const [sourceDay, setSourceDay] = useState<ProgramDay | null>(null);
  const [copyView, setCopyView] = useState<'options' | 'day' | 'template'>('options');
  const [otherTemplates, setOtherTemplates] = useState<{ id: string; name: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [targetBlocks, setTargetBlocks] = useState<{ id: string; name: string }[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const categories = ['all', 'push', 'pull', 'legs', 'core', 'skill'];

  useEffect(() => {
    setActiveTemplateId(templateId);
    if (templateId) {
      loadExistingTemplate(templateId);
    } else {
      loadMasterTemplates();
    }
  }, [templateId]);

  async function loadMasterTemplates() {
    setCatalogLoading(true);
    try {
      const { data, error } = await supabase
        .from('program_templates')
        .select('id, name, description')
        .eq('coach_id', coachId)
        .not('name', 'ilike', '[CUSTOM]%')
        .order('name', { ascending: true });

      if (error) throw error;

      const { data: blocksData, error: blocksError } = await supabase
        .from('program_blocks')
        .select('id, template_id');

      if (blocksError) throw blocksError;

      const blockCountMap: Record<string, number> = {};
      (blocksData || []).forEach((b: any) => {
        blockCountMap[b.template_id] = (blockCountMap[b.template_id] || 0) + 1;
      });

      const mapped = (data || []).map((t: any) => ({
        ...t,
        block_count: blockCountMap[t.id] || 0
      }));

      setMasterTemplates(mapped);
    } catch (err: any) {
      console.error('Failed to load master templates:', err);
    } finally {
      setCatalogLoading(false);
    }
  }

  const handleDeleteTemplate = (id: string) => {
    const performDelete = async () => {
      setErrorMsg(null);
      setCatalogLoading(true);
      try {
        const { error } = await supabase
          .from('program_templates')
          .delete()
          .eq('id', id);

        if (error) {
          if (error.code === '23503') {
            throw new Error('THIS MASTER TEMPLATE IS CURRENTLY ASSIGNED TO A WARRIOR AND CANNOT BE DELETED.');
          } else {
            throw error;
          }
        }
        await loadMasterTemplates();
      } catch (err: any) {
        Alert.alert('DELETE FAILED', err.message?.toUpperCase() || 'FAILED TO DELETE TEMPLATE.');
      } finally {
        setCatalogLoading(false);
      }
    };

    Alert.alert(
      'DELETE TEMPLATE',
      'ARE YOU SURE YOU WANT TO DELETE THIS MASTER PROGRAM TEMPLATE? THIS CANNOT BE UNDONE.',
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'DELETE', style: 'destructive', onPress: performDelete }
      ]
    );
  };

  // Load existing template configuration
  async function loadExistingTemplate(tempId: string) {
    if (!tempId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch template general info
      const { data: templateData, error: templateError } = await supabase
        .from('program_templates')
        .select('*')
        .eq('id', tempId)
        .single();

      if (templateError) throw templateError;
      setTemplateName(templateData.name);
      setTemplateDesc(templateData.description || '');

      // 1b. Fetch Athlete Logs if this is an assigned program
      const { data: assignmentData } = await supabase
        .from('warrior_programs')
        .select('warrior_id')
        .eq('template_id', tempId)
        .maybeSingle();
      
      if (assignmentData?.warrior_id) {
        const { data: logsData } = await supabase
          .from('workout_logs')
          .select('block_id, notes')
          .eq('warrior_id', assignmentData.warrior_id);
          
        if (logsData) {
          const logsMap: Record<string, string> = {};
          logsData.forEach((log: any) => {
            if (log.notes) {
              logsMap[log.block_id] = log.notes;
            }
          });
          setAthleteLogs(logsMap);
        }
      }

      // 2. Fetch blocks
      const { data: blocksData, error: blocksError } = await supabase
        .from('program_blocks')
        .select('*')
        .eq('template_id', tempId)
        .order('order_index', { ascending: true });

      if (blocksError) throw blocksError;

      // 3. FIX N+1: Batch Fetch all exercises for all blocks
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
      
      // Group exercises by block_id
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


        const mappedExercises: SelectedExercise[] = (exercisesData || []).map((ex: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          exercise_id: ex.exercise_id,
          name: ex.exercise_library?.name || 'UNNAMED EXERCISE',
          youtube_url: ex.exercise_library?.youtube_url || '',
          sets: String(ex.sets || ''),
          reps: String(ex.reps || ''),
          rest_seconds: String(ex.rest_seconds || ''),
          hold_seconds: ex.hold_seconds ? ex.hold_seconds.toString() : '',
          is_weighted: ex.is_weighted || false,
          notes: ex.notes || ''
        }));

        let dayName = block.name || '';
        let blockName = 'Workout Routine';

        if (dayName.includes(' | ')) {
          const parts = dayName.split(' | ');
          dayName = parts[0].trim();
          blockName = parts.slice(1).join(' | ').trim();
        }

        const parsed = BlockConceptParser.parse(block.notes || '');
        const cleanNotes = parsed.cleanNotes;
        const weekNum = block.week_number || 1;

        const loadedBlock: ProgramBlock = {
          id: String(block.id),
          db_id: block.id,
          name: blockName,
          notes: cleanNotes,
          exercises: mappedExercises,
          metadata: parsed.metadata,
          previous_log_from_block_id: parsed.metadata?.previous_log_from_block_id,
          week_number: weekNum
        };

        const dayKey = dayName.toUpperCase();
        if (!weekDaysMap[weekNum]) {
          weekDaysMap[weekNum] = {};
          weekDayOrder[weekNum] = [];
        }
        if (!weekDaysMap[weekNum][dayKey]) {
          const dayId = Math.random().toString(36).substr(2, 9);
          weekDaysMap[weekNum][dayKey] = {
            id: dayId,
            name: dayName,
            blocks: []
          };
          weekDayOrder[weekNum].push(dayKey);
        }
        weekDaysMap[weekNum][dayKey].blocks.push(loadedBlock);
      }

      for (const weekNumStr of Object.keys(weekDaysMap)) {
        const weekNum = parseInt(weekNumStr, 10);
        newWeeksMap[weekNum] = weekDayOrder[weekNum].map(key => weekDaysMap[weekNum][key]);
      }
      
      if (Object.keys(newWeeksMap).length === 0) {
        newWeeksMap[1] = [];
      }
      setWeeks(newWeeksMap);
      if (weekNum) {
        setActiveWeek(parseInt(weekNum, 10));
      } else {
        setActiveWeek(1);
      }

      const loadedDays: ProgramDay[] = newWeeksMap[weekNum ? parseInt(weekNum, 10) : 1] || [];

      const weekdays = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
      const loadedDayNames = loadedDays.map(d => d.name?.trim().toUpperCase());
      const isWeekly = weekdays.every(w => loadedDayNames.includes(w));
      setUseWeeklyStructure(isWeekly);
    } catch (err: any) {
      setErrorMsg(err.message || 'FAILED TO LOAD WORKOUT PROGRAM TEMPLATE.');
    } finally {
      setLoading(false);
    }
  }

  // Fetch Exercise Library items
  async function fetchExerciseLibrary() {
    setLibraryLoading(true);
    try {
      const { data, error } = await supabase
        .from('exercise_library')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setExerciseLibrary(data || []);
    } catch (err: any) {
      console.error("Failed to load exercise library:", err);
    } finally {
      setLibraryLoading(false);
    }
  }

  const handleOpenPicker = (dayId: string, blockId: string) => {
    setSelectedDayIdForAdd(dayId);
    setSelectedBlockIdForAdd(blockId);
    setPickerModalVisible(true);
    fetchExerciseLibrary();
  };

  const handleAddExerciseToBlock = (item: ExerciseLibraryItem) => {
    if (!selectedDayIdForAdd || !selectedBlockIdForAdd) return;

    setDays(prevDays =>
      prevDays.map(d => {
        if (d.id === selectedDayIdForAdd) {
          return {
            ...d,
            blocks: d.blocks.map(block => {
              if (block.id === selectedBlockIdForAdd) {
                const newEx: SelectedExercise = {
                  id: Math.random().toString(36).substr(2, 9),
                  exercise_id: item.id,
                  name: item.name,
                  youtube_url: item.youtube_url || '',
                  sets: '4',
                  reps: '10',
                  rest_seconds: '90',
                  hold_seconds: '',
                  notes: ''
                };
                return {
                  ...block,
                  exercises: [...block.exercises, newEx]
                };
              }
              return block;
            })
          };
        }
        return d;
      })
    );

    setPickerModalVisible(false);
    setSelectedDayIdForAdd(null);
    setSelectedBlockIdForAdd(null);
  };

  const handleUpdateExerciseValue = (
    dayId: string,
    blockId: string,
    exerciseId: string,
    field: string,
    value: string
  ) => {
    setDays(prevDays =>
      prevDays.map(d => {
        if (d.id === dayId) {
          return {
            ...d,
            blocks: d.blocks.map(block => {
              if (block.id === blockId) {
                return {
                  ...block,
                  exercises: block.exercises.map(ex => (ex.id === exerciseId ? { ...ex, [field]: value } : ex))
                };
              }
              return block;
            })
          };
        }
        return d;
      })
    );
  };

  const handleDeleteExerciseFromBlock = (dayId: string, blockId: string, exerciseId: string) => {
    setDays(prevDays =>
      prevDays.map(d => {
        if (d.id === dayId) {
          return {
            ...d,
            blocks: d.blocks.map(block => {
              if (block.id === blockId) {
                return {
                  ...block,
                  exercises: block.exercises.filter(ex => ex.id !== exerciseId)
                };
              }
              return block;
            })
          };
        }
        return d;
      })
    );
  };

  const handleAddDay = (customName?: string) => {
    const newDay: ProgramDay = {
      id: Math.random().toString(36).substr(2, 9),
      name: customName || `DAY ${days.length + 1}`,
      blocks: [
        {
          id: Math.random().toString(36).substr(2, 9),
          name: 'Workout Routine',
          notes: '',
          exercises: [],
          metadata: { type: 'single', rounds: '4', rest_after_round: '90', timer_seconds: '10' }
        }
      ]
    };
    setDays([...days, newDay]);
  };

  const handleAddBlockToDay = (dayId: string) => {
    setDays(prevDays =>
      prevDays.map(d => {
        if (d.id === dayId) {
          const newBlock: ProgramBlock = {
            id: Math.random().toString(36).substr(2, 9),
            name: `Block ${d.blocks.length + 1}`,
            notes: '',
            exercises: [],
            metadata: { type: 'single', rounds: '4', rest_after_round: '90', timer_seconds: '10' }
          };
          return {
            ...d,
            blocks: [...d.blocks, newBlock]
          };
        }
        return d;
      })
    );
  };

  const handleUpdateDayName = (dayId: string, name: string) => {
    setDays(prevDays =>
      prevDays.map(d => (d.id === dayId ? { ...d, name } : d))
    );
  };

  const handleUpdateDayFocusTag = (dayId: string, focusTag: 'PULL' | 'PUSH' | 'LEGS' | 'FULL_BODY' | 'CORE' | 'NONE') => {
    setDays(prevDays =>
      prevDays.map(d => (d.id === dayId ? { ...d, focusTag } : d))
    );
  };

  const handleUpdateBlockValue = (dayId: string, blockId: string, field: string, value: any) => {
    setDays(prevDays =>
      prevDays.map(d => {
        if (d.id === dayId) {
          return {
            ...d,
            blocks: d.blocks.map(b => (b.id === blockId ? { ...b, [field]: value } : b))
          };
        }
        return d;
      })
    );
  };

  const handleDeleteBlockFromDay = (dayId: string, blockId: string) => {
    setDays(prevDays =>
      prevDays.map(d => {
        if (d.id === dayId) {
          return {
            ...d,
            blocks: d.blocks.filter(b => b.id !== blockId)
          };
        }
        return d;
      })
    );
  };

  const handleDeleteDay = (dayId: string) => {
    setDays(prevDays => prevDays.filter(d => d.id !== dayId));
  };

  const handleToggleWeeklyStructure = (enabled: boolean) => {
    setUseWeeklyStructure(enabled);
    if (enabled) {
      const weekdays = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
      const newDays = [...days];

      while (newDays.length < 7) {
        newDays.push({
          id: Math.random().toString(36).substr(2, 9),
          name: '',
          blocks: [
            {
              id: Math.random().toString(36).substr(2, 9),
              name: 'Workout Routine',
              notes: '',
              exercises: [],
              metadata: { type: 'single', rounds: '4', rest_after_round: '90', timer_seconds: '10' }
            }
          ]
        });
      }

      for (let i = 0; i < 7; i++) {
        newDays[i].name = weekdays[i];
      }

      setDays(newDays);
    }
  };

  const handleOpenCopyModal = (block: ProgramBlock) => {
    setSourceBlock(block);
    const parentDay = days.find(d => d.blocks.some(b => b.id === block.id)) || null;
    setSourceDay(parentDay);
    setCopyView('options');
    setSuccessMessage(null);
    setSelectedTemplateId('');
    setTargetBlocks([]);
    setCopyModalVisible(true);
  };

  const handleOpenCopyDayModal = (dayId: string) => {
    const parentDay = days.find(d => d.id === dayId) || null;
    if (!parentDay) return;
    setSourceBlock(null);
    setSourceDay(parentDay);
    setCopyView('options');
    setSuccessMessage(null);
    setSelectedTemplateId('');
    setTargetBlocks([]);
    setCopyModalVisible(true);
  };

  const handleCopyDay = (targetBlockId: string, targetWeek?: number) => {
    if (!sourceBlock) return;
    const weekToUpdate = targetWeek || activeWeek;
    
    setWeeks(prev => {
      const prevWeekDays = prev[weekToUpdate] || [];
      const updatedDays = prevWeekDays.map(d => ({
        ...d,
        blocks: d.blocks.map(block => {
          if (block.id === targetBlockId) {
            const duplicatedExercises = sourceBlock.exercises.map(ex => ({
              ...ex,
              id: Math.random().toString(36).substr(2, 9)
            }));
            return {
              ...block,
              exercises: [...block.exercises, ...duplicatedExercises]
            };
          }
          return block;
        })
      }));
      return { ...prev, [weekToUpdate]: updatedDays };
    });
    
    showSuccessMessage('EXERCISES COPIED SUCCESSFULLY!');
  };

  const handleCopyDayToDay = (sourceDayId: string, targetWeek?: number) => {
    if (!sourceDay) return;
    const weekToUpdate = targetWeek || activeWeek;
    
    const duplicatedBlocks = sourceDay.blocks.map(block => ({
      ...block,
      id: Math.random().toString(36).substr(2, 9),
      db_id: undefined,
      previous_log_from_block_id: block.db_id || block.id,
      exercises: block.exercises.map(ex => ({
        ...ex,
        id: Math.random().toString(36).substr(2, 9)
      }))
    }));
    const newDay: ProgramDay = {
      id: Math.random().toString(36).substr(2, 9),
      name: sourceDay.name + ' (COPY)',
      blocks: duplicatedBlocks,
      focusTag: sourceDay.focusTag
    };
    
    setWeeks(prev => {
      const prevWeekDays = prev[weekToUpdate] || [];
      return { ...prev, [weekToUpdate]: [...prevWeekDays, newDay] };
    });
    
  };

  const handleDeleteWeek = () => {
    Alert.alert(
      "DELETE WEEK",
      `ARE YOU SURE YOU WANT TO DELETE WEEK ${activeWeek}? THIS WILL REMOVE ALL DAYS AND BLOCKS IN THIS WEEK.`,
      [
        { text: "CANCEL", style: "cancel" },
        { 
          text: "DELETE", 
          style: "destructive",
          onPress: () => {
            setWeeks(prev => {
              const maxW = Math.max(...Object.keys(prev).map(k => parseInt(k, 10)));
              const newWeeks = { ...prev };
              delete newWeeks[activeWeek];
              
              // Shift subsequent weeks down
              for (let w = activeWeek + 1; w <= maxW; w++) {
                if (newWeeks[w]) {
                  newWeeks[w - 1] = newWeeks[w];
                  delete newWeeks[w];
                }
              }
              // Ensure we always have at least Week 1
              if (Object.keys(newWeeks).length === 0) {
                newWeeks[1] = [];
              }
              return newWeeks;
            });
            
            setActiveWeek(prev => {
              const nextWeek = prev > 1 ? prev - 1 : 1;
              return nextWeek;
            });
            showSuccessMessage(`WEEK ${activeWeek} DELETED SUCCESSFULLY`);
          }
        }
      ]
    );
  };

  const fetchOtherTemplates = async () => {
    if (!coachId || coachId === 'undefined') return;
    try {
      let query = supabase
        .from('program_templates')
        .select('id, name')
        .eq('coach_id', coachId);
        
      if (templateId && templateId !== 'undefined' && templateId !== 'new') {
        query = query.neq('id', templateId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOtherTemplates(data || []);
    } catch (err) {
      console.error('Failed to load other templates:', err);
    }
  };

  const fetchTargetBlocksForTemplate = async (tempId: string) => {
    try {
      setSelectedTemplateId(tempId);
      const { data, error } = await supabase
        .from('program_blocks')
        .select('id, name')
        .eq('template_id', tempId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setTargetBlocks(data || []);
    } catch (err) {
      console.error('Failed to load blocks for target template:', err);
    }
  };

  const handleCopyTemplate = async (targetBlockDbId: string | number) => {
    if (!sourceBlock) return;
    try {
      if (sourceBlock.exercises.length > 0) {
        const { data: existingExs } = await supabase
          .from('block_exercises')
          .select('id')
          .eq('block_id', targetBlockDbId);

        const startIndex = existingExs ? existingExs.length : 0;

        const exerciseInserts = sourceBlock.exercises.map((ex, exIdx) => ({
          block_id: targetBlockDbId,
          exercise_id: ex.exercise_id,
          sets: parseInt(ex.sets) || null,
          reps: ex.reps.trim(),
          rest_seconds: parseInt(ex.rest_seconds) || null,
          hold_seconds: parseInt(ex.hold_seconds) || null,
          notes: ex.notes.trim(),
          order_index: startIndex + exIdx
        }));

        const { error } = await supabase
          .from('block_exercises')
          .insert(exerciseInserts);

        if (error) throw error;
      }
      showSuccessMessage('EXERCISES COPIED TO TEMPLATE SUCCESSFULLY!');
    } catch (err: any) {
      Alert.alert('ERROR', err.message?.toUpperCase() || 'FAILED TO COPY TO TEMPLATE.');
    }
  };

  const showSuccessMessage = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
      setCopyModalVisible(false);
      setSourceBlock(null);
      setCopyView('options');
    }, 2000);
  };

  const handleMoveDay = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= days.length) return;

    const newDays = [...days];
    const temp = newDays[index];
    newDays[index] = newDays[targetIndex];
    newDays[targetIndex] = temp;
    setDays(newDays);
  };

  const handleMoveBlockWithinDay = (dayId: string, index: number, direction: 'up' | 'down') => {
    setDays(prevDays =>
      prevDays.map(d => {
        if (d.id === dayId) {
          const targetIndex = direction === 'up' ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= d.blocks.length) return d;

          const newBlocks = [...d.blocks];
          const temp = newBlocks[index];
          newBlocks[index] = newBlocks[targetIndex];
          newBlocks[targetIndex] = temp;
          return {
            ...d,
            blocks: newBlocks
          };
        }
        return d;
      })
    );
  };

  // Main Save Template function
  const handleSaveTemplate = async () => {
    setErrorMsg(null);
    if (!templateName.trim()) {
      setErrorMsg('PROGRAM TEMPLATE NAME IS REQUIRED.');
      return;
    }

    // Pre-process weeks to purge ghosts and validate
    let hasValidWeek = false;
    const validWeeks: Record<number, ProgramDay[]> = {};

    for (const weekNumStr of Object.keys(weeks)) {
      const weekNum = parseInt(weekNumStr, 10);
      const weekDays = weeks[weekNum];
      
      // Calculate total blocks in this week
      const totalBlocks = weekDays.reduce((sum, d) => sum + d.blocks.length, 0);
      
      if (totalBlocks === 0) {
        continue; // Purge ghost week completely
      }
      
      // If the week is NOT empty, verify every day has at least one block
      for (const d of weekDays) {
        if (d.blocks.length === 0) {
          setErrorMsg(`WEEK ${weekNum} - DAY "${d.name.toUpperCase()}" MUST HAVE AT LEAST ONE WORKOUT BLOCK. PLEASE ADD A BLOCK OR DELETE THE DAY.`);
          return;
        }
      }
      
      validWeeks[weekNum] = weekDays;
      hasValidWeek = true;
    }

    if (!hasValidWeek) {
      setErrorMsg('AT LEAST ONE VALID WEEK WITH WORKOUT BLOCKS MUST BE ADDED.');
      return;
    }

    setLoading(true);
    try {
      let currentTemplateId = activeTemplateId;

      // 1. Insert or Update general program template details
      if (currentTemplateId) {
        const { error } = await supabase
          .from('program_templates')
          .update({
            name: templateName.trim(),
            description: templateDesc.trim()
          })
          .eq('id', currentTemplateId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('program_templates')
          .insert({
            name: templateName.trim(),
            description: templateDesc.trim(),
            coach_id: coachId
          })
          .select('id')
          .single();

        if (error) throw error;
        currentTemplateId = data.id;
      }

      // Identify which blocks are currently in the UI
      const currentBlockIds = Object.values(validWeeks)
        .flatMap(weekDays => weekDays.flatMap(d => d.blocks.map(b => b.db_id)))
        .filter(Boolean);

      // If we are in edit mode, carefully delete removed blocks and wipe old exercises
      if (activeTemplateId) {
        const { data: previousBlocks } = await supabase
          .from('program_blocks')
          .select('id')
          .eq('template_id', activeTemplateId);

        if (previousBlocks && previousBlocks.length > 0) {
          const allPreviousBlockIds = previousBlocks.map((b: any) => b.id);
          
          // Always wipe exercises safely to avoid manual diffing
          await supabase.from('block_exercises').delete().in('block_id', allPreviousBlockIds);

          // Find blocks that were DELETED by the coach in the UI
          const blockIdsToDelete = allPreviousBlockIds.filter(id => !currentBlockIds.includes(id));
          
          if (blockIdsToDelete.length > 0) {
            // Attempt to delete. If they have workout_logs attached, this will fail. We ignore the error safely.
            await supabase.from('program_blocks').delete().in('id', blockIdsToDelete);
          }
        }
      }

      // 2. Flatten and Insert blocks and block exercises in correct ordering sequence
      let blockIdx = 0;
      for (const weekNumStr of Object.keys(validWeeks)) {
        const weekNum = parseInt(weekNumStr, 10);
        const weekDays = validWeeks[weekNum];
        
        for (const d of weekDays) {
          for (const block of d.blocks) {
            const combinedName = `${d.name.trim()} | ${block.name.trim() || 'Workout Routine'}`;

            const metadata = block.metadata || { type: 'single', rounds: '4', rest_after_round: '90', timer_seconds: '10' };
            if (d.focusTag) {
              metadata.focus_tag = d.focusTag;
            } else {
              delete metadata.focus_tag;
            }
            if (block.previous_log_from_block_id) {
              metadata.previous_log_from_block_id = block.previous_log_from_block_id;
            } else {
              delete metadata.previous_log_from_block_id;
            }
            const serializedNotes = BlockConceptParser.stringify(metadata, block.notes);

            const blockPayload: any = {
              template_id: currentTemplateId,
              name: combinedName,
              notes: serializedNotes,
              order_index: blockIdx,
              week_number: weekNum
            };

            if (block.db_id) {
              blockPayload.id = block.db_id;
            }

            const { data: savedBlock, error: blockInsertError } = await supabase
              .from('program_blocks')
              .upsert(blockPayload)
              .select('id')
              .single();

            if (blockInsertError) throw blockInsertError;

          // Insert exercises for the block
          if (block.exercises.length > 0) {
            const exerciseInserts = block.exercises.map((ex, exIdx) => ({
              block_id: savedBlock.id,
              exercise_id: ex.exercise_id,
              sets: parseInt(ex.sets) || null,
              reps: ex.reps.trim(),
              rest_seconds: parseInt(ex.rest_seconds) || null,
              hold_seconds: parseInt(ex.hold_seconds) || null,
              is_weighted: ex.is_weighted || false,
              notes: ex.notes.trim(),
              order_index: exIdx
            }));

            const { error: exercisesInsertError } = await supabase
              .from('block_exercises')
              .insert(exerciseInserts);

            if (exercisesInsertError) throw exercisesInsertError;
          }
          blockIdx++;
          }
        }
      }

      setIsCreatingNew(false);
      setActiveTemplateId(undefined);
      router.back();
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO SAVE WORKOUT PROGRAM.');
    } finally {
      setLoading(false);
    }
  };

  const filteredLibrary = exerciseLibrary.filter((ex: ExerciseLibraryItem) => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || ex.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background.primary }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* HEADER BAR */}
        <View style={{
          alignItems: 'center',
          paddingTop: Platform.OS === 'ios' ? 40 : 10,
          paddingBottom: 12,
        }}>
          {/* Centered Logo Branding */}
          <Text style={{
            fontFamily: 'BarlowCondensed-ExtraBold',
            fontSize: 30,
            letterSpacing: 4,
            color: theme.text.primary,
            textAlign: 'center'
          }}>
            P R O G R Ʌ M
          </Text>
          <Text style={{
            fontFamily: 'BarlowCondensed-ExtraBold',
            fontSize: 12,
            letterSpacing: 2.5,
            color: bronzeGold,
            textAlign: 'center',
            marginTop: -2
          }}>
            B U I L D E R
          </Text>
        </View>

        {/* Close & Catalog capsule buttons */}
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 16 }}>
          {/* BACK TO DASHBOARD BUTTON (When editing specific client's week) */}
          {templateId ? (
            <LinearGradient
              colors={['#7E57C2', '#FF5252', '#FF7043']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ padding: 1.2, borderRadius: 13 }}
            >
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  backgroundColor: solidCardBg,
                  paddingVertical: 4,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  height: 24,
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <Text style={{
                  fontFamily: 'BarlowCondensed-ExtraBold',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: bronzeGold
                }}>
                  ◀ BACK
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          ) : null}

          {/* CATALOG CLOSE BUTTON (When editing master templates) */}
          {(activeTemplateId || isCreatingNew) && !templateId && (
            <LinearGradient
              colors={['#7E57C2', '#FF5252', '#FF7043']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ padding: 1.2, borderRadius: 13 }}
            >
              <TouchableOpacity
                onPress={() => {
                  setActiveTemplateId(undefined);
                  setIsCreatingNew(false);
                  loadMasterTemplates();
                }}
                style={{
                  backgroundColor: solidCardBg,
                  paddingVertical: 4,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  height: 24,
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <Text style={{
                  fontFamily: 'BarlowCondensed-ExtraBold',
                  fontSize: 9,
                  letterSpacing: 1.5,
                  color: bronzeGold
                }}>
                  CATALOG
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          )}
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
            <Text style={[styles.loadingText, { color: theme.text.secondary }]}>PROCESSING TEMPLATE DATA...</Text>
          </View>
        ) : !activeTemplateId && !isCreatingNew ? (
          /* TEMPLATE CATALOG SELECTION SCREEN */
          <View style={{ width: '100%', gap: 20 }}>
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* CREATE NEW TEMPLATE CARD */}
            <LinearGradient
              colors={['#7E57C2', '#FF5252', '#FF7043']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ padding: 1.2, borderRadius: 12 }}
            >
              <TouchableOpacity
                style={[styles.createNewCard, { backgroundColor: solidCardBg, borderWidth: 0, borderRadius: 11 }]}
                onPress={() => {
                  setTemplateName('');
                  setTemplateDesc('');
                  setDays([]);
                  setUseWeeklyStructure(false);
                  setIsCreatingNew(true);
                }}
              >
                <Text style={[styles.createNewCardText, { color: theme.text.primary }]}>+ CREATE NEW MASTER TEMPLATE</Text>
              </TouchableOpacity>
            </LinearGradient>

            <View style={{ gap: 12, marginTop: 10 }}>
              <Text style={[styles.sectionTitleStyle, { color: theme.text.primary }]}>
                SAVED MASTER TEMPLATES
              </Text>

              {catalogLoading ? (
                <LeapLogo size={40} animated />
              ) : masterTemplates.length === 0 ? (
                <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
                  <Text style={{ color: theme.text.secondary, fontSize: 13 }}>
                    NO MASTER TEMPLATES SAVED YET.
                  </Text>
                </View>
              ) : (
                masterTemplates.map((t) => (
                  <LinearGradient
                    key={t.id}
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ padding: 1.2, borderRadius: 12, marginBottom: 12 }}
                  >
                    <View
                      style={[styles.catalogCardItem, { backgroundColor: solidCardBg, borderColor: 'transparent', borderRadius: 11, marginBottom: 0 }]}
                    >
                      <View style={{ flex: 1, marginRight: 16 }}>
                        <Text style={[styles.catalogCardName, { color: theme.text.primary }]}>
                          {t.name.toUpperCase()}
                        </Text>
                        <Text style={[styles.catalogCardCount, { color: bronzeGold }]}>
                          {t.block_count} WORKOUT BLOCKS / DAYS
                        </Text>
                        {t.description ? (
                          <Text style={{ color: theme.text.tertiary, fontSize: 12, marginTop: 6 }} numberOfLines={2}>
                            {t.description}
                          </Text>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.catalogCardEditBtn, { borderColor: bronzeGold }]}
                          onPress={() => {
                            setActiveTemplateId(t.id);
                            loadExistingTemplate(t.id);
                          }}
                        >
                          <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>EDIT</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.catalogCardDelBtn, { borderColor: 'rgba(255,107,107,0.2)' }]}
                          onPress={() => handleDeleteTemplate(t.id)}
                        >
                          <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>DELETE</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </LinearGradient>
                ))
              )}
            </View>
          </View>
        ) : (
          <View style={{ width: '100%', gap: 20 }}>
            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* PROGRAM DETAILS */}
            <View style={[styles.sectionCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.text.primary }]}>PROGRAM DETAILS</Text>
              <Input
                label="PROGRAM NAME"
                placeholder="E.G. 12-WEEK STRENGTH SYSTEM"
                value={templateName}
                onChangeText={setTemplateName}
              />
              <View style={styles.inputContainerStyle}>
                <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>PROGRAM DESCRIPTION</Text>
                <TextInput
                  style={[
                    styles.textareaStyle,
                    {
                      backgroundColor: theme.card.background,
                      borderColor: theme.card.border,
                      color: theme.text.primary,
                    }
                  ]}
                  value={templateDesc}
                  onChangeText={(val: string) => setTemplateDesc(val)}
                  placeholder="Describe the target outcomes, focus areas, and instructions..."
                  placeholderTextColor={theme.text.tertiary}
                  multiline={true}
                  numberOfLines={3}
                />
              </View>

              {/* WEEKLY STRUCTURE TOGGLE */}
              <View style={[styles.toggleContainer, { borderTopColor: theme.card.border }]}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleTitle, { color: theme.text.primary }]}>USE WEEKLY STRUCTURE</Text>
                    <Text style={[styles.toggleDesc, { color: theme.text.secondary }]}>
                      Organize workout blocks by days of the week (Saturday - Friday).
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleWeeklyStructure(!useWeeklyStructure)}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={useWeeklyStructure ? ['#7E57C2', '#FF5252', '#FF7043'] : [inactiveBorder, inactiveBorder]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        width: 46,
                        height: 26,
                        borderRadius: 13,
                        padding: 2,
                        justifyContent: 'center'
                      }}
                    >
                      <View style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: '#FFFFFF',
                        alignSelf: useWeeklyStructure ? 'flex-end' : 'flex-start',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 2,
                        elevation: 2
                      }} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* WEEK NAVIGATOR */}
            <View style={{ marginBottom: 24 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
                {Object.keys(weeks).map((weekStr) => {
                  const wNum = parseInt(weekStr, 10);
                  const isActive = wNum === activeWeek;
                  return (
                    <TouchableOpacity
                      key={wNum}
                      onPress={() => setActiveWeek(wNum)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 16,
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
                        WEEK {wNum}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => {
                    const maxW = Math.max(...Object.keys(weeks).map(k => parseInt(k, 10)));
                    const nextW = maxW + 1;
                    
                    const prevDays = weeks[maxW] || [];
                    const clonedDays: ProgramDay[] = prevDays.map(d => ({
                      id: Math.random().toString(36).substr(2, 9),
                      name: d.name,
                      blocks: d.blocks.map(b => ({
                        id: Math.random().toString(36).substr(2, 9),
                        previous_log_from_block_id: b.db_id || b.id,
                        name: b.name,
                        notes: b.notes,
                        exercises: b.exercises.map(ex => ({
                          ...ex,
                          id: Math.random().toString(36).substr(2, 9)
                        })),
                        metadata: b.metadata
                      }))
                    }));

                    setWeeks(prev => ({ ...prev, [nextW]: clonedDays }));
                    setActiveWeek(nextW);
                  }}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.1)',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <Text style={{
                    fontFamily: 'BarlowCondensed-Bold',
                    fontSize: 14,
                    color: theme.text.primary
                  }}>
                    + DUPLICATE LAST WEEK
                  </Text>
                </TouchableOpacity>

                {/* Delete Week Action */}
                {Math.max(...Object.keys(weeks).map(k => parseInt(k, 10))) > 1 && (
                  <TouchableOpacity
                    onPress={handleDeleteWeek}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      borderRadius: 20,
                      backgroundColor: 'rgba(255,82,82,0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,82,82,0.5)',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{
                      fontFamily: 'BarlowCondensed-Bold',
                      fontSize: 14,
                      color: '#FF5252'
                    }}>
                      - DELETE WEEK {activeWeek}
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {/* BLOCKS SECTION */}
            <View style={{ gap: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>PROGRAM DAYS & BLOCKS</Text>
                {!useWeeklyStructure && (
                  <LinearGradient
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ padding: 1.2, borderRadius: 12 }}
                  >
                    <TouchableOpacity
                      style={{
                        backgroundColor: solidCardBg,
                        borderRadius: 11,
                        paddingVertical: 5,
                        paddingHorizontal: 12,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() => handleAddDay()}
                    >
                      <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 }}>+ ADD DAY</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                )}
              </View>

              {days.length === 0 ? (
                <View style={[styles.emptyCard, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                  <Text style={[styles.emptyCardText, { color: theme.text.secondary }]}>
                    NO DAYS ADDED YET. CLICK '+ ADD DAY' TO START BUILDING.
                  </Text>
                </View>
              ) : (
                days.map((day, dayIdx) => (
                  <BuilderDayCard
                    key={day.id}
                    day={day}
                    dayIdx={dayIdx}
                    daysLength={days.length}
                    theme={theme}
                    mode={mode as "light" | "dark"}
                    bronzeGold={bronzeGold}
                    solidCardBg={solidCardBg}
                    inactiveBorder={inactiveBorder}
                    useWeeklyStructure={useWeeklyStructure}
                    expandedDays={expandedDays}
                    toggleDay={toggleDay}
                    handleUpdateDayName={handleUpdateDayName}
                    handleUpdateDayFocusTag={handleUpdateDayFocusTag}
                    handleDeleteDay={handleDeleteDay}
                    handleMoveDay={handleMoveDay}
                    handleAddBlockToDay={handleAddBlockToDay}
                    expandedBlocks={expandedBlocks}
                    athleteLogs={athleteLogs}
                    toggleBlock={toggleBlock}
                    handleUpdateBlockValue={handleUpdateBlockValue}
                    handleUpdateExerciseValue={handleUpdateExerciseValue}
                    handleDeleteExerciseFromBlock={handleDeleteExerciseFromBlock}
                    handleOpenPicker={handleOpenPicker}
                    handleMoveBlockWithinDay={handleMoveBlockWithinDay}
                    handleOpenCopyModal={handleOpenCopyModal}
                    handleOpenCopyDayModal={handleOpenCopyDayModal}
                    handleDeleteBlockFromDay={handleDeleteBlockFromDay}
                  />
                ))
        )}
      </View>

            {/* SAVE TRIGGER */}
            <View style={{ marginTop: 24, paddingBottom: 40 }}>
              <Button
                title={templateId ? "UPDATE WORKOUT PROGRAM" : "SAVE PROGRAM TEMPLATE"}
                onPress={handleSaveTemplate}
                loading={loading}
              />
            </View>
          </View>
        )}
      </ScrollView>

      <ExercisePickerModal
        visible={pickerModalVisible}
        onClose={() => { setPickerModalVisible(false); setSelectedBlockIdForAdd(null); }}
        onSelectExercise={handleAddExerciseToBlock}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        exerciseLibrary={exerciseLibrary}
        libraryLoading={libraryLoading}
        categories={categories}
      />

      <CopyBlockModal
        visible={copyModalVisible}
        onClose={() => { setCopyModalVisible(false); setSourceBlock(null); setSourceDay(null); }}
        sourceBlock={sourceBlock}
        sourceDay={sourceDay}
        copyView={copyView}
        setCopyView={setCopyView}
        days={days}
        weeks={weeks}
        activeWeek={activeWeek}
        otherTemplates={otherTemplates}
        targetBlocks={targetBlocks}
        selectedTemplateId={selectedTemplateId}
        setSelectedTemplateId={setSelectedTemplateId}
        successMessage={successMessage}
        coachId={coachId}
        onCopyDay={handleCopyDay}
        onCopyDayToDay={handleCopyDayToDay}
        onFetchOtherTemplates={fetchOtherTemplates}
        onFetchTargetBlocks={fetchTargetBlocksForTemplate}
        onCopyTemplate={handleCopyTemplate}
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
    paddingVertical: 80,
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
  sectionCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
  },
  sectionLabel: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 14,
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    letterSpacing: 1,
  },
  addBlockBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
  },
  addBlockBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  emptyCardText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  blockCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  blockTitleInput: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    letterSpacing: 1,
    padding: 0,
  },
  blockReorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reorderBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBlockBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(255,107,107,0.1)',
  },
  deleteBlockBtnText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  blockNotesInput: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  exerciseRow: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
    marginBottom: 8,
  },
  exInfoCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exTitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 10,
  },
  ytLink: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },
  exInputsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  exInputsGridCustom: {
    flexDirection: 'row',
    gap: 12,
  },
  exInputCol: {
    flex: 1,
  },
  exInputLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  exField: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    textAlign: 'center',
  },
  exNotesField: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
  },
  exDeleteBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  exDeleteBtnText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  addExerciseTrigger: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addExerciseTriggerText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
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
    maxWidth: 480,
    padding: 24,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 24,
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1,
  },
  searchInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    marginBottom: 12,
  },
  modalFilterScroll: {
    flexDirection: 'row',
    marginBottom: 16,
    width: '100%',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
  },
  chipText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerItemName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  pickerItemBadge: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    marginTop: 2,
  },
  pickerYtIcon: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  emptyText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    textAlign: 'center',
  },
  inputContainerStyle: {
    marginBottom: 16,
  },
  inputLabelStyle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  textareaStyle: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  toggleContainer: {
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  toggleTitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  toggleDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  copyBlockBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(200, 160, 64, 0.1)',
  },
  copyBlockBtnText: {
    color: '#C8A040',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  copyOptionCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  copyOptionTitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  copyOptionDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    marginTop: 4,
  },
  targetBlockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    width: '100%',
  },
  createNewCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200, 160, 64, 0.03)',
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  createNewCardText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  sectionTitleStyle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    letterSpacing: 1,
    marginBottom: 8,
  },
  catalogCardItem: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  catalogCardName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  catalogCardCount: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  catalogCardEditBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogCardDelBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
