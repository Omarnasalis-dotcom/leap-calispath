import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ONEMM_MOVEMENTS, ONEMM_CATEGORIES, calculateOneMMPoints, OneMMMovement } from '../lib/oneMMLogic';
import { OneMMService, OneMMUserStats, OneMMRanking } from '../services/OneMMService';
import { describeSubmitError } from '../lib/submitErrors';
import { useSlowSubmitNotice } from '../hooks/useSlowSubmitNotice';
import { useSafeAsync } from '../hooks/useSafeAsync';
import { useMountedRef } from '../hooks/useMountedRef';
import { useWorldSummary } from '../hooks/useWorldSummary';
import { useOneMinuteTimer, ONE_MINUTE_COUNTDOWN, ONE_MINUTE_SECONDS } from '../hooks/useOneMinuteTimer';
import { Skeleton } from '../components/Skeleton';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { useTutorialTarget } from '../hooks/useTutorialTarget';
import { TutorialModalOverlay } from '../components/tutorial/TutorialOverlay';
import { PBOverwriteConfirmModal } from '../components/PBOverwriteConfirmModal';
import { NotificationService } from '../services/NotificationService';
import { useReturnTo } from '../hooks/useReturnTo';
import { getWorldKitTokens, WorldKitTokens } from '../../constants/worldKitTokens';
import { deriveStanding, fmt2, youBarSubline, BoardRow } from '../lib/worldStanding';
import { clamp01 } from '../lib/worldProgress';
import {
  AnimatedRing, BoardFilters, BoardKicker, DashboardRings, filterByGender, GoalCard, KitButton,
  KitIcon, kt, LeaderboardBody, NumberField, SegmentedSwitch, ThisSetRow, TopList, WorldHeader,
  WorldSheet, WorldToast, YouBar, Gender,
} from '../components/worlds/kit';

type Level = 'entry' | 'main' | 'advanced';
type SheetState =
  | { kind: 'log'; movementId: string; mode: 'log' | 'timer' }
  | { kind: 'board' }
  | null;

const LEVELS: Level[] = ['entry', 'main', 'advanced'];
/** Main/Advanced unlock at strength tier 5 (ONEMM_CATEGORIES tiers). */
const LEVEL_UNLOCK_TIER = 5;
const MAX_REPS = 150;
const QUOTE = 'SIXTY SECONDS. NO EXCUSES.';

const isLevelLocked = (level: Level, tier: number) => level !== 'entry' && tier < LEVEL_UNLOCK_TIER;

export function OneMinMaxScreen({ category }: { category?: string }) {
  const { theme, mode } = useTheme();
  const t = getWorldKitTokens('onemm', mode);
  const { user, profile, refreshProfile } = useAuth();
  const { returnTo, goBackOrReturnTo, completeQuestAndReturn } = useReturnTo();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave, isExecuting: saving } = useSafeAsync();
  const isSlowSave = useSlowSubmitNotice(saving);
  const tier = profile?.strength_tier ?? 0;

  const { ref: scoreCircleRef, onLayout: onScoreCircleLayout } = useTutorialTarget('onemm.scoreCircle');
  const { ref: movementGridRef, onLayout: onMovementGridLayout } = useTutorialTarget('onemm.movementGrid');
  // useScreenMeasure=true: see useTutorialTarget — pageX/pageY path on Android.
  const { ref: timerBadgeRef, onLayout: onTimerBadgeLayout, reportInteraction: reportTimerBadge } = useTutorialTarget('onemm.timerBadge', undefined, true);
  const { ref: startSprintRef, onLayout: onStartSprintLayout } = useTutorialTarget('onemm.startSprintButton');
  const { ref: timerCloseRef, onLayout: onTimerCloseLayout, reportInteraction: reportTimerClose } = useTutorialTarget('onemm.timerCloseButton');

  // Deep-linked from SuggestedTestCard / My Journey with the category the
  // suggested movement lives in — respect the tier lock.
  const [level, setLevel] = useState<Level>(
    LEVELS.includes(category as Level) && !isLevelLocked(category as Level, tier) ? (category as Level) : 'entry'
  );

  const [stats, setStats] = useState<OneMMUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { summary, refresh: refreshSummary } = useWorldSummary('onemm', !!user);

  const [sheet, setSheet] = useState<SheetState>(null);
  // Keeps the last content rendered while the sheet plays its exit animation.
  const lastSheet = useRef<Exclude<SheetState, null>>({ kind: 'board' });
  if (sheet) lastSheet.current = sheet;
  const shown = sheet ?? lastSheet.current;

  const [repsRaw, setRepsRaw] = useState('');
  const [movementTop, setMovementTop] = useState<OneMMRanking[]>([]);
  const [pendingOverwrite, setPendingOverwrite] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [boardRows, setBoardRows] = useState<OneMMRanking[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [gender, setGender] = useState<Gender>('ALL');
  // Community scope is derived (not mirrored via an effect) so the first
  // render with a real profile already has the right default — see the
  // race this avoided in the previous screen version.
  const [manualScope, setManualScope] = useState<'public' | 'community' | null>(null);
  const scope: 'public' | 'community' = manualScope ?? (profile?.community_id ? 'community' : 'public');

  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ stat: '', movement: '' });

  // ------------------------------------------------------------------ data

  const isFetchingRef = useRef(false);
  const fetchStats = useCallback(async () => {
    if (!user || isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const s = await OneMMService.getUserStats(user.id);
      if (isMounted.current) setStats(s);
    } catch (e) {
      console.error('Fetch 1MM error:', e);
    } finally {
      isFetchingRef.current = false;
      if (isMounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [user, isMounted]);

  useFocusEffect(useCallback(() => { fetchStats(); }, [fetchStats]));

  const fetchBoard = useCallback(async (s: 'public' | 'community') => {
    setBoardLoading(true);
    try {
      const communityId = s === 'community' ? profile?.community_id : null;
      const data = await OneMMService.getLeaderboard('overall', undefined, communityId);
      if (isMounted.current) setBoardRows(data);
    } catch (e) {
      console.error('1MM board error:', e);
    } finally {
      if (isMounted.current) setBoardLoading(false);
    }
  }, [profile?.community_id, isMounted]);

  const fetchMovementTop = useCallback(async (movementId: string) => {
    setMovementTop([]);
    try {
      const data = await OneMMService.getLeaderboard(movementId);
      if (isMounted.current) setMovementTop(data);
    } catch (e) {
      console.error('1MM movement top error:', e);
    }
  }, [isMounted]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
    refreshSummary();
  };

  // ------------------------------------------------------------- standing

  const localScore = stats?.totalPoints ?? 0;
  const score = summary ? summary.myScore : localScore;
  const standing = deriveStanding({
    rank: summary ? summary.myRank : (stats?.ranks.glory || null),
    rankedCount: summary?.rankedCount ?? 0,
    score,
    topScore: summary?.topScore ?? 0,
    above: summary?.above ?? null,
  });
  const above = summary?.above ?? null;

  const gap = standing.isKing
    ? { label: 'STATUS', value: 'KING', sub: '#1 OF WORLD', progress: 1, gold: true }
    : standing.isRanked && above && standing.gapToPass != null
      ? { label: `GAP TO #${above.rank}`, value: fmt2(standing.gapToPass), sub: 'PTS TO PASS', progress: standing.gapProgress }
      : { label: 'GAP TO', value: '—', sub: 'RANK UP', progress: 0, empty: true };

  // ------------------------------------------------------------- sheets

  const openLog = (m: OneMMMovement, sheetMode: 'log' | 'timer') => {
    if (isLevelLocked(m.categoryId, tier) || m.minTier > tier) {
      setToast(`REACH TIER ${Math.max(m.minTier, LEVEL_UNLOCK_TIER)} TO UNLOCK`);
      return;
    }
    const pb = stats?.pbs[m.id] ?? 0;
    setRepsRaw(pb > 0 ? String(pb) : '');
    setPendingOverwrite(null);
    setSheet({ kind: 'log', movementId: m.id, mode: sheetMode });
    fetchMovementTop(m.id);
  };

  const openBoard = () => {
    setSheet({ kind: 'board' });
    fetchBoard(scope);
  };

  const timer = useOneMinuteTimer((taps) => {
    setRepsRaw(String(taps));
    setSheet(s => (s && s.kind === 'log' ? { ...s, mode: 'log' } : s));
    setToast('TIME! CONFIRM YOUR REPS');
  });

  const closeSheet = () => {
    if (timer.phase !== 'idle') {
      const abandon = () => { timer.cancel(); setSheet(null); };
      if (Platform.OS === 'web') {
        if (window.confirm('Abandon this 1MM sprint? Progress will be lost.')) abandon();
      } else {
        Alert.alert('ABANDON SPRINT', 'Abandon this 1MM sprint? Progress will be lost.', [
          { text: 'KEEP FIGHTING', style: 'cancel' },
          { text: 'ABANDON', style: 'destructive', onPress: abandon },
        ]);
      }
      return;
    }
    Keyboard.dismiss();
    setSheet(null);
  };

  const setMode = (m: 'log' | 'timer') => {
    if (m === 'log' && timer.phase !== 'idle') timer.cancel();
    setSheet(s => (s && s.kind === 'log' ? { ...s, mode: m } : s));
  };

  // --------------------------------------------------------------- save

  const handleSaveResult = (reps: number, force = false) => {
    if (!user || !sheet || sheet.kind !== 'log') return;
    const movementId = sheet.movementId;
    const movement = ONEMM_MOVEMENTS.find(m => m.id === movementId);
    const currentBest = stats?.pbs[movementId] ?? 0;

    // Strictly less-than: submit_onemm_log treats a tie as a PB.
    if (!force && currentBest > 0 && reps < currentBest) {
      Keyboard.dismiss();
      setPendingOverwrite(reps);
      return;
    }

    let isPB = false;
    runSafeSave(async () => {
      const { isNewPB, overtakenNotificationId, wraOvertakenNotificationId } =
        await OneMMService.saveLog(user.id, movementId, reps, force);
      isPB = isNewPB;
      if (isNewPB) {
        const name = movement?.name || 'Movement';
        if (isMounted.current) setCelebrationData({ stat: `${reps} REPS`, movement: name });
        NotificationService.notify(user.id, 'one_mm_pb', 'New 1MM PB!', `${name}: ${reps} reps — a new personal record.`, { screen: 'one-min-max' });
        if (overtakenNotificationId) NotificationService.sendOvertakeNotificationPush(overtakenNotificationId);
        if (wraOvertakenNotificationId) NotificationService.sendOvertakeNotificationPush(wraOvertakenNotificationId);
      }
    }, {
      onSuccess: () => {
        const mult = movement ? ONEMM_CATEGORIES[movement.categoryId].multiplier : 0;
        setPendingOverwrite(null);
        setSheet(null);
        setToast(isPB
          ? (currentBest > 0 ? `NEW PB · +${fmt2((reps - currentBest) * mult)} PTS` : `FIRST SET · ${fmt2(reps * mult)} PTS`)
          : 'LOGGED · PB UNCHANGED');
        fetchStats();
        refreshSummary();
        refreshProfile?.();
        // The sheet's Modal must be fully gone before CelebrationBanner's
        // Modal mounts (iOS overlapping-modal freeze / Android swap crash).
        if (isPB) setTimeout(() => { if (isMounted.current) setShowCelebration(true); }, 450);
        // Came from a My Journey side quest — return after the result is seen.
        setTimeout(() => { if (isMounted.current) completeQuestAndReturn(); }, 1800);
      },
      onError: (error: any) => {
        setPendingOverwrite(null);
        if (!['P1001', 'P1002', 'P1003', 'P1004'].includes(error.code)) {
          console.error('Error saving 1MM result:', error);
        }
        Alert.alert('Error', describeSubmitError(error, 'Failed to save result.'), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try Again', onPress: () => handleSaveResult(reps, force) },
        ]);
      },
    });
  };

  const onLogPress = () => {
    const reps = parseInt(repsRaw, 10);
    if (isNaN(reps) || reps <= 0 || reps > MAX_REPS) {
      Alert.alert('Invalid', `Please enter a valid number of reps (1-${MAX_REPS}).`);
      return;
    }
    handleSaveResult(reps);
  };

  // ---------------------------------------------------------- rendering

  const pbs = stats?.pbs ?? {};
  const levelTabs = LEVELS.map(l => {
    const moves = ONEMM_MOVEMENTS.filter(m => m.categoryId === l);
    const logged = moves.filter(m => (pbs[m.id] ?? 0) > 0).length;
    return { key: l, label: ONEMM_CATEGORIES[l].name, sub: `${logged}/${moves.length} LOGGED`, locked: isLevelLocked(l, tier) };
  });

  const onPickLevel = (l: Level) => {
    if (isLevelLocked(l, tier)) {
      setToast(`REACH TIER ${LEVEL_UNLOCK_TIER} TO UNLOCK ${ONEMM_CATEGORIES[l].name}`);
      return;
    }
    setLevel(l);
  };

  const goal = standing.isKing
    ? { kicker: "YOU'RE #1", title: 'ENDURANCE KING ACHIEVED', bar: undefined }
    : standing.isRanked && above && standing.gapToPass != null
      ? {
        kicker: 'NEXT TARGET',
        title: `${fmt2(standing.gapToPass)} pts to steal Rank #${above.rank}`,
        bar: { progress: standing.gapProgress, from: `YOU ${fmt2(score)}`, to: `#${above.rank} ${fmt2(above.score)}` },
      }
      : { kicker: 'GET STARTED', title: 'Log your first 60s set to rank up', bar: undefined };

  const boardList: BoardRow[] = useMemo(
    () => filterByGender(
      boardRows.map(r => ({ user_id: r.user_id, name: r.display_name, points: Number(r.value) || 0, country: r.country, gender: r.gender })),
      gender,
    ),
    [boardRows, gender],
  );
  const you = youBarSubline(boardList, user?.id, score, 'Endurance');
  const unfiltered = scope === 'public' && gender === 'ALL';
  const youRankText = you.index >= 0 ? `#${you.index + 1}` : unfiltered && standing.isRanked ? `#${summary?.myRank}` : '—';
  const youSub = you.index < 0 && unfiltered && standing.isRanked && above && standing.gapToPass != null
    ? `${fmt2(standing.gapToPass)} pts to pass ${above.name}`
    : you.text;

  const toastNode = <WorldToast tokens={t} message={toast} onHide={() => setToast(null)} />;

  return (
    <GlobalErrorBoundary>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <WorldHeader
          tokens={t}
          icon="stopwatch"
          title="ENDURANCE WORLD"
          onBackToJourney={returnTo === 'journey' ? () => goBackOrReturnTo('/one-min-max') : undefined}
        />
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <DashboardRings
            tokens={t}
            worldLabel="1MM"
            rank={standing.isRanked ? (summary?.myRank ?? stats?.ranks.glory ?? null) : null}
            isKing={standing.isKing}
            rankProgress={standing.rankProgress}
            score={score}
            scoreText={fmt2(score)}
            scoreProgress={standing.topProgress}
            gap={gap}
            onOpenLeaderboard={openBoard}
            scoreRef={scoreCircleRef}
            onScoreLayout={onScoreCircleLayout}
          />

          <View style={{ paddingTop: 26, paddingHorizontal: 24, paddingBottom: 10 }}>
            <SegmentedSwitch tokens={t} items={levelTabs} active={level} onChange={onPickLevel} height={50} fontSize={13} accessibilityLabel="Endurance level" />
          </View>

          <View ref={movementGridRef} onLayout={onMovementGridLayout} collapsable={false} style={{ gap: 10, paddingHorizontal: 24 }}>
            {loading && !stats
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={78} borderRadius={20} />)
              : ONEMM_MOVEMENTS.filter(m => m.categoryId === level).map((m, i) => (
                <MovementRow
                  key={m.id}
                  tokens={t}
                  movement={m}
                  pb={pbs[m.id] ?? 0}
                  worldBest={summary?.movementBests[m.id]}
                  onLog={() => openLog(m, 'log')}
                  onTimer={() => { openLog(m, 'timer'); if (i === 0) reportTimerBadge(); }}
                  timerRef={i === 0 ? timerBadgeRef : undefined}
                  onTimerLayout={i === 0 ? onTimerBadgeLayout : undefined}
                />
              ))}
          </View>

          <View style={{ paddingTop: 26, paddingHorizontal: 24, paddingBottom: 28 }}>
            <GoalCard tokens={t} icon="stopwatch" king={standing.isKing} kicker={goal.kicker} title={goal.title} bar={goal.bar} footer={QUOTE} />
          </View>
        </ScrollView>

        {!sheet && toastNode}
      </View>

      <WorldSheet
        tokens={t}
        visible={!!sheet}
        onClose={() => { closeSheet(); if (shown.kind === 'log') reportTimerClose(); }}
        variant={shown.kind === 'board' ? 'board' : 'log'}
        closeRef={shown.kind === 'log' ? timerCloseRef : undefined}
        onCloseLayout={shown.kind === 'log' ? onTimerCloseLayout : undefined}
        kicker={shown.kind === 'board'
          ? <BoardKicker tokens={t} icon="stopwatch" text="ENDURANCE WORLD · 1MM" />
          : logKicker(shown.movementId, pbs)}
        title={shown.kind === 'board' ? 'LEADERBOARD' : (ONEMM_MOVEMENTS.find(m => m.id === shown.movementId)?.name ?? '').toUpperCase()}
        footer={shown.kind === 'board' ? (
          <YouBar
            tokens={t}
            rankText={youRankText}
            king={you.index === 0}
            ranked={you.index >= 0 || (unfiltered && standing.isRanked)}
            handle={profile?.display_name || 'You'}
            sub={youSub}
            scoreText={fmt2(score)}
          />
        ) : undefined}
        overlay={
          <>
            {shown.kind === 'log' && (
              <>
                <TutorialModalOverlay targetIds={['onemm.startSprintButton', 'onemm.timerCloseButton']} />
                <PBOverwriteConfirmModal
                  visible={pendingOverwrite !== null}
                  theme={theme}
                  accentColor={t.accent}
                  movementName={ONEMM_MOVEMENTS.find(m => m.id === shown.movementId)?.name || ''}
                  unitLabel=" REPS"
                  currentBest={pbs[shown.movementId] ?? 0}
                  attemptValue={pendingOverwrite ?? 0}
                  saving={saving}
                  onKeepBest={() => setPendingOverwrite(null)}
                  onSaveAnyway={() => { if (pendingOverwrite !== null) handleSaveResult(pendingOverwrite, true); }}
                />
              </>
            )}
            {!!sheet && toastNode}
          </>
        }
      >
        {shown.kind === 'board' ? (
          <View>
            <BoardFilters
              tokens={t}
              inCommunity={!!profile?.community_id}
              scope={scope}
              onScope={(s) => { setManualScope(s); fetchBoard(s); }}
              gender={gender}
              onGender={setGender}
              style={{ paddingTop: 14, paddingHorizontal: 24 }}
            />
            <LeaderboardBody tokens={t} rows={boardList} myId={user?.id} loading={boardLoading} />
          </View>
        ) : (
          <LogSheetBody
            tokens={t}
            movementId={shown.movementId}
            mode={shown.mode}
            onMode={setMode}
            pb={pbs[shown.movementId] ?? 0}
            repsRaw={repsRaw}
            setRepsRaw={setRepsRaw}
            timer={timer}
            onLog={onLogPress}
            saving={saving}
            isSlowSave={isSlowSave}
            top={movementTop}
            myId={user?.id}
            startRef={startSprintRef}
            onStartLayout={onStartSprintLayout}
          />
        )}
      </WorldSheet>

      <CelebrationBanner
        visible={showCelebration}
        title={celebrationData.movement?.toUpperCase()}
        subtitle="NEW PR"
        stat={celebrationData.stat}
        emoji="🔥"
        userName={profile?.display_name || user?.email?.split('@')[0] || 'Warrior'}
        onDismiss={() => setShowCelebration(false)}
        headerText="ENDURANCE WORLD"
        showLeapLogo
        accentColor={t.accent}
      />
    </GlobalErrorBoundary>
  );
}

function logKicker(movementId: string, pbs: Record<string, number>): string {
  const m = ONEMM_MOVEMENTS.find(x => x.id === movementId);
  const pb = pbs[movementId] ?? 0;
  return `${m ? ONEMM_CATEGORIES[m.categoryId].name : ''} · 1 MINUTE MAX${pb > 0 ? ` · PB ${pb} REPS` : ''}`;
}

// ---------------------------------------------------------------- rows

function MovementRow({ tokens: t, movement, pb, worldBest, onLog, onTimer, timerRef, onTimerLayout }: {
  tokens: WorldKitTokens; movement: OneMMMovement; pb: number; worldBest?: number;
  onLog: () => void; onTimer: () => void; timerRef?: React.Ref<View>; onTimerLayout?: () => void;
}) {
  const logged = pb > 0;
  // World best from get_world_summary; until it loads, fall back to your own PB.
  const best = Math.max(worldBest ?? 0, pb);
  const ratio = best > 0 ? pb / best : 0;
  const pts = calculateOneMMPoints(pb, movement.categoryId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${movement.name}${logged ? `, best ${pb} reps` : ''}. Log reps`}
      onPress={onLog}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 20, minWidth: 0,
        backgroundColor: logged ? t.tint : t.emptyRowBg,
        borderWidth: 1, borderColor: logged ? t.tintBorderStrong : t.emptyRowBorder,
      }}
    >
      <AnimatedRing size={54} radius={24} strokeWidth={3} progress={ratio} color={t.accent} trackColor={t.track} delay={150} duration={900}>
        <View style={{ alignItems: 'center' }}>
          <Text style={kt('bold', logged ? 17 : 16, logged ? t.text : t.textEmpty, 0, logged ? 19 : 18)}>{logged ? String(pb) : '—'}</Text>
          {logged && <Text style={kt('semibold', 8.5, t.textFaint, 1)}>REPS</Text>}
        </View>
      </AnimatedRing>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={kt('bold', 16, t.text, 1.1, 18.5)} numberOfLines={1}>{movement.name.toUpperCase()}</Text>
        <Text style={[kt('semibold', 11, logged ? t.accentText : t.textFaint, 1.1), { marginTop: 3 }]} numberOfLines={1}>
          {logged ? `${fmt2(pts)} PTS · ${Math.round(clamp01(ratio) * 100)}% OF WORLD BEST` : 'TAP TO LOG · OR RUN TIMER'}
        </Text>
      </View>
      <View ref={timerRef} onLayout={onTimerLayout} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Run 60 second timer for ${movement.name}`}
          onPress={onTimer}
          hitSlop={6}
          style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: pressed ? t.accentHover : t.accent, alignItems: 'center', justifyContent: 'center' })}
        >
          <KitIcon name="stopwatch" size={18} color="#ffffff" />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------ log sheet

function LogSheetBody({
  tokens: t, movementId, mode, onMode, pb, repsRaw, setRepsRaw, timer, onLog, saving, isSlowSave,
  top, myId, startRef, onStartLayout,
}: {
  tokens: WorldKitTokens; movementId: string; mode: 'log' | 'timer'; onMode: (m: 'log' | 'timer') => void;
  pb: number; repsRaw: string; setRepsRaw: (s: string) => void;
  timer: ReturnType<typeof useOneMinuteTimer>; onLog: () => void; saving: boolean; isSlowSave: boolean;
  top: OneMMRanking[]; myId?: string; startRef?: React.Ref<View>; onStartLayout?: () => void;
}) {
  const m = ONEMM_MOVEMENTS.find(x => x.id === movementId);
  const mult = m ? ONEMM_CATEGORIES[m.categoryId].multiplier : 0;
  const reps = parseInt(repsRaw, 10) || 0;
  const isPb = reps > pb;
  const chip = isPb
    ? { text: pb > 0 ? 'NEW PB' : 'FIRST SET', filled: true }
    : { text: pb > 0 ? `PB ${pb} REPS` : 'ADD REPS', filled: false };
  const adjust = (d: number) => setRepsRaw(String(Math.min(MAX_REPS, Math.max(0, reps + d))));

  const topRows = top.slice(0, 6).map(r => ({ key: r.user_id, name: r.display_name, you: r.user_id === myId, value: `${r.value} REPS` }));

  return (
    <View style={{ paddingHorizontal: 24 }}>
      <View style={{ marginTop: 16 }}>
        <SegmentedSwitch
          tokens={t}
          items={[{ key: 'log', label: 'LOG REPS' }, { key: 'timer', label: '60S TIMER' }]}
          active={mode}
          onChange={onMode}
          accessibilityLabel="Log mode"
        />
      </View>

      {mode === 'log' ? (
        <>
          <View style={{ marginTop: 14, borderRadius: 22, backgroundColor: t.tint, borderWidth: 1, borderColor: t.tintBorder, paddingVertical: 18, paddingHorizontal: 14, gap: 14, alignItems: 'center' }}>
            <Text style={kt('medium', 10.5, t.textMuted, 2)}>REPS IN 60 SECONDS</Text>
            <NumberField
              tokens={t}
              value={repsRaw}
              onChangeText={raw => setRepsRaw(raw.replace(/[^0-9]/g, '').slice(0, 3))}
              unit="REPS"
              hint="TAP TO TYPE"
              maxLength={3}
              accessibilityLabel="Reps in 60 seconds"
            />
            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              {[-5, -1, 1, 5].map(d => (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={`${d > 0 ? 'Add' : 'Remove'} ${Math.abs(d)} reps`}
                  onPress={() => adjust(d)}
                  style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.buttonTint, borderWidth: 1, borderColor: t.tintBorder, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={kt('semibold', 15, t.text)}>{`${d > 0 ? '+' : '−'}${Math.abs(d)}`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <ThisSetRow tokens={t} points={fmt2(reps * mult)} chip={chip} />
          <KitButton tokens={t} label="LOG PERFORMANCE" onPress={onLog} loading={saving} disabled={reps <= 0} />
          {isSlowSave && (
            <Text style={[kt('regular', 13, t.textSecondary), { textAlign: 'center', marginTop: 8 }]}>Still submitting — hang tight...</Text>
          )}
        </>
      ) : (
        <TimerPanel tokens={t} timer={timer} startRef={startRef} onStartLayout={onStartLayout} />
      )}

      <TopList tokens={t} title="TOP 60S SETS" rightLabel={`×${mult} PTS / REP`} rows={topRows} emptyText="NO SETS LOGGED YET" />
    </View>
  );
}

function TimerPanel({ tokens: t, timer, startRef, onStartLayout }: {
  tokens: WorldKitTokens; timer: ReturnType<typeof useOneMinuteTimer>;
  startRef?: React.Ref<View>; onStartLayout?: () => void;
}) {
  const { phase, countdown, left, taps } = timer;
  const progress = phase === 'ready'
    ? (ONE_MINUTE_COUNTDOWN + 1 - countdown) / ONE_MINUTE_COUNTDOWN
    : phase === 'run' ? left / ONE_MINUTE_SECONDS : 1;
  const label = phase === 'ready' ? 'GET READY' : phase === 'run' ? 'TIME LEFT' : '1 MINUTE MAX';
  const big = phase === 'ready' ? String(countdown) : phase === 'run' ? String(Math.ceil(left)) : String(ONE_MINUTE_SECONDS);
  const sub = phase === 'run' ? `${taps} REPS` : phase === 'ready' ? 'GET INTO POSITION' : 'SECONDS';

  const tapRep = () => {
    if (timer.addRep()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <View>
      <View style={{ alignItems: 'center', paddingTop: 22, paddingBottom: 16 }}>
        <Pressable
          onPress={tapRep}
          disabled={phase !== 'run'}
          accessibilityRole="button"
          accessibilityLabel={phase === 'run' ? `Count a rep, ${taps} so far` : label}
        >
          <AnimatedRing
            size={210} radius={97} strokeWidth={6}
            progress={progress} color={t.accent} trackColor={t.track}
            duration={phase === 'run' ? 100 : 600}
            linear={phase === 'run'}
          >
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={kt('medium', 11, t.textMuted, 2.2)}>{label}</Text>
              <Text style={kt('bold', phase === 'ready' ? 76 : 64, t.text, 0, phase === 'ready' ? 84 : 72)}>{big}</Text>
              <Text style={kt('semibold', 12, t.accentText, 1.4)}>{sub}</Text>
            </View>
          </AnimatedRing>
        </Pressable>
      </View>

      {phase === 'idle' && (
        <View style={{ gap: 10 }}>
          <View ref={startRef} onLayout={onStartLayout} collapsable={false}>
            <KitButton tokens={t} label="START 60S" icon="play" onPress={timer.start} />
          </View>
          <Text style={[kt('regular', 12, t.textMuted, 0.4), { textAlign: 'center' }]}>Tap the ring on every rep to count as you go.</Text>
        </View>
      )}
      {phase === 'ready' && <KitButton tokens={t} label="CANCEL" variant="outline" onPress={timer.cancel} />}
      {phase === 'run' && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <KitButton tokens={t} label="+1 REP" height={64} fontSize={18} onPress={tapRep} style={{ flex: 2 }} />
          <KitButton tokens={t} label="STOP" variant="outline" height={64} fontSize={14} onPress={timer.stop} style={{ flex: 1, borderWidth: 1 }} />
        </View>
      )}
    </View>
  );
}
