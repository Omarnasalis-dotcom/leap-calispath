import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { POWER_MOVEMENTS, POWER_LEVELS, getPowerLevel, calculatePowerPoints, PowerMovement } from '../lib/powerLogic';
import { PowerService, PowerUserStats, PowerMovementRanking } from '../services/PowerService';
import { describeSubmitError } from '../lib/submitErrors';
import { useSlowSubmitNotice } from '../hooks/useSlowSubmitNotice';
import { useSafeAsync } from '../hooks/useSafeAsync';
import { useMountedRef } from '../hooks/useMountedRef';
import { useWorldSummary } from '../hooks/useWorldSummary';
import { useTutorialTarget } from '../hooks/useTutorialTarget';
import { useReturnTo } from '../hooks/useReturnTo';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { Skeleton } from '../components/Skeleton';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { PBOverwriteConfirmModal } from '../components/PBOverwriteConfirmModal';
import { NotificationService } from '../services/NotificationService';
import { getWorldKitTokens, WorldKitTokens } from '../../constants/worldKitTokens';
import { deriveStanding, fmt2, youBarSubline, BoardRow } from '../lib/worldStanding';
import { powerWithinLevel } from '../lib/worldProgress';
import {
  addPlate, barWidth, hiddenPlates, parseKgInput, Plate, PLATES, PLATE_STYLE, MAX_DRAWN_PLATES,
  setKg as plateSetKg, undoPlate,
} from '../lib/plates';
import {
  BoardFilters, BoardKicker, DashboardRings, EliteList, filterByGender, GoalCard, KitBar, KitButton,
  KitIcon, kt, LeaderboardBody, NumberField, SegmentedSwitch, ThisSetRow, TopList, WorldHeader,
  WorldSheet, WorldToast, YouBar, Gender,
} from '../components/worlds/kit';

type Tier = 'all' | '1' | '2' | '3';
type SheetState = { kind: 'log'; movementId: string } | { kind: 'board' } | null;

const MAX_KG = 500;
const QUOTE = 'TAKE THE LEAP. CLAIM YOUR POWER.';

/** Row labels per the handoff; squat is loaded as a barbell, the rest as added weight. */
const MOVE_UI: Record<string, { name: string; note: string }> = {
  pull_up: { name: 'PULL-UP', note: 'ADDED WEIGHT' },
  dip: { name: 'DIP', note: 'ADDED WEIGHT' },
  squat: { name: 'SQUAT', note: 'BARBELL' },
  muscle_up: { name: 'MUSCLE-UP', note: 'ADDED WEIGHT' },
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function PowerWorldScreen() {
  const { theme, mode } = useTheme();
  const t = getWorldKitTokens('power', mode);
  const { user, profile, refreshProfile } = useAuth();
  const { returnTo, goBackOrReturnTo, completeQuestAndReturn } = useReturnTo();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave, isExecuting: saving } = useSafeAsync();
  const isSlowSave = useSlowSubmitNotice(saving);
  const { ref: scoreCircleRef, onLayout: onScoreCircleLayout } = useTutorialTarget('power.scoreCircle');
  const { ref: movementRowRef, onLayout: onMovementRowLayout } = useTutorialTarget('power.movementRow');

  const [stats, setStats] = useState<PowerUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { summary, refresh: refreshSummary } = useWorldSummary('power', !!user);

  const [tier, setTier] = useState<Tier>('all');
  const [eliteRows, setEliteRows] = useState<PowerMovementRanking[]>([]);
  const [eliteLoading, setEliteLoading] = useState(false);

  const [sheet, setSheet] = useState<SheetState>(null);
  const lastSheet = useRef<Exclude<SheetState, null>>({ kind: 'board' });
  if (sheet) lastSheet.current = sheet;
  const shown = sheet ?? lastSheet.current;

  // Plate loader: kg is the truth, stack is its picture.
  const [kg, setKgState] = useState(0);
  const [kgRaw, setKgRaw] = useState<string | null>(null);
  const [stack, setStack] = useState<Plate[]>([]);
  const [movementTop, setMovementTop] = useState<PowerMovementRanking[]>([]);
  const [pendingOverwrite, setPendingOverwrite] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [boardRows, setBoardRows] = useState<PowerMovementRanking[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [gender, setGender] = useState<Gender>('ALL');
  const [scope, setScope] = useState<'public' | 'community'>('public');

  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationProps, setCelebrationProps] = useState<any>({});

  // ------------------------------------------------------------------ data

  const isFetchingRef = useRef(false);
  const fetchStats = useCallback(async () => {
    if (!user || isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const s = await PowerService.getUserStats(user.id);
      if (isMounted.current) setStats(s);
    } catch (e) {
      console.error('Fetch power error:', e);
    } finally {
      isFetchingRef.current = false;
      if (isMounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [user, isMounted]);

  useFocusEffect(useCallback(() => { fetchStats(); }, [fetchStats]));

  const communityIdFor = (s: 'public' | 'community') => (s === 'community' ? profile?.community_id ?? null : null);

  const fetchElite = useCallback(async (level: Tier, s: 'public' | 'community') => {
    if (level === 'all') return;
    setEliteLoading(true);
    setEliteRows([]);
    try {
      const data = await PowerService.getLeaderboard(`level_${level}` as any, communityIdFor(s));
      if (isMounted.current) setEliteRows(data);
    } finally {
      if (isMounted.current) setEliteLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.community_id, isMounted]);

  const fetchBoard = useCallback(async (s: 'public' | 'community') => {
    setBoardLoading(true);
    try {
      const data = await PowerService.getLeaderboard('glory', communityIdFor(s));
      if (isMounted.current) setBoardRows(data);
    } finally {
      if (isMounted.current) setBoardLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.community_id, isMounted]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
    refreshSummary();
    if (tier !== 'all') fetchElite(tier, scope);
  };

  // ------------------------------------------------------------- standing

  const score = summary ? summary.myScore : stats?.totalPoints ?? 0;
  const standing = deriveStanding({
    rank: summary ? summary.myRank : (stats?.ranks.glory || null),
    rankedCount: summary?.rankedCount ?? 0,
    score,
    topScore: summary?.topScore ?? 0,
    above: summary?.above ?? null,
  });
  const above = summary?.above ?? null;
  const level = powerWithinLevel(score);

  // Power's third circle is the LEVEL gap, not the gap to a person (§0.4).
  const gap = level.nextLevel
    ? { label: 'LEVEL GAP', value: fmt2(level.gap), sub: `PTS TO ${level.nextLevel.name}`, progress: level.progress }
    : { label: 'LEVEL GAP', value: 'MAX', sub: POWER_LEVELS[3].name, progress: 1 };

  const goal = standing.isKing
    ? { kicker: "YOU'RE #1", title: 'POWER KING ACHIEVED', bar: undefined }
    : standing.isRanked && above && standing.gapToPass != null
      ? {
        kicker: 'NEXT TARGET',
        title: `${fmt2(standing.gapToPass)} pts to steal Rank #${above.rank}`,
        bar: { progress: standing.gapProgress, from: `YOU ${fmt2(score)}`, to: `#${above.rank} ${fmt2(above.score)}` },
      }
      : {
        kicker: 'YOUR NEXT MAJOR MILESTONE',
        title: `${fmt2(POWER_LEVELS[2].minPoints)} points to ${titleCase(POWER_LEVELS[2].name)}`,
        bar: { progress: score / POWER_LEVELS[2].minPoints, from: `YOU ${fmt2(score)}`, to: `${POWER_LEVELS[2].name} ${fmt2(POWER_LEVELS[2].minPoints)}` },
      };

  // ------------------------------------------------------------- sheets

  const pbs = stats?.pbs ?? {};

  const openLog = (m: PowerMovement) => {
    const pb = pbs[m.id] ?? 0;
    const s = plateSetKg(pb);
    setKgState(s.kg);
    setStack(s.stack);
    setKgRaw(null);
    setPendingOverwrite(null);
    setMovementTop([]);
    setSheet({ kind: 'log', movementId: m.id });
    PowerService.getLeaderboard(m.id as any)
      .then(d => { if (isMounted.current) setMovementTop(d); })
      .catch(e => console.error('Power top lifts error:', e));
  };

  const openBoard = () => {
    setSheet({ kind: 'board' });
    fetchBoard(scope);
  };

  const closeSheet = () => {
    Keyboard.dismiss();
    setSheet(null);
  };

  const applyKg = (next: { kg: number; stack: Plate[] }, raw: string | null = null) => {
    setKgState(Math.min(MAX_KG, next.kg));
    setStack(next.stack);
    setKgRaw(raw);
  };

  // --------------------------------------------------------------- save

  const handleSave = (value: number, force = false) => {
    if (!user || !sheet || sheet.kind !== 'log' || saving) return;
    const movementId = sheet.movementId;
    if (isNaN(value) || value <= 0 || value > MAX_KG) {
      Alert.alert('Invalid', `Please enter a valid weight (0.1 - ${MAX_KG} kg).`);
      return;
    }
    const currentBest = pbs[movementId] ?? 0;
    // Strictly less-than: submit_power_assessment treats a tie as "not a new
    // PB" but not worse, so a tie no-ops instead of prompting.
    if (!force && currentBest > 0 && value < currentBest) {
      Keyboard.dismiss();
      setPendingOverwrite(value);
      return;
    }

    let isPB = false;
    const before = stats?.totalPoints ?? 0;
    runSafeSave(async () => {
      const { isNewPB, isPromotion, overtakenNotificationId, wraOvertakenNotificationId } =
        await PowerService.savePB(user.id, movementId, value, force);
      isPB = isNewPB;
      if (isNewPB) {
        const movement = POWER_MOVEMENTS.find(m => m.id === movementId);
        const newLevel = getPowerLevel(before - calculatePowerPoints(movementId, currentBest) + calculatePowerPoints(movementId, value));
        if (isMounted.current) {
          setCelebrationProps({
            title: isPromotion ? 'LEVEL PROMOTED!' : (MOVE_UI[movementId]?.name ?? movement?.name?.toUpperCase()),
            subtitle: isPromotion ? `WELCOME TO ${newLevel.name}` : 'NEW PR',
            stat: `${value} KG`,
            emoji: isPromotion ? '⚡' : '🔥',
            rank: isPromotion ? `LEVEL ${newLevel.id}` : undefined,
          });
        }
        NotificationService.notify(
          user.id,
          'power_pb',
          isPromotion ? 'Power Level Up!' : 'New Power PB!',
          isPromotion
            ? `${movement?.name ?? movementId}: ${value} KG — you've reached ${newLevel.name}.`
            : `${movement?.name ?? movementId}: ${value} KG — a new personal record.`,
          { screen: 'power-world' },
        );
        if (overtakenNotificationId) NotificationService.sendOvertakeNotificationPush(overtakenNotificationId);
        if (wraOvertakenNotificationId) NotificationService.sendOvertakeNotificationPush(wraOvertakenNotificationId);
      }
    }, {
      onSuccess: () => {
        const gained = calculatePowerPoints(movementId, value) - calculatePowerPoints(movementId, currentBest);
        setPendingOverwrite(null);
        setSheet(null);
        setToast(isPB
          ? (currentBest > 0 ? `NEW 1RM · +${fmt2(gained)} PTS` : `FIRST 1RM · ${fmt2(calculatePowerPoints(movementId, value))} PTS`)
          : 'LOGGED · 1RM UNCHANGED');
        fetchStats();
        refreshSummary();
        if (tier !== 'all') fetchElite(tier, scope);
        refreshProfile?.();
        // Wait for the sheet Modal to finish leaving before another Modal mounts.
        if (isPB) setTimeout(() => { if (isMounted.current) setShowCelebration(true); }, 450);
        setTimeout(() => { if (isMounted.current) completeQuestAndReturn(); }, 1800);
      },
      onError: (error: any) => {
        setPendingOverwrite(null);
        console.error('Power save error:', error);
        Alert.alert('Error', describeSubmitError(error, 'Failed to save PR.'), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try Again', onPress: () => handleSave(value, force) },
        ]);
      },
    });
  };

  // ---------------------------------------------------------- rendering

  const onPickTier = (k: Tier) => {
    setTier(k);
    if (k !== 'all') fetchElite(k, scope);
  };

  const eliteList: BoardRow[] = useMemo(
    () => filterByGender(
      eliteRows.map(r => ({ user_id: r.user_id, name: r.display_name, points: Number(r.points) || 0, country: r.country, gender: r.gender })),
      gender,
    ),
    [eliteRows, gender],
  );

  const boardList: BoardRow[] = useMemo(
    () => filterByGender(
      boardRows.map(r => {
        const pts = Number(r.points) || 0;
        return { user_id: r.user_id, name: r.display_name, points: pts, country: r.country, gender: r.gender, level: getPowerLevel(pts).name };
      }),
      gender,
    ),
    [boardRows, gender],
  );
  const you = youBarSubline(boardList, user?.id, score, 'Power');
  const unfiltered = scope === 'public' && gender === 'ALL';
  const youRankText = you.index >= 0 ? `#${you.index + 1}` : unfiltered && standing.isRanked ? `#${summary?.myRank ?? stats?.ranks.glory}` : '—';
  const youSub = you.index < 0
    ? (unfiltered && standing.isRanked && above && standing.gapToPass != null
      ? `${fmt2(standing.gapToPass)} pts to pass ${above.name}`
      : score > 0 ? 'Not in this filter' : 'Log a lift to join the board')
    : you.text;

  const toastNode = <WorldToast tokens={t} message={toast} onHide={() => setToast(null)} />;
  const logMove = shown.kind === 'log' ? POWER_MOVEMENTS.find(m => m.id === shown.movementId) : undefined;

  return (
    <GlobalErrorBoundary>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <WorldHeader
          tokens={t}
          icon="bolt"
          title="POWER WORLD"
          onBackToJourney={returnTo === 'journey' ? () => goBackOrReturnTo('/power-world') : undefined}
        />
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <DashboardRings
            tokens={t}
            worldLabel="POWER"
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

          <View ref={movementRowRef} onLayout={onMovementRowLayout} collapsable={false} style={{ gap: 10, paddingTop: 22, paddingHorizontal: 24 }}>
            {loading && !stats
              ? POWER_MOVEMENTS.map(m => <Skeleton key={m.id} width="100%" height={106} borderRadius={20} />)
              : POWER_MOVEMENTS.map(m => (
                <LiftRow key={m.id} tokens={t} movement={m} pb={pbs[m.id] ?? 0} worldBest={summary?.movementBests[m.id]} onPress={() => openLog(m)} />
              ))}
          </View>

          <View style={{ paddingTop: 30, paddingHorizontal: 24, paddingBottom: 28, gap: 16 }}>
            <SegmentedSwitch
              tokens={t}
              height={38}
              fontSize={12}
              active={tier}
              onChange={onPickTier}
              accessibilityLabel="Power level"
              items={[
                { key: 'all', label: 'ALL', crown: true },
                { key: '1', label: POWER_LEVELS[1].name },
                { key: '2', label: POWER_LEVELS[2].name },
                { key: '3', label: POWER_LEVELS[3].name },
              ]}
            />
            {tier === 'all' ? (
              <GoalCard tokens={t} icon="bolt" king={standing.isKing} kicker={goal.kicker} title={goal.title} bar={goal.bar} footer={QUOTE} />
            ) : (
              <EliteList
                tokens={t}
                title={`${POWER_LEVELS[Number(tier)].name} ELITE`}
                rows={eliteList}
                loading={eliteLoading}
                myId={user?.id}
                filters={
                  <BoardFilters
                    tokens={t}
                    inCommunity={!!profile?.community_id}
                    scope={scope}
                    onScope={(s) => { setScope(s); fetchElite(tier, s); }}
                    gender={gender}
                    onGender={setGender}
                  />
                }
              />
            )}
          </View>
        </ScrollView>

        {!sheet && toastNode}
      </View>

      <WorldSheet
        tokens={t}
        visible={!!sheet}
        onClose={closeSheet}
        variant={shown.kind === 'board' ? 'board' : 'log'}
        kicker={shown.kind === 'board'
          ? <BoardKicker tokens={t} icon="bolt" text="POWER WORLD" />
          : logMove && (pbs[logMove.id] ?? 0) > 0
            ? `CURRENT 1RM ${pbs[logMove.id]} KG · ${fmt2(calculatePowerPoints(logMove.id, pbs[logMove.id]))} PTS`
            : 'ONE REP MAX · NO LIFT YET'}
        title={shown.kind === 'board' ? 'LEADERBOARD' : (logMove ? MOVE_UI[logMove.id]?.name ?? logMove.name.toUpperCase() : '')}
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
            {shown.kind === 'log' && logMove && (
              <PBOverwriteConfirmModal
                visible={pendingOverwrite !== null}
                theme={theme}
                accentColor={t.accent}
                movementName={logMove.name}
                unitLabel=" KG"
                currentBest={pbs[logMove.id] ?? 0}
                attemptValue={pendingOverwrite ?? 0}
                saving={saving}
                onKeepBest={() => setPendingOverwrite(null)}
                onSaveAnyway={() => { if (pendingOverwrite !== null) handleSave(pendingOverwrite, true); }}
              />
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
              onScope={(s) => { setScope(s); fetchBoard(s); }}
              gender={gender}
              onGender={setGender}
              style={{ paddingTop: 14, paddingHorizontal: 24 }}
            />
            <LeaderboardBody tokens={t} rows={boardList} myId={user?.id} loading={boardLoading} />
          </View>
        ) : logMove ? (
          <PlateLoaderBody
            tokens={t}
            movement={logMove}
            pb={pbs[logMove.id] ?? 0}
            kg={kg}
            kgRaw={kgRaw}
            stack={stack}
            onTyped={(text) => { const p = parseKgInput(text, MAX_KG); applyKg(plateSetKg(p.kg), p.raw); }}
            onPlate={(p) => applyKg(addPlate(kg, stack, p))}
            onUndo={() => applyKg(undoPlate(kg, stack))}
            onStep={(d) => applyKg(plateSetKg(kg + d))}
            onClear={() => applyKg(plateSetKg(0))}
            onLog={() => handleSave(kg)}
            saving={saving}
            isSlowSave={isSlowSave}
            top={movementTop}
            myId={user?.id}
          />
        ) : null}
      </WorldSheet>

      <CelebrationBanner
        visible={showCelebration}
        title={celebrationProps.title}
        subtitle={celebrationProps.subtitle}
        stat={celebrationProps.stat}
        emoji={celebrationProps.emoji}
        rank={celebrationProps.rank}
        userName={profile?.display_name || 'WARRIOR'}
        onDismiss={() => setShowCelebration(false)}
        headerText="POWER WORLD"
        showLeapLogo
        accentColor={t.accent}
      />
    </GlobalErrorBoundary>
  );
}

// ------------------------------------------------------------- lift rows

function LiftRow({ tokens: t, movement, pb, worldBest, onPress }: {
  tokens: WorldKitTokens; movement: PowerMovement; pb: number; worldBest?: number; onPress: () => void;
}) {
  const ui = MOVE_UI[movement.id] ?? { name: movement.name.toUpperCase(), note: 'ADDED WEIGHT' };
  const logged = pb > 0;
  const best = Math.max(worldBest ?? 0, pb);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ui.name}${logged ? `, 1RM ${pb} kilograms` : ''}. Log 1RM`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 20, paddingTop: 12, paddingBottom: 12, paddingLeft: 16, paddingRight: 14, gap: 10, minWidth: 0,
        backgroundColor: logged ? t.tint : t.emptyRowBg,
        borderWidth: 1, borderColor: logged ? t.tintBorderStrong : t.emptyRowBorder,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={kt('bold', 18, t.text, 1.2, 20)} numberOfLines={1}>{ui.name}</Text>
          <Text style={[kt('semibold', 11.5, logged ? t.accentText : t.textFaint, 1.2), { marginTop: 3 }]} numberOfLines={1}>
            {logged ? `1RM · ${fmt2(calculatePowerPoints(movement.id, pb))} PTS` : 'TAP TO LOG 1RM'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={kt('bold', 40, logged ? t.text : t.textEmpty, 0, 42)}>{logged ? String(pb) : '—'}</Text>
          {logged && <Text style={kt('medium', 11, t.textMuted, 1.4)}>KG</Text>}
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <KitIcon name="plus" size={14} color="#ffffff" strokeWidth={3} />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <KitBar tokens={t} progress={best > 0 ? pb / best : 0} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={kt('medium', 10.5, t.textFaint, 1.2)}>{`×${movement.multiplier} · ${ui.note}`}</Text>
          <Text style={kt('medium', 10.5, t.textFaint, 1.2)}>{best > 0 ? `WORLD BEST ${fmt0(best)} KG` : 'NO LIFTS YET'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const fmt0 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// ---------------------------------------------------------- plate loader

function PlateLoaderBody({
  tokens: t, movement, pb, kg, kgRaw, stack, onTyped, onPlate, onUndo, onStep, onClear, onLog,
  saving, isSlowSave, top, myId,
}: {
  tokens: WorldKitTokens; movement: PowerMovement; pb: number; kg: number; kgRaw: string | null; stack: Plate[];
  onTyped: (text: string) => void; onPlate: (p: Plate) => void; onUndo: () => void; onStep: (d: number) => void;
  onClear: () => void; onLog: () => void; saving: boolean; isSlowSave: boolean;
  top: PowerMovementRanking[]; myId?: string;
}) {
  const ui = MOVE_UI[movement.id] ?? { name: movement.name, note: 'ADDED WEIGHT' };
  const isPb = kg > 0 && (pb <= 0 || kg > pb);
  const chip = isPb
    ? { text: pb > 0 ? 'NEW 1RM' : 'FIRST 1RM', filled: true }
    : { text: pb > 0 ? `1RM ${pb} KG` : 'ADD WEIGHT', filled: false };
  const drawn = stack.slice(0, MAX_DRAWN_PLATES);
  const more = hiddenPlates(stack);
  const topRows = top.slice(0, 6).map(r => ({ key: r.user_id, name: r.display_name, you: r.user_id === myId, value: `${r.value} KG` }));

  const plateView = (p: Plate, i: number) => {
    const st = PLATE_STYLE[p];
    return <View key={i} style={{ width: st.width, height: st.height, borderRadius: 3, backgroundColor: st.color }} />;
  };
  const collar = <View style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: t.mode === 'dark' ? '#3a3a3a' : '#9a9aa2' }} />;
  const sleeve = <View style={{ width: 8, height: 20, borderRadius: 2, backgroundColor: t.mode === 'dark' ? '#5a5a5a' : '#7a7a82' }} />;

  const outline = { height: 40, borderRadius: 12, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const, flex: 1 };

  return (
    <View style={{ paddingHorizontal: 24 }}>
      <View style={{ marginTop: 18, borderRadius: 22, backgroundColor: t.mode === 'dark' ? '#110a0a' : t.tint, borderWidth: 1, borderColor: t.tintBorder, paddingTop: 18, paddingHorizontal: 14, paddingBottom: 14, gap: 16 }}>
        <NumberField
          tokens={t}
          value={kgRaw ?? (kg > 0 ? String(kg) : '')}
          onChangeText={onTyped}
          unit="KG"
          hint="TAP TO TYPE · OR LOAD PLATES"
          decimal
          maxLength={6}
          accessibilityLabel="One rep max in kilograms"
        />

        <View
          accessibilityRole="image"
          accessibilityLabel={`Barbell loaded with ${stack.length} plates per side`}
          style={{ height: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' }}
        >
          {collar}
          {drawn.slice().reverse().map(plateView)}
          {sleeve}
          <View style={{ width: barWidth(stack), height: 6, backgroundColor: t.mode === 'dark' ? '#3a3a3a' : '#9a9aa2' }} />
          {sleeve}
          {drawn.map(plateView)}
          {collar}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
          <Text style={[kt('medium', 10.5, t.textFaint, 1.8), { textAlign: 'center' }]}>{`TAP A PLATE TO ADD · ${ui.note}`}</Text>
          {more > 0 && <Text style={kt('medium', 10.5, t.accentText, 1.8)}>{`+${more} MORE PLATES`}</Text>}
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PLATES.map(p => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={`Add ${p} kilogram plate`}
              onPress={() => onPlate(p)}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, height: 48, borderRadius: 14, backgroundColor: t.buttonTint, borderWidth: 1, borderColor: t.tintBorder, alignItems: 'center', justifyContent: 'center', gap: 1, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={kt('bold', 15, t.text)} numberOfLines={1} adjustsFontSizeToFit>{`+${p}`}</Text>
              <Text style={kt('semibold', 9, t.textFaint, 1)}>KG</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo last plate" onPress={onUndo} style={outline}>
            <Text style={kt('semibold', 12, t.textSecondary, 1.4)}>UNDO</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Minus 2.5 kilograms" onPress={() => onStep(-2.5)} style={outline}>
            <Text style={kt('semibold', 13, t.textSecondary)}>−2.5</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Plus 2.5 kilograms" onPress={() => onStep(2.5)} style={outline}>
            <Text style={kt('semibold', 13, t.textSecondary)}>+2.5</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear weight" onPress={onClear} style={outline}>
            <Text style={kt('semibold', 12, t.textMuted, 1.4)}>CLEAR</Text>
          </Pressable>
        </View>
      </View>

      <ThisSetRow tokens={t} points={fmt2(calculatePowerPoints(movement.id, kg))} chip={chip} />
      <KitButton tokens={t} label="LOG PERFORMANCE" onPress={onLog} loading={saving} disabled={kg <= 0} />
      {isSlowSave && (
        <Text style={[kt('regular', 13, t.textSecondary), { textAlign: 'center', marginTop: 8 }]}>Still submitting — hang tight...</Text>
      )}

      <TopList tokens={t} title="TOP LIFTS" rightLabel={`×${movement.multiplier} PTS / KG`} rows={topRows} emptyText="NO LIFTS LOGGED YET" />
    </View>
  );
}

