import { useRouter, useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useAuth } from '../../contexts/AuthContext';
import { getSubscriptionTier, meetsMinTier } from '../../lib/entitlement';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { LeapLogo } from '../../components/LeapLogo';
import { BlockConceptParser, ConceptMetadata } from '../../lib/BlockConceptParser';
import { SoundServiceInstance } from '../../lib/SoundService';
import { WarriorExerciseRow } from '../../components/coaching/WarriorExerciseRow';
import { WarriorBlockCard } from '../../components/coaching/WarriorBlockCard';
import { LogBlockSheet, SheetCard, SheetKind } from '../../components/coaching/LogBlockSheet';
import { useWarriorTimer, TabataHold } from '../../hooks/useWarriorTimer';
import { WarriorTimerModal } from '../../components/coaching/WarriorTimerModal';
import { ProgramIdentityCard, ProgramLoadPanel, WeekNavigator } from '../../components/coaching/WarriorProgramSections';
import { UpgradeToSaveModal } from '../../components/workoutLibrary/SharedWorkoutModals';
import { selectLibraryTemplate } from '../../lib/templateLibrary';
import { GlobalErrorBoundary } from '../../components/GlobalErrorBoundary';
import { BodyweightCheckInModal } from '../../components/coaching/BodyweightCheckInModal';
import { SessionCompleteScreen } from '../../components/coaching/SessionCompleteScreen';
import { SetLogEntry } from '../../components/coaching/SetRow';
import { parseKg } from '../../lib/parseKg';
import { Feel } from '../../components/coaching/FeelRpePicker';
import { NotificationService } from '../../services/NotificationService';
import { MissedReason } from '../../components/coaching/MissedReasonPicker';
import { ForTimeResult } from '../../components/coaching/ForTimeInlineTimer';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DayBlocksProgressRing } from '../../components/coaching/DayBlocksProgressRing';
import type { ExerciseDetail, ProgramBlock, ProgramDay } from '../../types/warriorProgram';
import { parseBlockName, deriveDayStates, estimateSessionMinutes, countMovements, inferBlockAccent, deriveNextDayIndex, summarizeWeekSessions } from '../../lib/warriorProgramDays';
import { DayCardList } from '../../components/coaching/DayCardList';
import { t, FLIP_X } from '../../i18n';
import { localizedErrorText } from '../../lib/asyncErrorHandler';

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
  // Set from the Journey lane's "START NOW" (see app/warrior-program.tsx) --
  // jumps straight into that day's exercise-logging UI on load instead of
  // landing on the day list first. Index is within the current week (the
  // one current_week resolves to), since that's the only week whose
  // active/locked states the lane's day cards can actually reflect.
  autoStartDayIndex?: number;
  // Also from the lane: overrides what SessionCompleteScreen's own "DONE"
  // does. Default behavior (screen entered normally) is to drop back to
  // this screen's own day list; entered from the journey route, DONE
  // should return to the lane instead.
  onSessionDone?: () => void;
}

// Customize Program / Ready Template flows both assign warrior_programs
// under this system profile (see MilestoneLaneScreen's own copy of this
// constant) rather than a real coach — only those are eligible for
// self-service week extension via add_week_to_own_program.
const LEAP_SYSTEM_PROFILE_ID = '00000000-0000-0000-0000-000000000001';

// In-progress set logging saved on-device so it survives the app being
// killed mid-workout (see the restore/save effects in the component).
const SET_PROGRESS_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const setProgressStorageKey = (warriorProgramId: string) => `workout_set_progress_v1:${warriorProgramId}`;

// "Running" day view (dbRunnerStyles below) was fixed dark-only — same
// relationship-preservation split as DB_COLORS/PD_COLORS elsewhere.
interface DBRPalette {
  backBtnBg: string;
  title: string;
  metaLine: string;
  tickMissed: string;
  tickScheduled: string;
  restBtnBg: string;
  restBtnBorder: string;
  restBtnIcon: string;
  // Sticky footer's fade into the screen background (theme.background.primary).
  footerFade: [string, string, string];
}

const DBR_COLORS: { dark: DBRPalette; light: DBRPalette } = {
  dark: {
    backBtnBg: '#141414',
    title: '#FFFFFF',
    metaLine: '#a0a0a0',
    tickMissed: '#3a3a3a',
    tickScheduled: '#1f1f1f',
    restBtnBg: '#141414',
    restBtnBorder: 'transparent',
    restBtnIcon: '#fff',
    footerFade: ['rgba(0,0,0,0)', 'rgba(0,0,0,.94)', '#000'],
  },
  light: {
    backBtnBg: 'rgba(0,0,0,.03)',
    title: '#2A2A2A',
    metaLine: '#8A8A8A',
    tickMissed: '#E8C4C4',
    tickScheduled: '#EAE0E0',
    restBtnBg: '#FFFFFF',
    restBtnBorder: 'rgba(0,0,0,.08)',
    restBtnIcon: '#2A2A2A',
    footerFade: ['rgba(250,250,250,0)', 'rgba(250,250,250,.94)', '#FAFAFA'],
  },
};

export function WarriorProgramScreen({ warriorId, onClose, autoStartDayIndex, onSessionDone }: WarriorProgramScreenProps) {
  const { theme, mode } = useTheme();
  const { profile, paywallEnabled, refreshProfile } = useAuth();
  const bronzeGold = '#C8A040';
  const solidCardBg = mode === 'dark' ? '#151515' : '#FFFFFF';
  const dbr = DBR_COLORS[mode];
  const dbRunnerStyles = getDbRunnerStyles(dbr);

  // State Management
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [programName, setProgramName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [warriorProgramId, setWarriorProgramId] = useState<string>('');
  const [coachId, setCoachId] = useState<string | null>(null);
  const [minAccessTier, setMinAccessTier] = useState<'first' | 'pro' | null>(null);
  const [endingProgram, setEndingProgram] = useState(false);
  const [addingWeek, setAddingWeek] = useState(false);

  // Soft paywall gate for the "locked by tier" upgrade CTA below — same
  // pattern as CustomizeProgramScreen/ProgramTemplatesScreen/
  // QuickWorkoutScreen's UpgradeToSaveModal usage, this screen's own copy
  // of the ref/state scaffolding since it previously bounced straight to
  // /paywall with no in-between step.
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const upgradingRef = useRef(false);
  const pendingPaywallNavRef = useRef(false);
  // loadWarriorProgram() reloads on every mutation (block toggles, add-week,
  // etc.), not just the initial mount -- autoStartDayIndex should only ever
  // jump into the running view once per distinct index, not shove the user
  // back into it after they've already navigated elsewhere within this
  // screen. Tracks the last-applied index (not just a boolean) because expo
  // router reuses this screen instance across pushes with a new startDay
  // param (e.g. Journey lane day 1 -> back -> day 2) -- a plain "already
  // applied" flag would ignore the new day entirely and re-land on the old one.
  const autoStartAppliedRef = useRef<number | null>(null);
  const requestPaywallAfterModalCloses = () => {
    if (Platform.OS === 'ios') {
      pendingPaywallNavRef.current = true;
    } else {
      router.push('/paywall');
    }
  };
  const handleUpgradeModalDismissed = () => {
    if (!pendingPaywallNavRef.current) return;
    pendingPaywallNavRef.current = false;
    router.push('/paywall');
  };
  // Timer completion unmounts WarriorTimerModal; showing the log Modal in
  // that same commit swaps two native Modal transactions at once — the
  // Android Fabric "specified child already has a parent" crash (fixed the
  // same way in 4461569). One frame later the timer Modal is gone.
  const openLogModalAfterTimerCloses = () => {
    requestAnimationFrame(() => setLogModalVisible(true));
  };

  const [weeksData, setWeeksData] = useState<Record<number, ProgramDay[]>>({ 1: [] });
  const [activeWeek, setActiveWeek] = useState<number>(1);
  const days = weeksData[activeWeek] || [];
  // "ADD NEW WEEK" surfaces right here too (not just the Journey lane) once
  // the warrior finishes every day of their last built week — mirrors
  // MilestoneLaneScreen's own canAddWeek/weekComplete gating so both
  // entry points agree on when a Customize/Template program is extendable.
  const weekNumbers = Object.keys(weeksData).map(Number);
  const maxWeek = weekNumbers.length ? Math.max(...weekNumbers) : 1;
  const isLastWeekDone = days.length > 0 && deriveDayStates(days).every(d => d.status === 'done');
  const canAddWeek = activeWeek === maxWeek && isLastWeekDone && coachId === LEAP_SYSTEM_PROFILE_ID;
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

  // Reps/kg typed into sets that were never ticked, keyed blockId ->
  // exerciseId -> setIndex. A draft with a weight counts as done when the
  // block is logged (blockSetEntries), so the kg isn't lost for want of ✓.
  const [blockSetDrafts, setBlockSetDrafts] = useState<Record<string | number, Record<string | number, Record<number, SetLogEntry>>>>({});

  const handleSetDraft = (blockId: string | number, exerciseId: string | number, entry: SetLogEntry) => {
    setBlockSetDrafts(prev => {
      const blockEntry = prev[blockId] || {};
      return { ...prev, [blockId]: { ...blockEntry, [exerciseId]: { ...(blockEntry[exerciseId] || {}), [entry.setIndex]: entry } } };
    });
  };

  // Ticked sets plus unticked sets that have a weight typed in.
  const blockSetEntries = (blockId: string | number): Record<string | number, SetLogEntry[]> => {
    const merged: Record<string | number, SetLogEntry[]> = {};
    Object.entries(blockSetProgress[blockId] || {}).forEach(([exId, entries]) => {
      merged[exId] = [...entries];
    });
    Object.entries(blockSetDrafts[blockId] || {}).forEach(([exId, drafts]) => {
      const list = merged[exId] || [];
      Object.values(drafts).forEach((d) => {
        if (d.weight && d.weight > 0 && !list.some((s) => s.setIndex === d.setIndex)) list.push(d);
      });
      if (list.length > 0) merged[exId] = list;
    });
    return merged;
  };

  // Heaviest kg across the block's sets (or one exercise's sets), pre-filled
  // as the log modal's "Weight used" so the athlete doesn't type it twice.
  const topSetWeight = (blockId: string | number, exerciseId?: string | number): string => {
    const entries = blockSetEntries(blockId);
    const sets = exerciseId !== undefined ? entries[exerciseId] || [] : Object.values(entries).flat();
    const top = Math.max(0, ...sets.map((s) => s.weight ?? 0));
    return top > 0 ? String(top) : '';
  };

  // Log modal's per-exercise kg, for blocks with 2+ weighted exercises.
  const [logExerciseWeights, setLogExerciseWeights] = useState<Record<string, string>>({});
  const setLogExerciseWeight = (exerciseId: string, val: string) =>
    setLogExerciseWeights(prev => ({ ...prev, [exerciseId]: val }));

  const weightedExercisesOf = (blockId: string | number) =>
    (days.flatMap(d => d.blocks).find(b => b.id === blockId)?.exercises || []).filter(ex => ex.is_weighted);

  const topSetWeightsByExercise = (blockId: string | number): Record<string, string> =>
    Object.fromEntries(weightedExercisesOf(blockId).map(ex => [String(ex.id), topSetWeight(blockId, ex.id)]));

  // ---------- Log Block sheet (design_handoff_log_workout_sheet) ----------
  // Per-exercise choices made in the sheet. Only overrides are stored; the
  // defaults come from sheetModel (ticked count / full plan, heaviest ticked
  // kg, planned hold).
  const [sheetCounts, setSheetCounts] = useState<Record<string, number>>({});
  const [sheetTouched, setSheetTouched] = useState<Record<string, boolean>>({});
  const [sheetTopKg, setSheetTopKg] = useState<Record<string, number>>({});
  const [sheetHoldSecs, setSheetHoldSecs] = useState<Record<string, number>>({});
  const [sheetAmrap, setSheetAmrap] = useState({ rounds: 0, reps: 0 });
  const [sheetForTime, setSheetForTime] = useState({ min: 0, sec: 0, cap: false });
  const [sheetCapText, setSheetCapText] = useState<string | null>(null);
  const [sheetNoteOpen, setSheetNoteOpen] = useState(false);
  const [sheetPhase, setSheetPhase] = useState<'form' | 'saving' | 'saved'>('form');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetSummary, setSheetSummary] = useState('');
  // Ladder: the rung tapped in the inline logger (null = none tapped, the
  // sheet then asks) plus its extra reps and the logger's result text.
  const [sheetLadder, setSheetLadder] = useState<{ index: number | null; extra: number; summary: string }>({
    index: null,
    extra: 0,
    summary: '',
  });

  /** Block type, round structure and one card per exercise (or one card for
   * a circuit/superset's rounds), mirroring WarriorBlockCard's rules. */
  const sheetModel = (blockId: string | number | null) => {
    const block = blockId == null ? undefined : days.flatMap(d => d.blocks).find(b => b.id === blockId);
    const meta = block?.metadata || {};
    const timing = meta.timing_system;
    const structure = meta.structure || meta.type;
    const isLadder = structure === 'ladder';
    const kind: SheetKind =
      isLadder ? 'ladder'
      : timing === 'amrap' || meta.type === 'amrap' ? 'amrap'
      : timing === 'fortime' || meta.type === 'fortime' ? 'fortime'
      : timing === 'tabata' ? 'timer'
      : 'sets';
    const isRounds = structure === 'circuit' || structure === 'superset';
    const entered = blockId == null ? {} : blockSetEntries(blockId);
    const exercises = (block?.exercises || []).map(ex => {
      const reps = parseInt(String(ex.reps ?? ''), 10);
      const hold = parseInt(String(ex.hold_seconds ?? ''), 10);
      return {
        ex,
        id: String(ex.id),
        reps: Number.isNaN(reps) || reps <= 0 ? null : reps,
        hold: Number.isNaN(hold) || hold <= 0 ? null : hold,
        done: entered[String(ex.id)] || [],
      };
    // Sets blocks: only exercises with a planned number get a card. Tabata:
    // every exercise does (most are timed by the work interval, with no
    // reps or hold), so the athlete confirms the rounds they did.
    }).filter(e => kind === 'timer' || e.reps !== null || e.hold !== null);

    let cards: SheetCard[] = [];
    if (kind === 'sets' && isRounds && exercises.length > 0) {
      const rounds = Math.max(1, parseInt(String(meta.rounds || '1'), 10) || 1);
      let ticked = 0;
      while (ticked < rounds && exercises.every(e => e.done.some(d => d.setIndex === ticked + 1))) ticked++;
      cards = [{
        id: 'rounds',
        name: exercises.map(e => e.ex.name).join(' · '),
        plan: rounds,
        ticked,
        repsLabel: null,
        weighted: false,
        hold: false,
      }];
    } else if (kind === 'timer') {
      // Tabata: one card per exercise, one tile per round (each exercise
      // works once a round). Default = the rounds the timer ran.
      const rounds = Math.max(1, parseInt(String(meta.tabata_rounds || '8'), 10) || 8);
      const work = parseInt(String(meta.tabata_work_seconds || '20'), 10) || 20;
      cards = exercises.map(e => ({
        id: e.id,
        name: e.ex.name,
        plan: rounds,
        ticked: 0,
        repsLabel: e.hold !== null ? null : e.reps !== null ? t('logSheet.repsShort', { n: e.reps }) : t('progress.secondsShort', { n: work }),
        weighted: false,
        hold: e.hold !== null,
        defaultCount: Math.min(rounds, timerRoundsFor(blockId) ?? rounds),
        // Rounds are confirmed, never "counted as planned" from the sheet.
        roundsStatus: true,
      }));
    } else if (kind === 'sets') {
      cards = exercises.map(e => ({
        id: e.id,
        name: e.ex.name,
        plan: Math.max(1, parseInt(String(e.ex.sets ?? '1'), 10) || 1),
        ticked: e.done.length,
        repsLabel: e.reps !== null ? t('logSheet.repsShort', { n: e.reps }) : null,
        weighted: !!e.ex.is_weighted && e.hold === null,
        hold: e.hold !== null,
      }));
    }
    // Ladder: one card, one tile per rung (e.g. 10 · 8 · 6 · 4). Default =
    // the rung tapped in the logger, or the full ladder if none was.
    const rungs = kind === 'ladder' ? BlockConceptParser.getLadderRungs(meta) : [];
    if (kind === 'ladder' && rungs.length > 0) {
      cards = [{
        id: 'ladder',
        name: (block?.exercises || []).map(ex => ex.name).join(' · '),
        plan: rungs.length,
        ticked: 0,
        repsLabel: null,
        weighted: false,
        hold: false,
        tileLabels: rungs.map(r => String(r)),
        defaultCount: sheetLadder.index !== null ? sheetLadder.index + 1 : rungs.length,
      }];
    }
    const topKgDefault: Record<string, number> = {};
    const holdDefault: Record<string, number> = {};
    exercises.forEach(e => {
      const typed = Math.max(0, ...e.done.map(d => d.weight ?? 0));
      const popup = parseKg(logExerciseWeights[e.id] ?? '') ?? (weightedExercisesOf(blockId ?? '').length === 1 ? parseKg(logWeightUsed) : undefined);
      topKgDefault[e.id] = typed > 0 ? typed : popup && popup > 0 ? popup : 0;
      // Tabata: the best hold logged in the timer for this exercise.
      const logged = timerHoldsFor(blockId).filter(h => String(h.exerciseId) === e.id).map(h => h.seconds);
      if (e.hold !== null) holdDefault[e.id] = kind === 'timer' && logged.length > 0 ? Math.max(...logged) : e.hold;
    });
    return { block, kind, isRounds, cards, exercises, topKgDefault, holdDefault, rungs };
  };

  // Survive the app being killed mid-workout (audit 2026-09-25, L15): set
  // progress only reached the server when a whole block was logged, so a
  // phone call or low-memory kill lost every set ticked so far. Kept per
  // program in device storage; restored for up to 12h, and only for blocks
  // that still aren't logged. Saving starts only after the restore read has
  // finished, so the empty initial state can't overwrite saved progress.
  const setProgressRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || !warriorProgramId || setProgressRestoredRef.current) return;
    const key = setProgressStorageKey(warriorProgramId);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { savedAt?: number; progress?: typeof blockSetProgress };
        if (!saved?.progress || !saved.savedAt || Date.now() - saved.savedAt > SET_PROGRESS_MAX_AGE_MS) return;
        const openBlockIds = new Set(
          Object.values(weeksData)
            .flat()
            .flatMap((d) => d.blocks)
            .filter((b) => b.completedStatus === 'none')
            .map((b) => String(b.id))
        );
        const restored = Object.fromEntries(
          Object.entries(saved.progress).filter(([blockId]) => openBlockIds.has(String(blockId)))
        );
        if (Object.keys(restored).length > 0) {
          setBlockSetProgress((prev) => ({ ...restored, ...prev }));
        }
      })
      .catch(() => {
        // Unreadable/corrupt saved progress — start fresh, never block the screen.
      })
      .finally(() => {
        setProgressRestoredRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, warriorProgramId]);

  useEffect(() => {
    if (!setProgressRestoredRef.current || !warriorProgramId) return;
    const key = setProgressStorageKey(warriorProgramId);
    const hasProgress = Object.values(blockSetProgress).some((sets) => Object.keys(sets).length > 0);
    (hasProgress
      ? AsyncStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), progress: blockSetProgress }))
      : AsyncStorage.removeItem(key)
    ).catch(() => {});
  }, [blockSetProgress, warriorProgramId]);

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
  const [pendingHoldTimes, setPendingHoldTimes] = useState<TabataHold[]>([]);
  // Tabata rounds the timer ran to (null: stopped early / not from the timer).
  const [pendingTabataRounds, setPendingTabataRounds] = useState<number | null>(null);
  // The block the pending timer holds/rounds came from: they're only ever
  // used for that block, so closing its sheet unsaved and logging another
  // block can't carry them into the wrong log.
  const [pendingTimerBlockId, setPendingTimerBlockId] = useState<string | number | null>(null);
  const timerHoldsFor = (blockId: string | number | null) =>
    blockId != null && String(blockId) === String(pendingTimerBlockId) ? pendingHoldTimes : [];
  const timerRoundsFor = (blockId: string | number | null) =>
    blockId != null && String(blockId) === String(pendingTimerBlockId) ? pendingTabataRounds : null;
  const [logFeel, setLogFeel] = useState<Feel | null>(null);
  const [logRpe, setLogRpe] = useState<number | null>(null);
  const [logMissedReason, setLogMissedReason] = useState<MissedReason | null>(null);
  const [logMissedDetail, setLogMissedDetail] = useState('');
  // This program's latest workout_logs row per block_id — marks the block
  // done on any later day (not just the day it was logged) and lets
  // "EDIT LOG" pre-fill the modal with what was actually saved instead of
  // opening blank and forcing the warrior to redo the whole entry.
  // first_logged_at is the block's oldest log, so a re-log replaces it.
  const [loggedDetails, setLoggedDetails] = useState<Record<string, {
    notes: string; feel: string | null; rpe: number | null;
    missed_reason: string | null; missed_detail: string | null;
    first_logged_at: string;
    // The latest log's per-set rows, by block_exercise_id. Re-saving a log
    // replaces its sets, so reopening it puts these back into
    // blockSetProgress — otherwise they'd be deleted on save.
    saved_sets: Record<string, SetLogEntry[]>;
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

  // Cutoff for toggle_block_status/log_block_with_sets, which delete the
  // block's logs from this time on before saving the new one: the start of
  // today, or earlier when the block was already logged on a previous day,
  // so changing that log replaces it instead of adding a second one.
  const replaceLogsSince = (blockId: string | number): string => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const firstLoggedAt = loggedDetails[blockId]?.first_logged_at;
    return firstLoggedAt && new Date(firstLoggedAt) < startOfToday
      ? firstLoggedAt
      : startOfToday.toISOString();
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
      unaddressedCount === 1 ? t('workout.blocksNotLoggedOne') : t('workout.blocksNotLoggedMany', { count: unaddressedCount }),
      t('workout.blocksNotLoggedBody'),
      [
        { text: t('workout.review'), style: 'cancel' },
        {
          text: t('workout.continueAnyway'),
          onPress: async () => {
            await Promise.all(unaddressedBlocks.map(b => handleToggleBlockStatus(b.id, 'missed')));
            setShowSessionComplete(true);
          },
        },
      ]
    );
  };

  const currentTier = getSubscriptionTier(profile, paywallEnabled);
  const isLockedByTier = !!minAccessTier && !meetsMinTier(currentTier, minAccessTier);

  const handleEndLockedProgram = () => {
    Alert.alert(
      t('workout.deleteProgramTitle'),
      t('workout.deleteProgramBody'),
      [
        { text: t('workout.cancel'), style: 'cancel' },
        {
          text: t('workout.deleteAndChoose'),
          style: 'destructive',
          onPress: async () => {
            setEndingProgram(true);
            try {
              const { error } = await supabase.rpc('end_active_program');
              if (error) throw error;
              router.replace('/program-templates');
            } catch (err: any) {
              Alert.alert(t('workout.error'), localizedErrorText(err, t('workout.endFailed')));
            } finally {
              setEndingProgram(false);
            }
          },
        },
      ]
    );
  };

  // Faster path back for a free-tier athlete whose locked program used to
  // be a paid AI Coach feature: select_library_template already completes
  // whatever program is currently active before creating the new one, so
  // there's no separate "end program" step needed here — unlike
  // handleEndLockedProgram's fallback below, which still routes through
  // Program Templates because there's no free_library_template_id to
  // restore yet.
  const handleRestoreFreeTemplate = async () => {
    if (!profile?.free_library_template_id) return;
    setEndingProgram(true);
    try {
      await selectLibraryTemplate(profile.free_library_template_id);
      await Promise.all([loadWarriorProgram(), refreshProfile()]);
    } catch (err: any) {
      Alert.alert(t('workout.error'), localizedErrorText(err, t('workout.restoreFailed')));
    } finally {
      setEndingProgram(false);
    }
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
      Alert.alert(t('workout.error'), localizedErrorText(err, t('workout.bodyweightFailed')));
    } finally {
      setBodyweightSaving(false);
    }
  };

  const handleClose = () => {
    if (activeTimerBlock !== null) {
      if (Platform.OS === 'web') {
        if (window.confirm(t('workout.activeWorkoutBody'))) {
          setActiveTimerBlock(null);
          if (onClose) onClose();
        }
      } else {
        Alert.alert(
          t('workout.activeWorkoutTitle'),
          t('workout.activeWorkoutBody'),
          [
            { text: t('workout.stay'), style: 'cancel', onPress: () => {} },
            {
              text: t('workout.leave'),
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

  // Day Blocks design: every block starts collapsed when the athlete enters
  // 'running' for a given day — they choose which one to open (via
  // toggleBlockExpanded, or the footer's START/RESUME CTA). Deliberately not
  // re-run on every block-status change within the same day (that would
  // re-collapse whatever the athlete has open after every log), only when
  // the phase/day itself changes.
  useEffect(() => {
    if (screenPhase !== 'running' || !activeDay) return;
    setExpandedBlocks({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenPhase, activeDayIndex, activeWeek]);


  // Main loader for assigned program and completion state
  async function loadWarriorProgram() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Batch A: none of these three depend on each other's results, so fire
      // them together instead of one-at-a-time. This was previously a fully
      // sequential 6-query waterfall (profiles -> warrior_programs ->
      // program_week_archive -> program_blocks -> workout_logs ->
      // block_exercises) — on a mobile connection with ~200-300ms per round
      // trip that's 1.5-2s of pure network latency before any data shows up.
      // Only program_week_archive/program_blocks (need activeTemplateId) and
      // block_exercises (needs the resulting block ids) have a real
      // dependency chain — see batches B and C below.
      const [profileRes, assignmentRes, loggedRes] = await Promise.all([
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
              description,
              min_access_tier
            )
          `)
          .eq('warrior_id', warriorId)
          .eq('status', 'active')
          .maybeSingle(),
        // Every log, not just today's: a block stays done after the day it
        // was logged. Filtered to the active program below (its id isn't
        // known yet), oldest first so the latest log per block wins.
        supabase
          .from('workout_logs')
          .select('block_id, warrior_program_id, notes, feel, rpe, missed_reason, missed_detail, completed_at, workout_set_logs(block_exercise_id, set_index, reps_completed, weight_used)')
          .eq('warrior_id', warriorId)
          .order('completed_at', { ascending: true }),
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
        router.replace('/program-templates');
        return;
      }

      const templatesInfo: any = actualAssignment.program_templates;
      const progName = Array.isArray(templatesInfo)
        ? templatesInfo[0]?.name
        : templatesInfo?.name;
      const minTier = Array.isArray(templatesInfo)
        ? templatesInfo[0]?.min_access_tier
        : templatesInfo?.min_access_tier;
      setMinAccessTier(minTier || null);

      const coachInfo: any = actualAssignment.profiles;
      const cName = Array.isArray(coachInfo)
        ? coachInfo[0]?.display_name
        : coachInfo?.display_name;

      const activeTemplateId = actualAssignment.template_id;
      setProgramName(progName || t('workout.assignedProgram'));
      setCoachName(cName || t('workout.coach'));
      setTemplateId(activeTemplateId);
      setWarriorProgramId(actualAssignment.id);
      setCoachId(actualAssignment.coach_id || null);

      const { data: loggedRows, error: loggedError } = loggedRes;
      if (loggedError) throw loggedError;

      const programLogs = (loggedRows || []).filter((l: any) => l.warrior_program_id === actualAssignment.id);
      const firstLoggedAt = new Map<string, string>();
      for (const l of programLogs) {
        if (!firstLoggedAt.has(l.block_id)) firstLoggedAt.set(l.block_id, l.completed_at);
      }
      const loggedBlockMap = new Map(programLogs.map((l: any) => [l.block_id, l.notes || '']));
      setLoggedDetails(Object.fromEntries(
        programLogs.map((l: any) => [l.block_id, {
          notes: l.notes || '',
          feel: l.feel,
          rpe: l.rpe,
          missed_reason: l.missed_reason,
          missed_detail: l.missed_detail,
          first_logged_at: firstLoggedAt.get(l.block_id) ?? l.completed_at,
          saved_sets: ((l.workout_set_logs || []) as any[]).reduce((acc: Record<string, SetLogEntry[]>, s: any) => {
            // Hold-time rows have no exercise and no reps; they can't be
            // put back on a set row.
            if (!s.block_exercise_id || s.reps_completed == null) return acc;
            const key = String(s.block_exercise_id);
            (acc[key] = acc[key] || []).push({
              setIndex: s.set_index,
              reps: s.reps_completed,
              weight: s.weight_used != null ? Number(s.weight_used) : undefined,
            });
            return acc;
          }, {}),
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
            name: lib?.name || t('workout.unnamedExercise'),
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

      const targetWeekDays = newWeeksMap[targetWeek] || [];
      if (
        autoStartDayIndex != null &&
        autoStartDayIndex >= 0 &&
        autoStartDayIndex < targetWeekDays.length &&
        autoStartAppliedRef.current !== autoStartDayIndex
      ) {
        autoStartAppliedRef.current = autoStartDayIndex;
        setActiveDayIndex(autoStartDayIndex);
        setScreenPhase('running');
      } else if (autoStartDayIndex == null) {
        setActiveDayIndex(0);
      }

    } catch (err: any) {
      setErrorMsg(localizedErrorText(err, t('workout.loadFailed')));
    } finally {
      setLoading(false);
    }
  }

  // Same mechanic as MilestoneLaneScreen's handleContinueProgram, exposed
  // here too since the warrior can reach "week finished" straight from this
  // screen without ever going through the Journey lane. Clones the current
  // last week forward via add_week_to_own_program, then bumps current_week
  // and reloads so the new week becomes active immediately.
  const handleAddWeek = async () => {
    if (addingWeek || !warriorProgramId) return;
    setAddingWeek(true);
    const { error: addWeekError } = await supabase.rpc('add_week_to_own_program', {
      p_warrior_program_id: warriorProgramId,
    });
    if (addWeekError) {
      console.error('Failed to add a new week:', addWeekError);
      setAddingWeek(false);
      return;
    }
    const { error: bumpError } = await supabase
      .from('warrior_programs')
      .update({ current_week: activeWeek + 1 })
      .eq('id', warriorProgramId);
    if (bumpError) {
      console.error('Failed to advance to new week:', bumpError);
    }
    await loadWarriorProgram();
    setAddingWeek(false);
  };

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

    setTogglingBlockIds(prev => ({ ...prev, [blockId]: true }));
    try {
      const { data: toggleResult, error } = await supabase.rpc('toggle_block_status', {
        p_warrior_id: warriorId,
        p_warrior_program_id: warriorProgramId,
        p_block_id: blockId,
        p_next_status: nextStatus,
        p_start_of_today: replaceLogsSince(blockId)
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
      // Revert on failure. loadWarriorProgram() alone refreshes
      // minAccessTier/program data but NOT profile — isLockedByTier reads
      // currentTier from AuthContext's own (separately cached) profile, so
      // without also refreshing that here, a server-side PRO_REQUIRED
      // rejection (e.g. a subscription that lapsed mid-session, before
      // AuthContext's next foreground refresh) would silently no-op: the
      // block stays unmarked with isLockedByTier still reading the stale,
      // still-looks-entitled tier, and the screen never explains why.
      await Promise.all([loadWarriorProgram(), refreshProfile()]);
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
  useEffect(() => {
    if (!logModalVisible) {
      setSheetLadder({ index: null, extra: 0, summary: '' });
      return;
    }
    setSheetCounts({});
    setSheetTouched({});
    setSheetTopKg({});
    setSheetHoldSecs({});
    setSheetPhase('form');
    setSheetError(null);
    // AMRAP: "5" from a timer, or "5 + 4" / "5 Rounds + 4 Reps" from a saved log.
    const am = (logAmrapRounds || '').match(/(\d+)\D*?(?:\+\s*(\d+))?/);
    setSheetAmrap({ rounds: am ? parseInt(am[1], 10) : 0, reps: am && am[2] ? parseInt(am[2], 10) : 0 });
    // For Time: "14:32", or the timer's "time cap reached" text.
    const ft = (logForTimeDuration || '').match(/^(\d+):(\d{1,2})$/);
    if (ft) {
      setSheetForTime({ min: parseInt(ft[1], 10), sec: parseInt(ft[2], 10), cap: false });
      setSheetCapText(null);
    } else {
      setSheetForTime({ min: 0, sec: 0, cap: !!logForTimeDuration });
      setSheetCapText(logForTimeDuration || null);
    }
    // One note: the skipped "any details?" field is merged into it.
    if (!logNotes && logMissedDetail) setLogNotes(logMissedDetail);
    setSheetNoteOpen(!!(logNotes || logMissedDetail));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logModalVisible]);

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
        setLogExerciseWeights({});
      } else {
        const parsed = parseLoggedNotes(existing.notes);
        setLogNotes(parsed.freeText);
        setLogAmrapRounds(parsed.amrapRounds);
        setLogForTimeDuration(parsed.forTimeDuration);
        setLogLadderProgress(parsed.ladderProgress);
        setLogWeightUsed(parsed.weightUsed);
        // Put the saved sets back so re-saving keeps them, unless sets were
        // already entered on this block in this session.
        const saved = existing.saved_sets || {};
        if (Object.keys(saved).length > 0 && !blockSetProgress[blockId]) {
          setBlockSetProgress(prev => ({ ...prev, [blockId]: saved }));
        }
        setLogExerciseWeights(Object.fromEntries(
          weightedExercisesOf(blockId).map(ex => {
            const top = Math.max(0, ...(saved[String(ex.id)] || []).map(s => s.weight ?? 0));
            return [String(ex.id), top > 0 ? String(top) : ''];
          })
        ));
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
      setLogWeightUsed(topSetWeight(blockId));
      setLogExerciseWeights(topSetWeightsByExercise(blockId));
    }

    if (initialStatus) {
      setLogStatus(initialStatus);
    }

    setLogModalVisible(true);
  };

  // Fired when the inline ladder logger (rendered inside the block card)
  // finalizes an attempt — opens the log modal pre-filled with the ladder
  // progress summary so the warrior can still add feel/RPE before submitting.
  const handleLadderFinalize = (blockId: string | number, summary: string, rungIndex: number | null = null, extraReps = 0) => {
    if (isBlockLocked(blockId)) return;
    setSheetLadder({ index: rungIndex, extra: extraReps, summary });
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
        ? t('workout.timeCapReached', { round: result.roundsCompleted, total: result.totalRounds })
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
    const exerciseSets = blockSetEntries(blockId);
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
  // popupWeights: the log modal's kg per weighted exercise id. For an
  // exercise with no logged set, it becomes one real set (reps from the
  // plan), so it reaches the charts instead of living in notes text alone.
  const buildSetsPayload = (blockId: string | number, fromSheet: boolean) => {
    const sets: { block_exercise_id: string | number | null; set_index: number; reps_completed: number | null; weight_used: number | null; hold_seconds: number | null }[] = [];

    const exerciseSets = blockSetEntries(blockId);
    Object.entries(exerciseSets).forEach(([exerciseId, entries]) => {
      entries.forEach((entry: SetLogEntry) => {
        sets.push({
          block_exercise_id: exerciseId,
          set_index: entry.setIndex,
          reps_completed: entry.hold != null ? null : entry.reps,
          weight_used: entry.weight ?? null,
          hold_seconds: entry.hold ?? null,
        });
      });
    });

    // Completed sets-type block: the sheet's per-exercise counts become real
    // set rows — sets added beyond the ticked ones at the planned reps (or
    // the Hold stepper's seconds) with the Top set kg; ticked rows are never
    // changed. An untouched exercise set to 0 is saved as one 0-rep row so
    // the server doesn't fill in the plan for it.
    if (fromSheet) {
      const m = sheetModel(blockId);
      // Ladder: each exercise gets one row per rung reached, at that rung's
      // reps (+ the extra reps on the next rung, when the logger's rung was
      // kept), so a ladder counts as logged work, not assumed.
      if (m.kind === 'ladder' && m.cards[0]) {
        const card = m.cards[0];
        const n = sheetCounts[card.id] ?? card.defaultCount ?? card.plan;
        const extra = sheetLadder.index !== null && n === sheetLadder.index + 1 ? sheetLadder.extra : 0;
        (days.flatMap(d => d.blocks).find(b => b.id === blockId)?.exercises || []).forEach(ex => {
          if (n === 0) {
            sets.push({ block_exercise_id: ex.id, set_index: 1, reps_completed: 0, weight_used: null, hold_seconds: null });
            return;
          }
          m.rungs.slice(0, n).forEach((reps, i) =>
            sets.push({ block_exercise_id: ex.id, set_index: i + 1, reps_completed: reps, weight_used: null, hold_seconds: null }),
          );
          if (extra > 0) {
            sets.push({ block_exercise_id: ex.id, set_index: n + 1, reps_completed: extra, weight_used: null, hold_seconds: null });
          }
        });
      }
      if (m.kind === 'sets') {
        const add = (exId: string, setIndex: number, reps: number | null, hold: number | null, kg: number) =>
          sets.push({
            block_exercise_id: exId,
            set_index: setIndex,
            reps_completed: hold !== null ? null : reps,
            weight_used: kg > 0 ? kg : null,
            hold_seconds: hold,
          });
        if (m.isRounds && m.cards[0]) {
          const card = m.cards[0];
          const n = sheetCounts[card.id] ?? (card.ticked > 0 ? card.ticked : card.plan);
          m.exercises.forEach(e => {
            if (n === 0 && e.done.length === 0) {
              sets.push({ block_exercise_id: e.id, set_index: 1, reps_completed: 0, weight_used: null, hold_seconds: null });
              return;
            }
            for (let r = 1; r <= n; r++) {
              if (!e.done.some(d => d.setIndex === r)) add(e.id, r, e.reps, e.hold, 0);
            }
          });
        } else {
          m.cards.forEach(card => {
            const e = m.exercises.find(x => x.id === card.id)!;
            const n = sheetCounts[card.id] ?? (card.ticked > 0 ? card.ticked : card.plan);
            if (n === 0 && card.ticked === 0) {
              sets.push({ block_exercise_id: card.id, set_index: 1, reps_completed: 0, weight_used: null, hold_seconds: null });
              return;
            }
            const used = e.done.map(d => d.setIndex);
            const free = Array.from({ length: card.plan }, (_, i) => i + 1).filter(i => !used.includes(i));
            const kg = card.weighted ? sheetTopKg[card.id] ?? m.topKgDefault[card.id] ?? 0 : 0;
            const hold = card.hold ? sheetHoldSecs[card.id] ?? m.holdDefault[card.id] ?? e.hold : null;
            free.slice(0, Math.max(0, n - card.ticked)).forEach(i => add(card.id, i, e.reps, hold, kg));
          });
        }
      }
    }

    // Tabata from the sheet: each exercise's confirmed rounds become set
    // rows — hold rounds use the holds logged in the timer for that exercise
    // in order, then the Hold stepper; rep rounds the planned reps. The
    // timer's holds are folded in here, so they're attached to the exercise.
    const tabataFromSheet = fromSheet && sheetModel(blockId).kind === 'timer';
    if (tabataFromSheet) {
      const m = sheetModel(blockId);
      m.cards.forEach(card => {
        const e = m.exercises.find(x => x.id === card.id)!;
        const n = sheetCounts[card.id] ?? card.defaultCount ?? card.plan;
        if (n === 0) {
          sets.push({ block_exercise_id: card.id, set_index: 1, reps_completed: 0, weight_used: null, hold_seconds: null });
          return;
        }
        const logged = timerHoldsFor(blockId).filter(h => String(h.exerciseId) === card.id).map(h => h.seconds);
        const stepper = sheetHoldSecs[card.id] ?? m.holdDefault[card.id] ?? e.hold;
        for (let r = 1; r <= n; r++) {
          if (card.hold) {
            sets.push({ block_exercise_id: card.id, set_index: r, reps_completed: null, weight_used: null, hold_seconds: logged[r - 1] ?? stepper });
          } else if (e.reps !== null) {
            sets.push({ block_exercise_id: card.id, set_index: r, reps_completed: e.reps, weight_used: null, hold_seconds: null });
          }
        }
      });
    } else {
      timerHoldsFor(blockId).forEach((h, i) => {
        sets.push({
          block_exercise_id: h.exerciseId,
          set_index: i + 1,
          reps_completed: null,
          weight_used: null,
          hold_seconds: h.seconds,
        });
      });
    }

    return sets;
  };

  const handleLogWorkout = async () => {
    if (!activeLogBlockId || !templateId) return;
    const blockId = activeLogBlockId;
    const done = logStatus === 'completed';
    const m = sheetModel(blockId);

    setLogLoading(true);
    setSheetPhase('saving');
    setSheetError(null);
    try {
      // Notes keep the "[LOG] …" lines that coach views and re-opening
      // read back (parseLoggedNotes); the sheet's inputs are numbers now.
      let finalNotes = '';
      if (done && m.kind === 'amrap') {
        const v = sheetAmrap.reps > 0 ? `${sheetAmrap.rounds} + ${sheetAmrap.reps}` : `${sheetAmrap.rounds}`;
        finalNotes += `[LOG] Completed: ${v} Rounds/Reps\n`;
      }
      if (done && m.kind === 'fortime') {
        const time = sheetForTime.cap
          ? sheetCapText || t('logSheet.capReachedNote')
          : `${sheetForTime.min}:${String(sheetForTime.sec).padStart(2, '0')}`;
        finalNotes += `[LOG] Finished in: ${time}\n`;
      }
      let ladderText = '';
      if (done && m.kind === 'ladder' && m.cards[0]) {
        const n = sheetCounts['ladder'] ?? m.cards[0].defaultCount ?? m.cards[0].plan;
        ladderText =
          n === 0
            ? t('logSheet.ladderNone')
            : sheetLadder.index !== null && n === sheetLadder.index + 1 && sheetLadder.summary
              ? sheetLadder.summary
              : t('timers.rungReached', { reps: m.rungs[n - 1] });
      } else if (done && logLadderProgress) {
        ladderText = logLadderProgress;
      }
      if (ladderText) finalNotes += `[LOG] Ladder Progress: ${ladderText}\n`;
      if (done) {
        const topKg = Math.max(
          0,
          ...m.cards.filter(c => c.weighted).map(c => sheetTopKg[c.id] ?? m.topKgDefault[c.id] ?? 0),
        );
        if (topKg > 0) finalNotes += `[LOG] Weight Used: ${topKg} KG\n`;
        if (logNotes.trim()) finalNotes += logNotes.trim();
      }
      finalNotes = finalNotes.trim();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { data: logResult, error } = await supabase.rpc('log_block_with_sets', {
        p_warrior_id: warriorId,
        p_warrior_program_id: warriorProgramId,
        p_block_id: blockId,
        p_status: logStatus,
        p_feel: done ? logFeel : null,
        p_rpe: done ? logRpe : null,
        p_missed_reason: done ? null : logMissedReason,
        // The sheet has one note; for a skip it's the missed detail.
        p_missed_detail: done ? null : logNotes.trim() || null,
        p_notes: finalNotes,
        p_session_seconds: null,
        p_start_of_today: replaceLogsSince(blockId),
        p_sets: done ? buildSetsPayload(blockId, true) : [],
      }).abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        if (error.message?.toLowerCase().includes('abort')) {
          throw new Error(t('logSheet.timeout'));
        }
        throw error;
      }

      if (logResult?.workout_log_id) {
        NotificationService.notifyCoachWorkoutLogged(logResult.workout_log_id);
      }

      // Saved-state summary, e.g. "6/8 sets · Strong · RPE 7".
      const parts: string[] = [];
      if (done) {
        if (m.kind === 'ladder' && m.cards[0]) {
          const n = sheetCounts['ladder'] ?? m.cards[0].defaultCount ?? m.cards[0].plan;
          parts.push(t('logSheet.summaryLadder', { done: n, plan: m.cards[0].plan }));
        } else if (m.kind === 'sets' && m.cards.length) {
          const total = m.cards.reduce((sum, c) => sum + (sheetCounts[c.id] ?? (c.ticked > 0 ? c.ticked : c.plan)), 0);
          const plan = m.cards.reduce((sum, c) => sum + c.plan, 0);
          parts.push(t(m.isRounds ? 'logSheet.summaryRounds' : 'logSheet.summarySets', { done: total, plan }));
        } else if (m.kind === 'amrap') {
          parts.push(t('logSheet.summaryAmrap', { rounds: sheetAmrap.rounds, reps: sheetAmrap.reps }));
        } else if (m.kind === 'fortime') {
          parts.push(
            sheetForTime.cap
              ? t('logSheet.summaryCap')
              : t('logSheet.summaryTime', { time: `${sheetForTime.min}:${String(sheetForTime.sec).padStart(2, '0')}` }),
          );
        }
        if (logFeel) parts.push(t(`logModal.feel_${logFeel}`));
        if (logRpe) parts.push(`RPE ${logRpe}`);
      } else if (logMissedReason) {
        parts.push(t('logSheet.summaryMissed', { reason: t(`logModal.missed_${logMissedReason}`) }));
      }
      setSheetSummary(parts.join(' · '));
      setSheetPhase('saved');

      setSessionTotalReps(prev => prev + sumBlockReps(blockId));
      setBlockSetProgress(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
      setBlockSetDrafts(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
      setPendingHoldTimes([]);
      setPendingTabataRounds(null);
      setPendingTimerBlockId(null);
      // Collapse the just-logged block so the next unlocked block is easy to open.
      setExpandedBlocks(prev => ({ ...prev, [blockId]: false }));

      const nextStatus = logStatus;
      setWeeksData(prev => {
        const next = { ...prev };
        if (next[activeWeek]) {
          next[activeWeek] = next[activeWeek].map(d => ({
            ...d,
            blocks: d.blocks.map(b => (b.id === blockId ? { ...b, completedStatus: nextStatus } : b)),
          }));
        }
        return next;
      });

      // Saved state shows briefly, then the sheet closes on its own.
      setTimeout(() => setLogModalVisible(false), 1200);
    } catch (err: any) {
      // Keep the sheet open with everything entered; retry from the button.
      setSheetError(localizedErrorText(err, t('logSheet.saveFailed')));
      setSheetPhase('form');
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
        setLogWeightUsed(topSetWeight(blockId));
        setLogExerciseWeights(topSetWeightsByExercise(blockId));
        setLogLadderProgress('');
        setLogModalVisible(true);
      } else {
        quickLogWorkout(blockId, status);
      }
    } else {
      Alert.alert(
        t('workout.logDetailsTitle'),
        t('workout.logDetailsBody'),
        [
          {
            text: t('workout.addDetails'),
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
              setLogWeightUsed(topSetWeight(blockId));
              setLogExerciseWeights(topSetWeightsByExercise(blockId));
              setLogLadderProgress('');
              setLogModalVisible(true);
            }
          },
          {
            text: t('workout.submitDirectly'),
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
      // "Submit directly" saves only this block's own data: its sets and
      // their top weight. Every log-modal field (notes, AMRAP / For Time /
      // ladder results, feel, RPE, missed reason) is shared state left over
      // from whichever block last opened the modal, so none of it is sent —
      // it used to copy one block's feel/RPE onto every quick-submitted
      // block. Timer results never come through here (they open the modal).
      let finalNotes = '';
      const quickWeight = topSetWeight(blockId);
      if (quickWeight) finalNotes += `[LOG] Weight Used: ${quickWeight} KG\n`;

      let timerId: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(t('workout.timedOut'))), 10000);
      });

      const { data: quickLogResult, error } = await Promise.race([
        supabase.rpc('log_block_with_sets', {
          p_warrior_id: warriorId,
          p_warrior_program_id: warriorProgramId,
          p_block_id: blockId,
          p_status: status,
          p_feel: null,
          p_rpe: null,
          p_missed_reason: null,
          p_missed_detail: null,
          p_notes: finalNotes.trim(),
          p_session_seconds: null,
          p_start_of_today: replaceLogsSince(blockId),
          // A missed block carries no sets (same as the sheet's MISSED path).
          p_sets: status === 'missed' ? [] : buildSetsPayload(blockId, false),
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
      setBlockSetDrafts(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
      setPendingHoldTimes([]);
      setPendingTabataRounds(null);
      setPendingTimerBlockId(null);
      // Collapse the just-logged block so the next unlocked block is easy to open.
      setExpandedBlocks(prev => ({ ...prev, [blockId]: false }));
      await loadWarriorProgram();
      setLogModalVisible(false);
    } catch (err: any) {
      Alert.alert(t('workout.error'), localizedErrorText(err, t('workout.logFailed')));
    } finally {
      setLogLoading(false);
    }
  };


  // Day Blocks design: exactly one block open at a time — tapping the open
  // one collapses it, tapping any other replaces which one is open (never
  // more than one, and closing the only open one is fine, matches the
  // design's own "tapping the open one collapses it" behavior).
  const toggleBlockExpanded = (blockId: string | number) => {
    setExpandedBlocks(prev => (prev[blockId] ? {} : { [blockId]: true }));
  };

  const handleToggleVideo = (exerciseId: string | number, url: string) => {
    if (!url) return;
    setActiveVideoExerciseId(prev => (prev === exerciseId ? null : exerciseId));
  };

  // Day Blocks header — derived from progress, never hardcoded (design
  // handoff §1.1). Reuses deriveDayStates (already built for the day-list
  // view) applied to a single-day array instead of a second implementation.
  const runnerDayState = activeDay ? deriveDayStates([activeDay])[0] : null;
  const runnerDayBadgeLabel = runnerDayState
    ? runnerDayState.status === 'done' ? t('workout.stateComplete') : runnerDayState.status === 'in_progress' ? t('workout.stateInProgress') : t('workout.stateNotStarted')
    : t('workout.stateNotStarted');
  const runnerNotStarted = !runnerDayState || (runnerDayState.status !== 'done' && runnerDayState.status !== 'in_progress');
  const runnerNextBlock = activeDay?.blocks.find((b) => b.completedStatus === 'none') || null;
  const runnerNextBlockIndex = runnerNextBlock ? activeDay!.blocks.indexOf(runnerNextBlock) + 1 : null;
  const runnerFooterLabel = !runnerDayState || runnerDayState.progressPct === 0 || !runnerNextBlockIndex
    ? t('workout.startWorkout')
    : t('workout.resumeBlock', { n: runnerNextBlockIndex });
  const runnerOpenBlockId = Object.keys(expandedBlocks).find((k) => expandedBlocks[k]);
  const runnerOpenBlock = activeDay?.blocks.find((b) => String(b.id) === runnerOpenBlockId) || null;

  // Program Days header (design handoff §2): "{n} sessions · {n} done this
  // week" — real counts for the currently selected week, not the day
  // currently being run.
  const weekSessionSummary = summarizeWeekSessions(days);

  return (
    <GlobalErrorBoundary>
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS !== 'web'}
    >
      {screenPhase === 'running' && activeDay ? (
        <View style={{ flex: 1, backgroundColor: theme.background.primary }}>
        <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingBottom: 140 }]} keyboardShouldPersistTaps="never" onScrollBeginDrag={Keyboard.dismiss}>
          {/* Day Blocks header (design handoff §1.1): back chevron, title,
              a progress-derived state badge, meta line, percent, and a
              per-block tick bar — never hardcoded, all read from the same
              progress source as the day-list view. */}
          <View style={{ paddingTop: Platform.OS === 'ios' ? 54 : 20, paddingBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('workout.back')} onPress={() => setScreenPhase('list')} style={dbRunnerStyles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="chevron-left" size={18} color={dbr.title} style={FLIP_X} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={dbRunnerStyles.title} numberOfLines={1}>{activeDay.name.toUpperCase()}</Text>
                  <View
                    style={[
                      dbRunnerStyles.stateBadge,
                      runnerNotStarted
                        ? { backgroundColor: mode === 'light' ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.04)', borderColor: mode === 'light' ? '#E5DADA' : '#221c1c' }
                        : { backgroundColor: 'rgba(252,84,84,.12)', borderColor: mode === 'light' ? 'rgba(252,84,84,.35)' : '#3a1d1d' },
                    ]}
                  >
                    <Text style={{ color: runnerNotStarted ? '#7a7a7a' : '#FC5454', fontSize: 7.5, fontFamily: 'BarlowCondensed-Bold', letterSpacing: 1.3 }}>
                      {runnerDayBadgeLabel}
                    </Text>
                  </View>
                </View>
                <Text style={dbRunnerStyles.metaLine} numberOfLines={1}>
                  {t('workout.dayMeta', { blocks: activeDay.blocks.length, moves: countMovements(activeDay), min: estimateSessionMinutes(activeDay) })}
                </Text>
              </View>
              <DayBlocksProgressRing pct={runnerDayState?.progressPct ?? 0} mode={mode} />
            </View>
            <View style={dbRunnerStyles.tickBar}>
              {activeDay.blocks.map((b) => {
                const tickColor = b.completedStatus === 'missed' ? dbr.tickMissed : b.completedStatus === 'completed' ? inferBlockAccent(b.name).color : dbr.tickScheduled;
                return <View key={b.id} style={[dbRunnerStyles.tick, { backgroundColor: tickColor }]} />;
              })}
            </View>
          </View>
          {/* BLOCKS / WORKOUTS LIST — unchanged from before this screen had
              phases, just no longer glued directly under the day carousel. */}
          <View style={{ gap: 16 }}>
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
                  index={index}
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
                  isLogPending={logModalVisible && String(activeLogBlockId) === String(block.id)}
                  startTimerForBlock={startTimerForBlock}
                  activeVideoExerciseId={activeVideoExerciseId}
                  onToggleVideo={handleToggleVideo}
                  isLocked={isLocked}
                  loggedSetsByExercise={blockSetProgress[block.id]}
                  onSetLogged={handleSetLogged}
                  onSetDraft={handleSetDraft}
                  onLadderFinalize={handleLadderFinalize}
                  onAmrapFinalize={handleAmrapFinalize}
                  onForTimeFinalize={handleForTimeFinalize}
                />
              );
            })}

          </View>
        </ScrollView>

        {/* Sticky footer (design handoff §1.4): outlined rest-timer button
            (opens the currently-open block's own timer — same
            startTimerForBlock the Tabata "START TIMER" action inside the
            block already uses) + the primary CTA. The primary CTA covers
            two real, pre-existing behaviors: opening/resuming the next
            unaddressed block while work remains, and — once every block is
            addressed — handing off to the same handleWorkoutDonePress flow
            the old WorkoutProgressButton triggered (session-complete
            stats), so nothing that worked before is lost. */}
        {blocksTotalCount > 0 && (
          <LinearGradient
            colors={dbr.footerFade}
            locations={[0, 0.3, 1]}
            style={dbRunnerStyles.footerWrap}
            pointerEvents="box-none"
          >
            <View style={dbRunnerStyles.footer} pointerEvents="box-none">
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('workout.startTimer')}
                style={[dbRunnerStyles.restBtn, !runnerOpenBlock && { opacity: 0.35 }]}
                disabled={!runnerOpenBlock}
                onPress={() => runnerOpenBlock && startTimerForBlock(runnerOpenBlock)}
              >
                <MaterialCommunityIcons name="clock-outline" size={22} color={dbr.restBtnIcon} />
              </TouchableOpacity>
              <TouchableOpacity
                style={dbRunnerStyles.primaryBtn}
                onPress={() => {
                  if (isWorkoutAddressed) { handleWorkoutDonePress(); return; }
                  const target = runnerNextBlock || activeDay.blocks[0];
                  if (target) setExpandedBlocks({ [target.id]: true });
                }}
              >
                <MaterialCommunityIcons name="play" size={14} color="#000" />
                <Text style={dbRunnerStyles.primaryBtnText}>
                  {isWorkoutAddressed ? t('workout.finishSession') : runnerFooterLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}
        </View>
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
              <Text style={[styles.closeButtonText, { color: theme.text.primary, fontSize: 10 }]}>{t('workout.close')}</Text>
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
            <Text style={[styles.loadingText, { color: theme.text.secondary }]}>{t('workout.fetching')}</Text>
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
                <Text style={[styles.emptyTitle, { color: theme.text.primary }]}>{t('workout.noProgramTitle')}</Text>
                <Text style={[styles.emptySubtitle, { color: theme.text.secondary }]}>
                  {t('workout.noProgramBody')}
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 16, backgroundColor: bronzeGold, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' }}
                  onPress={() => router.push('/program-templates')}
                >
                  <Text style={{ color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>
                    {t('workout.browsePrograms')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : isLockedByTier ? (
              <View style={[styles.emptyContainer, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                <Text style={[styles.emptyTitle, { color: theme.text.primary }]}>{t('workout.upgradeToKeep')}</Text>
                <Text style={[styles.emptySubtitle, { color: theme.text.secondary }]}>
                  {minAccessTier === 'pro'
                    ? t('workout.lockedProCaps')
                    : t('workout.lockedCoachCaps')}
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 16, backgroundColor: bronzeGold, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' }}
                  onPress={() => {
                    // Reset the double-tap guard on every open — see
                    // CustomizeProgramScreen's handlePressCreate comment for
                    // why (without this, backing out of the paywall once and
                    // reopening leaves both buttons permanently disabled).
                    upgradingRef.current = false;
                    setUpgrading(false);
                    setUpgradeModalVisible(true);
                  }}
                >
                  <Text style={{ color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>
                    {t('workout.upgrade')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ marginTop: 12, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.card.border }}
                  onPress={profile?.free_library_template_id ? handleRestoreFreeTemplate : handleEndLockedProgram}
                  disabled={endingProgram}
                >
                  <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>
                    {endingProgram
                      ? (profile?.free_library_template_id ? t('workout.restoring') : t('workout.ending'))
                      : (profile?.free_library_template_id ? t('workout.backToFree') : t('workout.deleteAndChooseA'))}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                {/* PROGRAM IDENTITY CARD (design handoff §2) — replaces the
                    old intro card + the full-width gradient SWITCH bar;
                    SWITCH is now a small control inside this card. */}
                <ProgramIdentityCard
                  programName={programName}
                  coachName={coachName}
                  sessionsTotal={weekSessionSummary.sessionsTotal}
                  sessionsDoneThisWeek={weekSessionSummary.sessionsDoneThisWeek}
                  onSwitch={() => router.push('/program-templates')}
                />

                {/* BODYWEIGHT — the Static/Power/1MM arc dashboard this
                    used to sit alongside was dropped for reading as too
                    busy next to the identity card and day list; this is
                    the one real, actionable control that was in it. */}
                <ProgramLoadPanel
                  bodyweightKg={bodyweightThisWeek}
                  onEditBodyweight={() => setShowBodyweightCheckIn(true)}
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
                />

                {/* DAY LIST (§4) — every day tappable in any order, showing
                    real logging progress; the first not-done day gets the
                    loud coral "UP NEXT" treatment (visual emphasis only,
                    not a lock — see deriveNextDayIndex's own comment).
                    Tapping a card jumps straight into that day's
                    exercise-logging UI — no interstitial screen. */}
                <DayCardList
                  days={days}
                  nextIndex={deriveNextDayIndex(days)}
                  onStartDay={(dayIndex) => {
                    setActiveDayIndex(dayIndex);
                    setScreenPhase('running');
                  }}
                />

                {canAddWeek && (
                  <TouchableOpacity
                    style={{
                      borderRadius: 12,
                      paddingVertical: 16,
                      alignItems: 'center',
                      backgroundColor: '#FF5252',
                      opacity: addingWeek ? 0.6 : 1,
                    }}
                    onPress={handleAddWeek}
                    disabled={addingWeek}
                  >
                    <Text style={{ color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 1 }}>
                      {addingWeek ? t('workout.addingWeek') : t('workout.addNewWeek')}
                    </Text>
                  </TouchableOpacity>
                )}
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
        onClose={() => {
          setShowSessionComplete(false);
          if (onSessionDone) {
            onSessionDone();
          } else {
            setScreenPhase('list');
          }
        }}
      />

      <UpgradeToSaveModal
        visible={upgradeModalVisible}
        theme={theme}
        title={t('workout.upgradeToKeep')}
        body={
          minAccessTier === 'pro'
            ? t('workout.lockedPro')
            : t('workout.lockedCoach')
        }
        cancelLabel={t('workout.notNow')}
        upgrading={upgrading}
        onUpgrade={() => {
          if (upgradingRef.current) return;
          upgradingRef.current = true;
          setUpgrading(true);
          setUpgradeModalVisible(false);
          requestPaywallAfterModalCloses();
        }}
        onCancel={() => setUpgradeModalVisible(false)}
        onDismiss={handleUpgradeModalDismissed}
      />

      {/* LOG DETAILS MODAL */}
      {(() => {
        const m = sheetModel(activeLogBlockId);
        return (
          <LogBlockSheet
            visible={logModalVisible}
            onClose={() => {
              if (sheetPhase !== 'saving') setLogModalVisible(false);
            }}
            blockName={m.block?.name ?? ''}
            kind={m.kind}
            isRounds={m.isRounds}
            status={logStatus}
            setStatus={(st) => {
              setLogStatus(st);
              setSheetError(null);
            }}
            cards={m.cards}
            counts={sheetCounts}
            setCount={(id, n) => {
              setSheetCounts(prev => ({ ...prev, [id]: n }));
              setSheetTouched(prev => ({ ...prev, [id]: true }));
            }}
            touched={sheetTouched}
            topKg={{ ...m.topKgDefault, ...sheetTopKg }}
            setTopKg={(id, kg) => setSheetTopKg(prev => ({ ...prev, [id]: kg }))}
            holdSecs={{ ...m.holdDefault, ...sheetHoldSecs }}
            setHoldSecs={(id, sec) => setSheetHoldSecs(prev => ({ ...prev, [id]: sec }))}
            amrap={{
              ...sheetAmrap,
              capLabel: m.block?.metadata?.time_cap_min || m.block?.metadata?.timer_seconds
                ? t('logSheet.minutesShort', { n: m.block?.metadata?.time_cap_min || m.block?.metadata?.timer_seconds })
                : null,
            }}
            setAmrap={setSheetAmrap}
            forTime={sheetForTime}
            setForTime={setSheetForTime}
            ladder={{ result: logLadderProgress || null }}
            feel={logFeel}
            setFeel={(f) => setLogFeel(f as Feel)}
            rpe={logRpe}
            setRpe={(n) => setLogRpe(n as number)}
            reason={logMissedReason}
            setReason={setLogMissedReason}
            note={logNotes}
            setNote={setLogNotes}
            noteOpen={sheetNoteOpen}
            setNoteOpen={setSheetNoteOpen}
            phase={sheetPhase}
            error={sheetError}
            onSubmit={handleLogWorkout}
            savedSummary={sheetSummary}
          />
        );
      })()}

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
            openLogModalAfterTimerCloses();
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
            openLogModalAfterTimerCloses();
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
            setPendingTabataRounds(roundsCompleted ?? null);
            setPendingTimerBlockId(blockId);
            openLogModalAfterTimerCloses();
          }}
        />
      )}

    </KeyboardAvoidingView>
    </GlobalErrorBoundary>
  );
}

// Day Blocks design tokens (assets/design_handoff_workout_runner) — fixed
// dark palette, same choice already made across the rest of the Training
// Center flow, independent of the app's own light/dark theme toggle.
const getDbRunnerStyles = (dbr: DBRPalette) => StyleSheet.create({
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: dbr.backBtnBg, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: dbr.title, fontFamily: 'BarlowCondensed-Bold', fontSize: 24, letterSpacing: 1.2 },
  stateBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  metaLine: { color: dbr.metaLine, fontFamily: 'Barlow-Regular', fontSize: 13, letterSpacing: 0.6, marginTop: 4 },
  tickBar: { flexDirection: 'row', gap: 5, marginTop: 16 },
  tick: { flex: 1, height: 4, borderRadius: 2 },
  footerWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 24, paddingBottom: 30,
  },
  footer: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
  },
  restBtn: {
    width: 58, height: 58, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: dbr.restBtnBg,
    borderWidth: 1, borderColor: dbr.restBtnBorder,
  },
  primaryBtn: {
    flex: 1, height: 58, borderRadius: 18, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FC5454',
  },
  primaryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 17, letterSpacing: 2.4 },
});

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
