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
import { NotificationService } from '../../services/NotificationService';
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
import { useSafeMutation } from '../useSafeMutation';
import {
  fetchMasterTemplateExportPayload,
  shareMasterTemplateExportPayload,
  buildMasterTemplateBlocksPayload,
} from '../../lib/MasterTemplateTransfer';
import { validateWeekImportPayload, resolveImportedExercises } from '../../lib/ProgramImportParser';


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

export function useProgramBuilder(templateId?: string, propCoachId?: string, weekNum?: string, onSaveSuccess?: () => void) {
  const coachId = propCoachId;

  // Template State
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(templateId);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [masterTemplates, setMasterTemplates] = useState<any[]>([]);
  const [assignedTemplates, setAssignedTemplates] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [weeks, setWeeks] = useState<Record<number, ProgramDay[]>>({ 1: [] });
  const [activeWeek, setActiveWeek] = useState<number>(weekNum ? parseInt(weekNum, 10) : 1);
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

  // Master template export/import (catalog-level, not tied to any warrior)
  const [exportingTemplateId, setExportingTemplateId] = useState<string | null>(null);
  const [importingTemplate, setImportingTemplate] = useState(false);

  const categories = ['all', 'push', 'pull', 'legs', 'core', 'skill'];

  const { safeMutate } = useSafeMutation();

  useEffect(() => {
    setActiveTemplateId(templateId);
    if (templateId) {
      loadExistingTemplate(templateId);
    } else if (coachId) {
      // Guarded on coachId, and coachId is now a dependency — on first
      // mount coachId (derived from auth user) can still be resolving,
      // which previously fired this with coachId=undefined and crashed
      // the catalog query (Postgres 22P02: invalid uuid "undefined").
      // Now it waits, then fires once coachId actually arrives.
      loadMasterTemplates();
    }
  }, [templateId, coachId]);

  async function loadMasterTemplates() {
    if (!coachId) return;
    setCatalogLoading(true);
    try {
      // is_library_template = false excludes anything living in the
      // Templates Library (Coaching Center's LIBRARY tab) — those are
      // managed there exclusively, never mixed into this Builder catalog.
      const { data, error } = await supabase
        .from('program_templates')
        .select('id, name, description')
        .eq('coach_id', coachId)
        .eq('is_library_template', false)
        .order('name', { ascending: true });

      if (error) throw error;

      const templateIds = (data || []).map((t: any) => t.id);

      const { data: blocksData, error: blocksError } = templateIds.length
        ? await supabase
            .from('program_blocks')
            .select('id, template_id')
            .in('template_id', templateIds)
        : { data: [], error: null };

      if (blocksError) throw blocksError;

      const blockCountMap: Record<string, number> = {};
      (blocksData || []).forEach((b: any) => {
        blockCountMap[b.template_id] = (blockCountMap[b.template_id] || 0) + 1;
      });

      // A template that's been assigned to a client is a clone
      // (assign_program_template always creates a brand new
      // program_templates row rather than pointing at the source) — so
      // "does some warrior_programs row reference this id" reliably tells
      // apart a reusable master template from a one-off assigned copy,
      // regardless of what it's named.
      const { data: assignmentsData, error: assignmentsError } = templateIds.length
        ? await supabase
            .from('warrior_programs')
            .select('template_id')
            .in('template_id', templateIds)
        : { data: [], error: null };

      if (assignmentsError) throw assignmentsError;

      const assignedIds = new Set((assignmentsData || []).map((a: any) => a.template_id));

      const mapped = (data || []).map((t: any) => ({
        ...t,
        block_count: blockCountMap[t.id] || 0
      }));

      setMasterTemplates(mapped.filter((t: any) => !assignedIds.has(t.id)));
      setAssignedTemplates(mapped.filter((t: any) => assignedIds.has(t.id)));
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
      await safeMutate(async () => {
        const { error } = await supabase
          .from('program_templates')
          .delete()
          .eq('id', id);

        if (error) {
          if (error.code === '23503') {
            throw new Error('THIS MASTER TEMPLATE IS CURRENTLY ASSIGNED TO A WARRIOR AND CANNOT BE DELETED.');
          }
          return { error };
        }
        return { data: null, error: null };
      }, {
        onSuccess: () => {
          loadMasterTemplates();
          setCatalogLoading(false);
        },
        onError: (err) => {
          Alert.alert('DELETE FAILED', err.message?.toUpperCase() || 'FAILED TO DELETE TEMPLATE.');
          setCatalogLoading(false);
        },
        // "Assigned to a client" is an expected, already-messaged outcome of
        // trying to delete an in-use template, not a bug — don't trigger the
        // dev-mode redbox for it.
        skipConsoleError: true
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm('ARE YOU SURE YOU WANT TO DELETE THIS MASTER PROGRAM TEMPLATE? THIS CANNOT BE UNDONE.')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'DELETE TEMPLATE',
        'ARE YOU SURE YOU WANT TO DELETE THIS MASTER PROGRAM TEMPLATE? THIS CANNOT BE UNDONE.',
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'DELETE', style: 'destructive', onPress: performDelete }
        ]
      );
    }
  };

  const handleExportMasterTemplate = async (templateId: string, name: string, description: string) => {
    setExportingTemplateId(templateId);
    try {
      const payload = await fetchMasterTemplateExportPayload(templateId, name, description);
      await shareMasterTemplateExportPayload(payload, name);
    } catch (err: any) {
      console.error('Failed to export master template:', err);
      Alert.alert('EXPORT FAILED', err.message?.toUpperCase() || 'FAILED TO EXPORT TEMPLATE.');
    } finally {
      setExportingTemplateId(null);
    }
  };

  const handleImportMasterTemplate = async () => {
    if (!coachId) return;
    setImportingTemplate(true);
    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || !result.assets?.[0]) {
        setImportingTemplate(false);
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

      const templateName = (parsed.template_name || 'IMPORTED TEMPLATE').toString();
      const description = (parsed.description || '').toString();

      const resolved = await resolveImportedExercises(parsed.blocks, coachId);
      const blocks = buildMasterTemplateBlocksPayload(parsed, resolved);

      const { data: result2, error } = await supabase.rpc('save_program_template', {
        p_template_id: null,
        p_name: templateName,
        p_description: description,
        p_blocks: blocks,
      });
      if (error) throw error;
      if (!result2?.success) {
        throw new Error('Failed to save imported template.');
      }

      Alert.alert('IMPORTED', `Created "${templateName}" with ${validation.blockCount} block(s).`);
      await loadMasterTemplates();
    } catch (err: any) {
      console.error('Failed to import master template:', err);
      Alert.alert('IMPORT FAILED', err.message?.toUpperCase() || 'FAILED TO IMPORT TEMPLATE.');
    } finally {
      setImportingTemplate(false);
    }
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

      // 1b. Fetch Athlete Logs if this is a custom assigned program
      if (templateData.name.startsWith('[CUSTOM]')) {
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
          hold_seconds: String(ex.hold_seconds || ''),
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
            blocks: [],
            focusTag: parsed.metadata.focus_tag,
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
    const performDelete = () => setDays(prevDays =>
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
    if (Platform.OS === 'web') {
      if (window.confirm('ARE YOU SURE YOU WANT TO DELETE THIS BLOCK? THIS WILL REMOVE ALL ITS EXERCISES.')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'DELETE BLOCK',
        'ARE YOU SURE YOU WANT TO DELETE THIS BLOCK? THIS WILL REMOVE ALL ITS EXERCISES.',
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'DELETE', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const handleDeleteDay = (dayId: string) => {
    const performDelete = () => setDays(prevDays => prevDays.filter(d => d.id !== dayId));
    if (Platform.OS === 'web') {
      if (window.confirm('ARE YOU SURE YOU WANT TO DELETE THIS DAY? THIS WILL REMOVE ALL BLOCKS AND EXERCISES IN IT.')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'DELETE DAY',
        'ARE YOU SURE YOU WANT TO DELETE THIS DAY? THIS WILL REMOVE ALL BLOCKS AND EXERCISES IN IT.',
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'DELETE', style: 'destructive', onPress: performDelete },
        ]
      );
    }
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

  const handleCopyDay = (targetBlockId: string, targetWeek?: number) => {
    if (!sourceBlock) return;
    const weekToUpdate = targetWeek || activeWeek;
    setWeeks(prevWeeks => {
      const prevDays = prevWeeks[weekToUpdate] || [];
      const updatedDays = prevDays.map(d => ({
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
      return { ...prevWeeks, [weekToUpdate]: updatedDays };
    });
    showSuccessMessage('EXERCISES COPIED SUCCESSFULLY!');
  };

  const handleDuplicateBlockToDay = (targetDayId: string, targetWeek?: number) => {
    if (!sourceBlock) return;
    const weekToUpdate = targetWeek || activeWeek;
    setWeeks(prevWeeks => {
      const prevDays = prevWeeks[weekToUpdate] || [];
      const updatedDays = prevDays.map(d => {
        if (d.id === targetDayId) {
          const duplicatedExercises = sourceBlock.exercises.map(ex => ({
            ...ex,
            id: Math.random().toString(36).substr(2, 9)
          }));
          const newBlock: ProgramBlock = {
            ...sourceBlock,
            id: Math.random().toString(36).substr(2, 9),
            db_id: undefined,
            name: sourceBlock.name + ' (COPY)',
            exercises: duplicatedExercises
          };
          return {
            ...d,
            blocks: [...d.blocks, newBlock]
          };
        }
        return d;
      });
      return { ...prevWeeks, [weekToUpdate]: updatedDays };
    });
    showSuccessMessage('BLOCK DUPLICATED SUCCESSFULLY!');
  };

  const handleCopyDayToDay = (sourceDayId: string, targetWeek?: number) => {
    if (!sourceDay) return;
    const weekToUpdate = targetWeek || activeWeek;
    const duplicatedBlocks = sourceDay.blocks.map(block => ({
      ...block,
      id: Math.random().toString(36).substr(2, 9),
      db_id: undefined,
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
    setWeeks(prevWeeks => {
      const prevDays = prevWeeks[weekToUpdate] || [];
      return { ...prevWeeks, [weekToUpdate]: [...prevDays, newDay] };
    });
  };

  const fetchOtherTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('program_templates')
        .select('id, name')
        .eq('coach_id', coachId)
        .neq('id', templateId || '');

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
    await safeMutate(async () => {
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
          reps: parseInt(ex.reps) || null,
          rest_seconds: parseInt(ex.rest_seconds) || null,
          hold_seconds: parseInt(ex.hold_seconds) || null,
          notes: ex.notes.trim(),
          order_index: startIndex + exIdx
        }));

        const { error } = await supabase
          .from('block_exercises')
          .insert(exerciseInserts);

        if (error) return { error };
      }
      return { data: null, error: null };
    }, {
      onSuccess: () => showSuccessMessage('EXERCISES COPIED TO TEMPLATE SUCCESSFULLY!'),
      errorMessage: 'FAILED TO COPY TO TEMPLATE.'
    });
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
        for (const block of d.blocks) {
          const emptyIdx = block.exercises.findIndex((ex) => !ex.exercise_id);
          if (emptyIdx !== -1) {
            setErrorMsg(`WEEK ${weekNum} - "${d.name.toUpperCase()}" > "${(block.name.trim() || 'Workout Routine').toUpperCase()}", ROW ${emptyIdx + 1}: NO EXERCISE SELECTED. PICK ONE OR REMOVE THE ROW BEFORE SAVING.`);
            return;
          }
        }
      }
      
      validWeeks[weekNum] = weekDays;
      hasValidWeek = true;
    }

    if (!hasValidWeek) {
      setErrorMsg('AT LEAST ONE VALID WEEK WITH WORKOUT BLOCKS MUST BE ADDED.');
      return;
    }

    // Flatten weeks/days/blocks into one ordered array — the RPC does the
    // actual upsert/delete/insert atomically, so this is pure payload-building.
    const blocksPayload: any[] = [];
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
          const serializedNotes = BlockConceptParser.stringify(metadata, block.notes);

          blocksPayload.push({
            db_id: block.db_id || null,
            name: combinedName,
            notes: serializedNotes,
            order_index: blockIdx,
            week_number: weekNum,
            exercises: block.exercises.map((ex, exIdx) => ({
              exercise_id: ex.exercise_id,
              sets: parseInt(ex.sets) || null,
              reps: parseInt(ex.reps) || null,
              rest_seconds: parseInt(ex.rest_seconds) || null,
              hold_seconds: parseInt(ex.hold_seconds) || null,
              notes: ex.notes.trim(),
              order_index: exIdx
            }))
          });
          blockIdx++;
        }
      }
    }

    setLoading(true);
    await safeMutate(async () => {
      const { data: result, error } = await supabase.rpc('save_program_template', {
        p_template_id: activeTemplateId || null,
        p_name: templateName.trim(),
        p_description: templateDesc.trim(),
        p_blocks: blocksPayload
      });

      if (error) return { error };
      if (!result?.success) {
        return { error: new Error(result?.error === 'NOT_FOUND' ? 'Template not found.' : 'Failed to save workout program.') };
      }

      return { data: result, error: null };
    }, {
      onSuccess: (result: any) => {
        setIsCreatingNew(false);
        setActiveTemplateId(undefined);
        setLoading(false);

        if (result?.week_increased && result?.warrior_program_id) {
          NotificationService.notifyClientProgramUpdate(result.warrior_program_id, 'week_unlocked');
        }

        const undeletableCount = result?.undeletable_block_ids?.length || 0;
        if (undeletableCount > 0) {
          Alert.alert(
            'Some blocks were kept',
            `${undeletableCount} removed block${undeletableCount > 1 ? 's' : ''} couldn't be deleted because warrior(s) already have logged history against ${undeletableCount > 1 ? 'them' : 'it'}. Everything else saved successfully.`
          );
        }

        if (onSaveSuccess) {
          onSaveSuccess();
        } else {
          router.back();
        }
      },
      onError: (err) => {
        setErrorMsg(err.message?.toUpperCase() || 'FAILED TO SAVE WORKOUT PROGRAM.');
        setLoading(false);
      }
    });
  };

  const filteredLibrary = exerciseLibrary.filter((ex: ExerciseLibraryItem) => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || ex.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleDeleteWeek = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`ARE YOU SURE YOU WANT TO DELETE WEEK ${activeWeek}? THIS WILL REMOVE ALL DAYS AND BLOCKS IN THIS WEEK.`)) {
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
    } else {
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
    }
  };

  const handleOpenCopyDayModal = (dayId: string) => {
    const day = days.find(d => d.id === dayId);
    if (day) {
      setSourceDay(day);
      setCopyView('day');
      setCopyModalVisible(true);
    }
  };

  return {
    state: {
      activeTemplateId, setActiveTemplateId,
      isCreatingNew, setIsCreatingNew,
      masterTemplates, setMasterTemplates,
      assignedTemplates, setAssignedTemplates,
      catalogLoading, setCatalogLoading,
      templateName, setTemplateName,
      templateDesc, setTemplateDesc,
      weeks, setWeeks,
      activeWeek, setActiveWeek,
      days, setDays,
      loading, setLoading,
      errorMsg, setErrorMsg,
      expandedDays, setExpandedDays,
      expandedBlocks, setExpandedBlocks,
      athleteLogs, setAthleteLogs,
      pickerModalVisible, setPickerModalVisible,
      selectedDayIdForAdd, setSelectedDayIdForAdd,
      selectedBlockIdForAdd, setSelectedBlockIdForAdd,
      exerciseLibrary, setExerciseLibrary,
      filteredLibrary,
      libraryLoading, setLibraryLoading,
      searchQuery, setSearchQuery,
      selectedCategory, setSelectedCategory,
      useWeeklyStructure, setUseWeeklyStructure,
      copyModalVisible, setCopyModalVisible,
      sourceBlock, setSourceBlock,
      sourceDay, setSourceDay,
      copyView, setCopyView,
      otherTemplates, setOtherTemplates,
      selectedTemplateId, setSelectedTemplateId,
      targetBlocks, setTargetBlocks,
      successMessage, setSuccessMessage,
      exportingTemplateId,
      importingTemplate,
      coachId
    },
    actions: {
      loadMasterTemplates,
      handleDeleteTemplate,
      handleExportMasterTemplate,
      handleImportMasterTemplate,
      loadExistingTemplate,
      fetchExerciseLibrary,
      handleOpenPicker,
      toggleDay,
      toggleBlock,
      handleOpenCopyDayModal,
      handleAddExerciseToBlock,
      handleUpdateExerciseValue,
      handleDeleteExerciseFromBlock,
      handleAddDay,
      handleAddBlockToDay,
      handleUpdateDayName,
      handleUpdateDayFocusTag,
      handleUpdateBlockValue,
      handleDeleteBlockFromDay,
      handleDeleteDay,
      handleToggleWeeklyStructure,
      handleOpenCopyModal,
      handleCopyDay,
      handleDuplicateBlockToDay,
      handleCopyDayToDay,
      fetchOtherTemplates,
      fetchTargetBlocksForTemplate,
      handleCopyTemplate,
      showSuccessMessage,
      handleMoveDay,
      handleMoveBlockWithinDay,
      handleSaveTemplate,
      handleDeleteWeek
    }
  };
}
