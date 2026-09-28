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
  WorldPage, WorldSheet, WorldToast, YouBar, Gender,
} from '../components/worlds/kit';
import { t as tr } from '../i18n';

type Level = 'entry' | 'main' | 'advanced';
type SheetState =
  | { kind: 'log'; movementId: string; mode: 'log' | 'timer' }
  | { kind: 'board' }
  | null;

const LEVELS: Level[] = ['entry', 'main', 'advanced'];
/** Strength tier each level unlocks at (ONEMM_CATEGORIES tiers). */
const LEVEL_UNLOCK_TIER: Record<Level, number> = { entry: 0, main: 3, advanced: 5 };
const MAX_REPS = 150;
const QUOTE = tr('enduranceWorld.quote');
// Category names (ENTRY/MAIN/ADVANCED) shown in the user's language.
const catName = (c: keyof typeof ONEMM_CATEGORIES) => tr(`enduranceWorld.cat_${c}` as 'enduranceWorld.cat_entry');

const isLevelLocked = (level: Level, tier: number) => tier < LEVEL_UNLOCK_TIER[level];

export function OneMinMaxScreen({ category }: { category?: string }) {
  const { theme, mode } = useTheme();
  const t = useMemo(() => getWorldKitTokens('onemm', mode), [mode]);
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

  // Latest-request guards: when the user switches tier/scope/movement quickly,
  // an older response resolving last must not overwrite the current list.
  const boardReq = useRef(0);
  const topReq = useRef(0);

  const fetchBoard = useCallback(async (s: 'public' | 'community') => {
    const req = ++boardReq.current;
    setBoardLoading(true);
    try {
      const communityId = s === 'community' ? profile?.community_id : null;
      const data = await OneMMService.getLeaderboard('overall', undefined, communityId);
      if (isMounted.current && req === boardReq.current) setBoardRows(data);
    } catch (e) {
      console.error('1MM board error:', e);
    } finally {
      if (isMounted.current && req === boardReq.current) setBoardLoading(false);
    }
  }, [profile?.community_id, isMounted]);

  const fetchMovementTop = useCallback(async (movementId: string) => {
    const req = ++topReq.current;
    setMovementTop([]);
    try {
      const data = await OneMMService.getLeaderboard(movementId);
      if (isMounted.current && req === topReq.current) setMovementTop(data);
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
    ? { label: tr('worlds.status'), value: tr('worlds.king'), sub: tr('worlds.firstOfWorld'), progress: 1, gold: true }
    : standing.isRanked && above && standing.gapToPass != null
      ? { label: tr('worlds.gapTo', { rank: above.rank }), value: fmt2(standing.gapToPass), sub: tr('worlds.ptsToPass'), progress: standing.gapProgress }
      : { label: tr('worlds.gapToEmpty'), value: '—', sub: tr('worlds.rankUp'), progress: 0, empty: true };

  // ------------------------------------------------------------- sheets

  const openLog = (m: OneMMMovement, sheetMode: 'log' | 'timer') => {
    if (isLevelLocked(m.categoryId, tier) || m.minTier > tier) {
      setToast(tr('enduranceWorld.reachTier', { tier: Math.max(m.minTier, LEVEL_UNLOCK_TIER[m.categoryId]) }));
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
    setToast(tr('enduranceWorld.timeUp'));
  });

  const closeSheet = () => {
    if (timer.phase !== 'idle') {
      const abandon = () => { timer.cancel(); setSheet(null); };
      if (Platform.OS === 'web') {
        if (window.confirm(tr('enduranceWorld.abandonWeb'))) abandon();
      } else {
        Alert.alert(tr('enduranceWorld.abandonTitle'), tr('enduranceWorld.abandonWeb'), [
          { text: tr('enduranceWorld.keepFighting'), style: 'cancel' },
          { text: tr('enduranceWorld.abandon'), style: 'destructive', onPress: abandon },
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

  const handleSaveResult = (reps: number, force = false, forMovementId?: string) => {
    // The movement travels with a retry, so Try Again still works if the
    // sheet was closed while the first attempt was in flight.
    const movementId = forMovementId ?? (sheet?.kind === 'log' ? sheet.movementId : undefined);
    if (!user || !movementId) return;
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
        if (isMounted.current) setCelebrationData({ stat: tr('enduranceWorld.repsValue', { reps }), movement: name });
        NotificationService.notify(user.id, 'one_mm_pb', tr('enduranceWorld.pushTitle'), tr('enduranceWorld.pushBody', { name, reps }), { screen: 'one-min-max' });
        if (overtakenNotificationId) NotificationService.sendOvertakeNotificationPush(overtakenNotificationId);
        if (wraOvertakenNotificationId) NotificationService.sendOvertakeNotificationPush(wraOvertakenNotificationId);
      }
    }, {
      onSuccess: () => {
        const mult = movement ? ONEMM_CATEGORIES[movement.categoryId].multiplier : 0;
        setPendingOverwrite(null);
        setSheet(null);
        setToast(isPB
          ? (currentBest > 0 ? tr('worlds.newPb', { pts: fmt2((reps - currentBest) * mult) }) : tr('enduranceWorld.firstSet', { pts: fmt2(reps * mult) }))
          // A confirmed overwrite replaces the PB even though it isn't "new".
          : force ? tr('enduranceWorld.pbReplaced', { reps }) : tr('enduranceWorld.loggedUnchanged'));
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
        Alert.alert(tr('worlds.error'), describeSubmitError(error, tr('enduranceWorld.saveFailed')), [
          { text: tr('worlds.cancel'), style: 'cancel' },
          { text: tr('worlds.tryAgain'), onPress: () => handleSaveResult(reps, force, movementId) },
        ]);
      },
    });
  };

  const onLogPress = () => {
    const reps = parseInt(repsRaw, 10);
    if (isNaN(reps) || reps <= 0 || reps > MAX_REPS) {
      Alert.alert(tr('worlds.invalid'), tr('enduranceWorld.invalidReps', { max: MAX_REPS }));
      return;
    }
    handleSaveResult(reps);
  };

  // ---------------------------------------------------------- rendering

  const pbs = stats?.pbs ?? {};
  const levelTabs = LEVELS.map(l => {
    const moves = ONEMM_MOVEMENTS.filter(m => m.categoryId === l);
    const logged = moves.filter(m => (pbs[m.id] ?? 0) > 0).length;
    return { key: l, label: catName(l), sub: tr('enduranceWorld.loggedOf', { logged, total: moves.length }), locked: isLevelLocked(l, tier) };
  });

  const onPickLevel = (l: Level) => {
    if (isLevelLocked(l, tier)) {
      setToast(tr('enduranceWorld.reachTierLevel', { tier: LEVEL_UNLOCK_TIER[l], level: catName(l) }));
      return;
    }
    setLevel(l);
  };

  const goal = standing.isKing
    ? { kicker: tr('worlds.youreFirst'), title: tr('enduranceWorld.kingAchieved'), bar: undefined }
    : standing.isRanked && above && standing.gapToPass != null
      ? {
        kicker: tr('worlds.nextTarget'),
        title: tr('worlds.stealRank', { pts: fmt2(standing.gapToPass), rank: above.rank }),
        bar: { progress: standing.gapProgress, from: tr('worlds.youScore', { score: fmt2(score) }), to: `#${above.rank} ${fmt2(above.score)}` },
      }
      : { kicker: tr('worlds.getStarted'), title: tr('enduranceWorld.getStartedGoal'), bar: undefined };

  const boardList: BoardRow[] = useMemo(
    () => filterByGender(
      boardRows.map(r => ({ user_id: r.user_id, name: r.display_name, points: Number(r.value) || 0, country: r.country, gender: r.gender })),
      gender,
    ),
    [boardRows, gender],
  );
  const you = youBarSubline(boardList, user?.id, score, tr('enduranceWorld.nameForKing'));
  const unfiltered = scope === 'public' && gender === 'ALL';
  const youRankText = you.index >= 0 ? `#${you.index + 1}` : unfiltered && standing.isRanked ? `#${summary?.myRank}` : '—';
  const youSub = you.index < 0 && unfiltered && standing.isRanked && above && standing.gapToPass != null
    ? tr('staticWorld.passName', { pts: fmt2(standing.gapToPass), name: above.name })
    : you.text;

  const toastNode = <WorldToast tokens={t} message={toast} onHide={() => setToast(null)} />;

  return (
    <GlobalErrorBoundary>
      <WorldPage tokens={t}>
        <WorldHeader
          tokens={t}
          icon="stopwatch"
          title={tr('enduranceWorld.title')}
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
            <SegmentedSwitch tokens={t} items={levelTabs} active={level} onChange={onPickLevel} height={50} fontSize={13} accessibilityLabel={tr('enduranceWorld.levelA11y')} />
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
      </WorldPage>

      <WorldSheet
        tokens={t}
        visible={!!sheet}
        onClose={() => { closeSheet(); if (shown.kind === 'log') reportTimerClose(); }}
        variant={shown.kind === 'board' ? 'board' : 'log'}
        closeRef={shown.kind === 'log' ? timerCloseRef : undefined}
        onCloseLayout={shown.kind === 'log' ? onTimerCloseLayout : undefined}
        kicker={shown.kind === 'board'
          ? <BoardKicker tokens={t} icon="stopwatch" text={tr('enduranceWorld.boardKicker')} />
          : logKicker(shown.movementId, pbs)}
        title={shown.kind === 'board' ? tr('worlds.leaderboard') : (ONEMM_MOVEMENTS.find(m => m.id === shown.movementId)?.name ?? '').toUpperCase()}
        footer={shown.kind === 'board' ? (
          <YouBar
            tokens={t}
            rankText={youRankText}
            king={you.index === 0}
            ranked={you.index >= 0 || (unfiltered && standing.isRanked)}
            handle={profile?.display_name || tr('worlds.you')}
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
                  unitLabel={` ${tr('enduranceWorld.reps')}`}
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
        userName={profile?.display_name || user?.email?.split('@')[0] || tr('worlds.warrior')}
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
  const category = m ? catName(m.categoryId as keyof typeof ONEMM_CATEGORIES) : '';
  return pb > 0 ? tr('enduranceWorld.logKickerPb', { category, reps: pb }) : tr('enduranceWorld.logKicker', { category });
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
      accessibilityLabel={logged ? tr('enduranceWorld.rowA11yBest', { name: movement.name, reps: pb }) : tr('enduranceWorld.rowA11y', { name: movement.name })}
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
          {logged && <Text style={kt('semibold', 8.5, t.textFaint, 1)}>{tr('enduranceWorld.reps')}</Text>}
        </View>
      </AnimatedRing>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={kt('bold', 16, t.text, 1.1, 18.5)} numberOfLines={1}>{movement.name.toUpperCase()}</Text>
        <Text style={[kt('semibold', 11, logged ? t.accentText : t.textFaint, 1.1), { marginTop: 3 }]} numberOfLines={1}>
          {logged ? tr('enduranceWorld.rowLogged', { pts: fmt2(pts), pct: Math.round(clamp01(ratio) * 100) }) : tr('enduranceWorld.rowEmpty')}
        </Text>
      </View>
      <View ref={timerRef} onLayout={onTimerLayout} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('enduranceWorld.runTimerA11y', { name: movement.name })}
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
    ? { text: pb > 0 ? tr('enduranceWorld.newPbChip') : tr('enduranceWorld.firstSetChip'), filled: true }
    : { text: pb > 0 ? tr('enduranceWorld.pbChip', { reps: pb }) : tr('enduranceWorld.addReps'), filled: false };
  const adjust = (d: number) => setRepsRaw(String(Math.min(MAX_REPS, Math.max(0, reps + d))));

  const topRows = top.slice(0, 6).map(r => ({ key: r.user_id, name: r.display_name, you: r.user_id === myId, value: tr('enduranceWorld.repsValue', { reps: r.value }) }));

  return (
    <View style={{ paddingHorizontal: 24 }}>
      <View style={{ marginTop: 16 }}>
        <SegmentedSwitch
          tokens={t}
          items={[{ key: 'log', label: tr('enduranceWorld.logReps') }, { key: 'timer', label: tr('enduranceWorld.timer60') }]}
          active={mode}
          onChange={onMode}
          accessibilityLabel={tr('worlds.logMode')}
        />
      </View>

      {mode === 'log' ? (
        <>
          <View style={{ marginTop: 14, borderRadius: 22, backgroundColor: t.tint, borderWidth: 1, borderColor: t.tintBorder, paddingVertical: 18, paddingHorizontal: 14, gap: 14, alignItems: 'center' }}>
            <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr('enduranceWorld.repsIn60')}</Text>
            <NumberField
              tokens={t}
              value={repsRaw}
              onChangeText={raw => setRepsRaw(raw.replace(/[^0-9]/g, '').slice(0, 3))}
              unit="REPS"
              hint={tr('enduranceWorld.tapToType')}
              maxLength={3}
              accessibilityLabel={tr('enduranceWorld.repsIn60')}
            />
            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              {[-5, -1, 1, 5].map(d => (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={d > 0 ? tr('enduranceWorld.addRepsA11y', { n: Math.abs(d) }) : tr('enduranceWorld.removeRepsA11y', { n: Math.abs(d) })}
                  onPress={() => adjust(d)}
                  style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.buttonTint, borderWidth: 1, borderColor: t.tintBorder, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={kt('semibold', 15, t.text)}>{`${d > 0 ? '+' : '−'}${Math.abs(d)}`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <ThisSetRow tokens={t} points={fmt2(reps * mult)} chip={chip} />
          <KitButton tokens={t} label={tr('worlds.logPerformance')} onPress={onLog} loading={saving} disabled={reps <= 0} />
          {isSlowSave && (
            <Text style={[kt('regular', 13, t.textSecondary), { textAlign: 'center', marginTop: 8 }]}>{tr('worlds.stillSubmitting')}</Text>
          )}
        </>
      ) : (
        <TimerPanel tokens={t} timer={timer} startRef={startRef} onStartLayout={onStartLayout} />
      )}

      <TopList tokens={t} title={tr('enduranceWorld.top60')} rightLabel={tr('enduranceWorld.ptsPerRep', { mult })} rows={topRows} emptyText={tr('enduranceWorld.noSets')} />
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
  const label = phase === 'ready' ? tr('worlds.getReady') : phase === 'run' ? tr('enduranceWorld.timeLeft') : tr('enduranceWorld.oneMinuteMax');
  const big = phase === 'ready' ? String(countdown) : phase === 'run' ? String(Math.ceil(left)) : String(ONE_MINUTE_SECONDS);
  const sub = phase === 'run' ? tr('enduranceWorld.repsValue', { reps: taps }) : phase === 'ready' ? tr('staticWorld.getIntoPosition') : tr('enduranceWorld.seconds');

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
            <KitButton tokens={t} label={tr('enduranceWorld.start60')} icon="play" onPress={timer.start} />
          </View>
          <Text style={[kt('regular', 12, t.textMuted, 0.4), { textAlign: 'center' }]}>{tr('enduranceWorld.tapRing')}</Text>
        </View>
      )}
      {phase === 'ready' && <KitButton tokens={t} label={tr('worlds.cancelCaps')} variant="outline" onPress={timer.cancel} />}
      {phase === 'run' && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <KitButton tokens={t} label={tr('enduranceWorld.plusRep')} height={64} fontSize={18} onPress={tapRep} style={{ flex: 2 }} />
          <KitButton tokens={t} label={tr('enduranceWorld.stop')} variant="outline" height={64} fontSize={14} onPress={timer.stop} style={{ flex: 1, borderWidth: 1 }} />
        </View>
      )}
    </View>
  );
}
