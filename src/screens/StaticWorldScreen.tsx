import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  STATIC_MOVEMENTS, STATIC_LEVELS, STATIC_CATEGORIES, getStaticLevel, StaticMovement,
} from '../lib/staticLogic';
import { StaticService, StaticLeaderboardEntry, StaticLevelLeaderboardEntry, StaticWellRoundedEntry } from '../services/StaticService';
import { describeSubmitError } from '../lib/submitErrors';
import { useSlowSubmitNotice } from '../hooks/useSlowSubmitNotice';
import { useSafeAsync } from '../hooks/useSafeAsync';
import { useMountedRef } from '../hooks/useMountedRef';
import { useWorldSummary } from '../hooks/useWorldSummary';
import { useHoldTimer } from '../hooks/useHoldTimer';
import { useTutorialTarget } from '../hooks/useTutorialTarget';
import { useReturnTo } from '../hooks/useReturnTo';
import { PRCelebration } from '../components/celebration/PRCelebration';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { PBOverwriteConfirmModal } from '../components/PBOverwriteConfirmModal';
import { NotificationService } from '../services/NotificationService';
import { getWorldKitTokens, WorldKitTokens, WORLD_FONTS } from '../../constants/worldKitTokens';
import { deriveStanding, fmt2, youBarSubline, BoardRow } from '../lib/worldStanding';
import { staticWithinLevel, STATIC_HOLD_TARGET_SECONDS } from '../lib/worldProgress';
import { SkillCarousel } from '../components/worlds/SkillCarousel';
import {
  AnimatedRing, BoardFilters, BoardKicker, DashboardRings, EliteList, filterByGender, GoalCard, KitButton,
  KitIcon, kt, LeaderboardBody, SegmentedSwitch, TopList, WorldHeader, WorldPage, WorldSheet, WorldToast, YouBar, Gender,
} from '../components/worlds/kit';
import { t as tr, isArabic } from '../i18n';

type Category = 'handstand' | 'front_lever' | 'back_lever' | 'planche';
type Tier = 'overall' | '1' | '2' | '3';
type SheetState = { kind: 'log'; movementId: string } | { kind: 'board' } | null;

const CATEGORIES: Category[] = ['handstand', 'front_lever', 'back_lever', 'planche'];
const SHORT: Record<Category, string> = { handstand: 'HANDSTAND', front_lever: 'FRONT LV', back_lever: 'BACK LV', planche: 'PLANCHE' };
const QUOTE = tr('staticWorld.quote');
const MAX_SECONDS = 999;
const QUICK = [10, 20, 30, 60];

const movesOf = (c: Category) => STATIC_MOVEMENTS.filter(m => m.category === c).sort((a, b) => a.level - b.level);
const holdPts = (m: StaticMovement, secs: number) => secs * m.multiplier;
/** Live Static scoring: a skill is worth its best-scoring variation. */
const categoryPts = (c: Category, pbs: Record<string, number>) => Math.max(0, ...movesOf(c).map(m => holdPts(m, pbs[m.id] ?? 0)));
const fs = (s: number) => tr('units.secLower', { value: (Math.round(s * 10) / 10).toFixed(1) });
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

interface Props {
  onClose?: () => void;
  /** Deep link from My Journey's "Test Your Hold" — pre-selects that skill. */
  movement?: string;
}

export function StaticWorldScreen({ movement }: Props) {
  const { theme, mode } = useTheme();
  // Memoized so the skill cards (React.memo) don't all re-render on every
  // swipe or timer tick.
  const t = useMemo(() => getWorldKitTokens('static', mode), [mode]);
  const { user, profile, refreshProfile } = useAuth();
  const { returnTo, goBackOrReturnTo, completeQuestAndReturn } = useReturnTo();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave, isExecuting: saving } = useSafeAsync();
  const isSlowSave = useSlowSubmitNotice(saving);
  const { ref: scoreCircleRef, onLayout: onScoreCircleLayout } = useTutorialTarget('static.scoreCircle');
  const { ref: movementRowRef, onLayout: onMovementRowLayout } = useTutorialTarget('static.movementRow');

  const deepLinked = movement ? STATIC_MOVEMENTS.find(m => m.id === movement) : undefined;
  // Page scrolling is off while a skill card is being swiped (see SkillCarousel).
  const [swiping, setSwiping] = useState(false);
  const [skill, setSkill] = useState(Math.max(0, CATEGORIES.indexOf((deepLinked?.category ?? 'handstand') as Category)));

  const [pbs, setPbs] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { summary, refresh: refreshSummary } = useWorldSummary('static', !!user);

  const [tier, setTier] = useState<Tier>('overall');
  const [eliteRows, setEliteRows] = useState<StaticLevelLeaderboardEntry[]>([]);
  const [eliteLoading, setEliteLoading] = useState(false);

  const [sheet, setSheet] = useState<SheetState>(null);
  const lastSheet = useRef<Exclude<SheetState, null>>({ kind: 'board' });
  if (sheet) lastSheet.current = sheet;
  const shown = sheet ?? lastSheet.current;

  const timer = useHoldTimer();
  const [manual, setManual] = useState(false);
  const [manualSecs, setManualSecs] = useState(20);
  const [top, setTop] = useState<StaticLeaderboardEntry[]>([]);
  const [pendingOverwrite, setPendingOverwrite] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [boardRows, setBoardRows] = useState<StaticWellRoundedEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [gender, setGender] = useState<Gender>('ALL');
  // Derived default (not mirrored via an effect) — see the stale-scope race
  // documented in the previous version of this screen.
  const [manualScope, setManualScope] = useState<'public' | 'community' | null>(null);
  const scope: 'public' | 'community' = manualScope ?? (profile?.community_id ? 'community' : 'public');
  const communityIdFor = (s: 'public' | 'community') => (s === 'community' ? profile?.community_id ?? null : null);

  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ movement: '', value: 0, previous: null as number | null });

  // ------------------------------------------------------------------ data

  const isFetchingRef = useRef(false);
  const fetchPbs = useCallback(async () => {
    if (!user || isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const { pbs: p } = await StaticService.getUserStats(user.id);
      if (isMounted.current) setPbs(p);
    } catch (e) {
      console.error('[StaticWorld] load error:', e);
    } finally {
      isFetchingRef.current = false;
      if (isMounted.current) { setLoaded(true); setRefreshing(false); }
    }
  }, [user, isMounted]);

  useFocusEffect(useCallback(() => { fetchPbs(); }, [fetchPbs]));

  // Latest-request guards: when the user switches tier/scope/movement quickly,
  // an older response resolving last must not overwrite the current list.
  const eliteReq = useRef(0);
  const boardReq = useRef(0);
  const topReq = useRef(0);

  const fetchElite = async (level: Tier, s: 'public' | 'community') => {
    if (level === 'overall' || !user) return;
    const req = ++eliteReq.current;
    setEliteLoading(true);
    setEliteRows([]);
    try {
      const rows = await StaticService.getLevelLeaderboard(Number(level) as 1 | 2 | 3, user.id, communityIdFor(s));
      if (isMounted.current && req === eliteReq.current) setEliteRows(rows);
    } finally {
      if (isMounted.current && req === eliteReq.current) setEliteLoading(false);
    }
  };

  const fetchBoard = async (s: 'public' | 'community') => {
    if (!user) return;
    const req = ++boardReq.current;
    setBoardLoading(true);
    try {
      const rows = await StaticService.getWellRoundedLeaderboard(user.id, communityIdFor(s));
      if (isMounted.current && req === boardReq.current) setBoardRows(rows);
    } catch (e) {
      console.error('[StaticWorld] board error:', e);
    } finally {
      if (isMounted.current && req === boardReq.current) setBoardLoading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPbs();
    refreshSummary();
    if (tier !== 'overall') fetchElite(tier, scope);
  };

  // ------------------------------------------------------------- standing

  const localScore = CATEGORIES.reduce((a, c) => a + categoryPts(c, pbs), 0);
  const score = summary ? summary.myScore : localScore;
  const standing = deriveStanding({
    rank: summary?.myRank ?? null,
    rankedCount: summary?.rankedCount ?? 0,
    score,
    topScore: summary?.topScore ?? 0,
    above: summary?.above ?? null,
  });
  const above = summary?.above ?? null;
  const level = staticWithinLevel(score);
  const levelCap = score <= 0
    ? tr('staticWorld.enterLevel', { level: titleCase(STATIC_LEVELS[1].name) })
    : level.nextLevel
      ? tr('staticWorld.ptsToLevel', { pts: fmt2(level.gap), level: titleCase(level.nextLevel.name) })
      : tr('staticWorld.topLevel', { level: titleCase(STATIC_LEVELS[3].name) });

  const gap = standing.isKing
    ? { label: tr('worlds.status'), value: tr('worlds.king'), sub: tr('worlds.firstOfWorld'), progress: 1, gold: true }
    : standing.isRanked && above && standing.gapToPass != null
      ? { label: tr('worlds.gapTo', { rank: above.rank }), value: fmt2(standing.gapToPass), sub: tr('worlds.ptsToPass'), progress: standing.gapProgress }
      : { label: tr('worlds.gapToEmpty'), value: '—', sub: tr('worlds.rankUp'), progress: 0, empty: true };

  const goal = standing.isKing
    ? { kicker: tr('worlds.youreFirst'), title: tr('staticWorld.kingAchieved'), bar: undefined }
    : standing.isRanked && above && standing.gapToPass != null
      ? {
        kicker: tr('worlds.nextTarget'),
        title: tr('worlds.stealRank', { pts: fmt2(standing.gapToPass), rank: above.rank }),
        bar: { progress: standing.gapProgress, from: tr('worlds.youScore', { score: fmt2(score) }), to: `#${above.rank} ${fmt2(above.score)}` },
      }
      : { kicker: tr('worlds.getStarted'), title: tr('staticWorld.getStartedGoal', { seconds: STATIC_HOLD_TARGET_SECONDS }), bar: undefined };

  // ------------------------------------------------------------- sheets

  const openLog = (m: StaticMovement) => {
    timer.reset();
    setManual(false);
    setManualSecs(pbs[m.id] > 0 ? Math.round(pbs[m.id]) : 20);
    setPendingOverwrite(null);
    setTop([]);
    setSheet({ kind: 'log', movementId: m.id });
    const req = ++topReq.current;
    StaticService.getMovementLeaderboard(m.id, user?.id, communityIdFor(scope))
      .then(r => { if (isMounted.current && req === topReq.current) setTop(r.entries); })
      .catch(e => console.error('[StaticWorld] top holds error:', e));
  };

  // Stable for the memoized skill cards; always runs the latest openLog.
  const openLogRef = useRef(openLog);
  openLogRef.current = openLog;
  const openLogFromCard = useCallback((m: StaticMovement) => openLogRef.current(m), []);

  const openBoard = () => {
    setSheet({ kind: 'board' });
    fetchBoard(scope);
  };

  const closeSheet = () => {
    if (timer.phase === 'ready' || timer.phase === 'run') {
      const abandon = () => { timer.reset(); setSheet(null); };
      if (Platform.OS === 'web') {
        if (window.confirm(tr('worlds.cancelTimerWeb'))) abandon();
      } else {
        Alert.alert(tr('worlds.cancelTestTitle'), tr('worlds.cancelTestBody'), [
          { text: tr('worlds.keepGoing'), style: 'cancel' },
          { text: tr('worlds.cancelTest'), style: 'destructive', onPress: abandon },
        ]);
      }
      return;
    }
    Keyboard.dismiss();
    setSheet(null);
  };

  // --------------------------------------------------------------- save

  const handleSave = (seconds: number, force = false, forMovementId?: string) => {
    // The movement travels with a retry (see OneMinMaxScreen).
    const movementId = forMovementId ?? (sheet?.kind === 'log' ? sheet.movementId : undefined);
    if (!user || !movementId) return;
    const m = STATIC_MOVEMENTS.find(x => x.id === movementId);
    if (!m) return;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      Alert.alert(tr('worlds.invalid'), tr('staticWorld.invalidHold'));
      return;
    }
    const currentBest = pbs[m.id] ?? 0;
    // Strictly less-than: submit_static_hold treats a tie as a no-op, not "worse".
    if (!force && currentBest > 0 && seconds < currentBest) {
      Keyboard.dismiss();
      setPendingOverwrite(seconds);
      return;
    }

    let isPB = false;
    let showCard = false;
    runSafeSave(async () => {
      const { isNewPB, overtakenNotificationId, wraOvertakenNotificationId } = await StaticService.saveHold(user.id, m.id, seconds, force);
      isPB = isNewPB;
      if (isNewPB) {
        showCard = true;
        if (isMounted.current) setCelebrationData({ movement: m.name, value: seconds, previous: currentBest > 0 ? currentBest : null });
        NotificationService.notify(user.id, 'static_pb', tr('staticWorld.pbPushTitle'), tr('staticWorld.pbPushBody', { name: m.name, seconds }), { screen: 'static-world' });
        if (overtakenNotificationId) NotificationService.sendOvertakeNotificationPush(overtakenNotificationId);
        if (wraOvertakenNotificationId) NotificationService.sendOvertakeNotificationPush(wraOvertakenNotificationId);
      }
    }, {
      onSuccess: () => {
        setPendingOverwrite(null);
        timer.reset();
        setSheet(null);
        setToast(isPB
          ? (currentBest > 0 ? tr('worlds.newPb', { pts: fmt2(holdPts(m, seconds - currentBest)) }) : tr('staticWorld.firstHold', { pts: fmt2(holdPts(m, seconds)) }))
          : force ? tr('staticWorld.pbReplaced', { seconds }) : tr('staticWorld.loggedUnchanged'));
        fetchPbs();
        refreshSummary();
        if (tier !== 'overall') fetchElite(tier, scope);
        refreshProfile?.();
        // A PB card returns to the Journey quest on dismiss; otherwise after the toast.
        if (showCard) setTimeout(() => { if (isMounted.current) setShowCelebration(true); }, 450);
        else setTimeout(() => { if (isMounted.current) completeQuestAndReturn(); }, 1800);
      },
      onError: (error: any) => {
        setPendingOverwrite(null);
        // P1001–P1004 are submit_static_hold's own validation (bad time,
        // bad movement, ceiling, cooldown) — expected, so no console noise.
        if (!['P1001', 'P1002', 'P1003', 'P1004'].includes(error.code)) console.error('Error saving hold:', error);
        const msg = describeSubmitError(error, tr('staticWorld.saveFailed'));
        if (Platform.OS === 'web') {
          if (window.confirm(`${msg}\n\n${tr('worlds.tryAgainQ')}`)) handleSave(seconds, force, m.id);
        } else {
          Alert.alert(tr('worlds.error'), msg, [
            { text: tr('worlds.cancel'), style: 'cancel' },
            { text: tr('worlds.tryAgain'), onPress: () => handleSave(seconds, force, m.id) },
          ]);
        }
      },
    });
  };

  // ---------------------------------------------------------- rendering

  const skillTabs = CATEGORIES.map(c => ({
    key: c,
    label: SHORT[c],
    dots: movesOf(c).map(m => (pbs[m.id] ?? 0) > 0),
  }));

  const onPickTier = (k: Tier) => {
    setTier(k);
    if (k !== 'overall') fetchElite(k, scope);
  };

  const eliteList: BoardRow[] = useMemo(
    () => eliteRows.map(r => ({ user_id: r.user_id, name: r.display_name, points: Number(r.total_points) || 0 })),
    [eliteRows],
  );
  const boardList: BoardRow[] = useMemo(
    () => filterByGender(
      boardRows.map((r: any) => {
        const pts = Number(r.total_points) || 0;
        return { user_id: r.user_id, name: r.display_name, points: pts, country: r.country, gender: r.gender, level: STATIC_LEVELS[getStaticLevel(pts)].name };
      }),
      gender,
    ),
    [boardRows, gender],
  );
  const you = youBarSubline(boardList, user?.id, score, tr('staticWorld.nameForKing'));
  const unfiltered = scope === 'public' && gender === 'ALL';
  const youRankText = you.index >= 0 ? `#${you.index + 1}` : unfiltered && standing.isRanked ? `#${summary?.myRank}` : '—';
  const youSub = you.index < 0
    ? (unfiltered && standing.isRanked && above && standing.gapToPass != null
      ? tr('staticWorld.passName', { pts: fmt2(standing.gapToPass), name: above.name })
      : score > 0 ? tr('worlds.notInFilter') : tr('staticWorld.logToJoin'))
    : you.text;

  const toastNode = <WorldToast tokens={t} message={toast} onHide={() => setToast(null)} />;
  const logMove = shown.kind === 'log' ? STATIC_MOVEMENTS.find(m => m.id === shown.movementId) : undefined;
  const logValue = manual ? manualSecs : timer.seconds;

  return (
    <GlobalErrorBoundary>
      <WorldPage tokens={t}>
        <WorldHeader
          tokens={t}
          icon="snowflake"
          title={tr('staticWorld.title')}
          onBackToJourney={returnTo === 'journey' ? () => goBackOrReturnTo('/static-world') : undefined}
        />
        <ScrollView
          scrollEnabled={!swiping}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <DashboardRings
            tokens={t}
            worldLabel={tr('staticWorld.label')}
            rank={standing.isRanked ? summary?.myRank ?? null : null}
            isKing={standing.isKing}
            rankProgress={standing.rankProgress}
            score={score}
            scoreText={fmt2(score)}
            scoreProgress={score > 0 ? level.progress : 0}
            gap={gap}
            onOpenLeaderboard={openBoard}
            scoreRef={scoreCircleRef}
            onScoreLayout={onScoreCircleLayout}
          />
          <Text style={[kt('regular', 12.5, t.textSecondary, 0.4), { textAlign: 'center', marginTop: 14 }]}>{levelCap}</Text>

          <View style={{ paddingTop: 26, paddingHorizontal: 24, paddingBottom: 8 }}>
            <SegmentedSwitch
              tokens={t}
              items={skillTabs}
              active={CATEGORIES[skill]}
              onChange={(c) => setSkill(CATEGORIES.indexOf(c))}
              height={46}
              fontSize={11.5}
              accessibilityLabel={tr('staticWorld.skillA11y')}
            />
          </View>

          <SkillCarousel
            count={CATEGORIES.length}
            index={skill}
            onIndexChange={setSkill}
            containerRef={movementRowRef}
            onContainerLayout={onMovementRowLayout}
            swipeHintKey="static"
            onSwipingChange={setSwiping}
            renderCard={(i, active) => (
              <SkillCard tokens={t} category={CATEGORIES[i]} n={i + 1} active={active} pbs={pbs} loaded={loaded} onOpen={openLogFromCard} />
            )}
          />

          <View style={{ paddingTop: 34, paddingHorizontal: 24, paddingBottom: 28, gap: 16 }}>
            <SegmentedSwitch
              tokens={t}
              height={38}
              fontSize={12}
              active={tier}
              onChange={onPickTier}
              accessibilityLabel={tr('staticWorld.levelA11y')}
              items={[
                { key: 'overall', label: tr('worlds.overall'), crown: true },
                { key: '1', label: STATIC_LEVELS[1].name },
                { key: '2', label: STATIC_LEVELS[2].name },
                { key: '3', label: STATIC_LEVELS[3].name },
              ]}
            />
            {tier === 'overall' ? (
              <GoalCard tokens={t} icon="target" king={standing.isKing} kicker={goal.kicker} title={goal.title} bar={goal.bar} footer={QUOTE} footerStyle="quote" />
            ) : (
              <EliteList
                tokens={t}
                title={tr('worlds.elite', { level: STATIC_LEVELS[Number(tier) as 1 | 2 | 3].name })}
                rows={eliteList}
                loading={eliteLoading}
                myId={user?.id}
                filters={
                  <BoardFilters
                    tokens={t}
                    inCommunity={!!profile?.community_id}
                    scope={scope}
                    onScope={(s) => { setManualScope(s); fetchElite(tier, s); }}
                    gender={gender}
                    onGender={setGender}
                    showGender={false}
                  />
                }
              />
            )}
          </View>
        </ScrollView>

        {!sheet && toastNode}
      </WorldPage>

      <WorldSheet
        tokens={t}
        visible={!!sheet}
        onClose={closeSheet}
        variant={shown.kind === 'board' ? 'board' : 'log'}
        kicker={shown.kind === 'board'
          ? <BoardKicker tokens={t} icon="snowflake" text={tr('staticWorld.title')} />
          : logMove ? tr('worlds.levelN', { name: STATIC_CATEGORIES[logMove.category].name.toUpperCase(), level: logMove.level }) : ''}
        title={shown.kind === 'board' ? tr('worlds.leaderboard') : (logMove?.name ?? '').toUpperCase()}
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
            {shown.kind === 'log' && logMove && (
              <PBOverwriteConfirmModal
                visible={pendingOverwrite !== null}
                theme={theme}
                accentColor={t.accent}
                movementName={logMove.name}
                unitLabel={isArabic ? ' ث' : 's'}
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
              onScope={(s) => { setManualScope(s); fetchBoard(s); }}
              gender={gender}
              onGender={setGender}
              style={{ paddingTop: 14, paddingHorizontal: 24 }}
            />
            <LeaderboardBody tokens={t} rows={boardList} myId={user?.id} loading={boardLoading} />
          </View>
        ) : logMove ? (
          <TimerSheetBody
            tokens={t}
            movement={logMove}
            pb={pbs[logMove.id] ?? 0}
            timer={timer}
            manual={manual}
            onMode={(isManual) => { if (timer.phase === 'ready' || timer.phase === 'run') return; timer.reset(); setManual(isManual); }}
            manualSecs={manualSecs}
            setManualSecs={setManualSecs}
            onLog={() => handleSave(logValue)}
            saving={saving}
            isSlowSave={isSlowSave}
            top={top}
            myId={user?.id}
          />
        ) : null}
      </WorldSheet>

      <PRCelebration
        visible={showCelebration}
        world="static"
        movement={celebrationData.movement}
        value={celebrationData.value}
        previous={celebrationData.previous}
        handle={profile?.display_name || user?.email?.split('@')[0] || tr('worlds.warrior')}
        onDismiss={() => { setShowCelebration(false); completeQuestAndReturn(); }}
      />
    </GlobalErrorBoundary>
  );
}

// ------------------------------------------------------------ skill card

// Memoized: a swipe only re-renders the two cards whose `active` changed.
const SkillCard = React.memo(function SkillCard({ tokens: t, category, n, active, pbs, loaded, onOpen }: {
  tokens: WorldKitTokens; category: Category; n: number; active: boolean;
  pbs: Record<string, number>; loaded: boolean; onOpen: (m: StaticMovement) => void;
}) {
  const pts = categoryPts(category, pbs);
  return (
    <View style={{
      flex: 1, minWidth: 0, borderRadius: 26, padding: 20, gap: 14, overflow: 'hidden',
      backgroundColor: active ? t.tintStrong : t.emptyRowBg,
      borderWidth: 1, borderColor: active ? `${t.accent}73` : t.emptyRowBorder,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={kt('medium', 10.5, t.textMuted, 2, 13)}>{tr('staticWorld.skillOf', { n })}</Text>
          <Text style={[kt('bold', 30, t.text, 1.2, 33), { marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
            {STATIC_CATEGORIES[category].name.toUpperCase()}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={kt('bold', 22, t.accentText, 0, 24)}>{fmt2(pts)}</Text>
          <Text style={[kt('medium', 10, t.textFaint, 1.6), { marginTop: 3 }]}>{tr('worlds.pts')}</Text>
        </View>
      </View>
      <View style={{ gap: 8, marginTop: 'auto' }}>
        {movesOf(category).map(m => (
          <HoldRow key={m.id} tokens={t} movement={m} pb={pbs[m.id] ?? 0} loaded={loaded} onPress={active ? () => onOpen(m) : undefined} />
        ))}
      </View>
    </View>
  );
});

function HoldRow({ tokens: t, movement: m, pb, loaded, onPress }: {
  tokens: WorldKitTokens; movement: StaticMovement; pb: number; loaded: boolean; onPress?: () => void;
}) {
  const logged = pb > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={logged ? tr('staticWorld.holdA11yBest', { name: m.name, seconds: pb }) : tr('staticWorld.holdA11y', { name: m.name })}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, minWidth: 0,
        paddingLeft: 12, paddingRight: 10, borderRadius: 16,
        backgroundColor: t.tint, borderWidth: 1, borderColor: t.tintBorderStrong, opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{
        width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
        backgroundColor: logged ? `${t.accent}2E` : t.mode === 'dark' ? '#151515' : t.button,
      }}>
        <Text style={kt('bold', 11, logged ? t.accentText : t.textDisabled)}>{m.level}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={kt('semibold', 15, t.text, 1, 18)} numberOfLines={1}>{m.name.toUpperCase()}</Text>
        <Text style={[kt('medium', 11.5, logged ? t.textSecondary : t.textFaint, logged ? 0.6 : 1.6), { marginTop: 1 }]} numberOfLines={1}>
          {!loaded ? ' ' : logged ? tr('staticWorld.pbLine', { time: fs(pb), pts: fmt2(holdPts(m, pb)) }) : tr('staticWorld.tapToTime')}
        </Text>
      </View>
      <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, borderWidth: 1, borderColor: t.tintBorder }}>
        <Text style={kt('semibold', 11, t.textMuted, 0.6)}>{`×${m.multiplier}`}</Text>
      </View>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <KitIcon name="stopwatch" size={16} color="#ffffff" />
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------ timer sheet

function TimerSheetBody({
  tokens: t, movement: m, pb, timer, manual, onMode, manualSecs, setManualSecs, onLog, saving, isSlowSave, top, myId,
}: {
  tokens: WorldKitTokens; movement: StaticMovement; pb: number; timer: ReturnType<typeof useHoldTimer>;
  manual: boolean; onMode: (manual: boolean) => void; manualSecs: number; setManualSecs: (n: number) => void;
  onLog: () => void; saving: boolean; isSlowSave: boolean; top: StaticLeaderboardEntry[]; myId?: string;
}) {
  const { phase, countdown, seconds } = timer;
  const target = Math.max(pb, 10);
  const value = manual ? manualSecs : seconds;
  const isNewPb = pb > 0 && value > pb;

  let label: string; let big: string; let sub: string; let progress: number;
  if (manual) {
    label = tr('staticWorld.yourHold'); big = fs(manualSecs); sub = `${fmt2(holdPts(m, manualSecs))} ${tr('worlds.pts')}${isNewPb ? tr('worlds.newPbSuffix') : ''}`; progress = manualSecs / target;
  } else if (phase === 'ready') {
    label = tr('worlds.getReady'); big = String(countdown); sub = tr('staticWorld.getIntoPosition'); progress = (4 - countdown) / 3;
  } else if (phase === 'run') {
    label = tr('staticWorld.holding'); big = fs(seconds); sub = `${fmt2(holdPts(m, seconds))} ${tr('worlds.pts')}`; progress = seconds / target;
  } else if (phase === 'stopped') {
    label = tr('staticWorld.yourHold'); big = fs(seconds); sub = `${fmt2(holdPts(m, seconds))} ${tr('worlds.pts')}${isNewPb ? tr('worlds.newPbSuffix') : ''}`; progress = seconds / target;
  } else {
    label = pb > 0 ? tr('staticWorld.personalBest') : tr('staticWorld.noTimeYet'); big = pb > 0 ? fs(pb) : fs(0); sub = `${fmt2(holdPts(m, pb))} ${tr('worlds.pts')}`; progress = pb > 0 ? 1 : 0;
  }

  const stepBtn = (text: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text.startsWith('−') ? tr('worlds.minusSecond') : tr('worlds.plusSecond')}
      onPress={onPress}
      style={({ pressed }) => ({ width: 48, height: 44, borderRadius: 12, backgroundColor: t.mode === 'dark' ? '#141414' : t.button, borderWidth: 1, borderColor: t.mode === 'dark' ? '#242424' : t.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={kt('semibold', 15, t.text)}>{text}</Text>
    </Pressable>
  );
  const adjustRow = (caption: string, onStep: (d: number) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      {stepBtn(`−${tr('units.secLower', { value: 1 })}`, () => onStep(-1))}
      <Text style={[kt('medium', 11, t.textMuted, 2), { width: 84, textAlign: 'center' }]}>{caption}</Text>
      {stepBtn(`+${tr('units.secLower', { value: 1 })}`, () => onStep(1))}
    </View>
  );
  const setManualClamped = (n: number) => setManualSecs(Math.max(0, Math.min(MAX_SECONDS, n)));

  const topRows = top.slice(0, 6).map(r => ({ key: r.user_id, name: r.display_name, you: r.user_id === myId, value: fs(Number(r.best_time_seconds) || 0) }));

  return (
    <View style={{ paddingHorizontal: 24 }}>
      <View style={{ marginTop: 16 }}>
        <SegmentedSwitch
          tokens={t}
          items={[{ key: 'log', label: tr('worlds.logTime') }, { key: 'timer', label: tr('worlds.timer') }]}
          active={manual ? 'log' : 'timer'}
          onChange={(k) => onMode(k === 'log')}
          accessibilityLabel={tr('worlds.logMode')}
        />
      </View>

      <View style={{ alignItems: 'center', paddingTop: 22, paddingBottom: 18 }}>
        <AnimatedRing
          size={196} radius={90} strokeWidth={5}
          progress={progress} color={t.accent} trackColor={t.track}
          duration={phase === 'run' ? 100 : 600} linear={phase === 'run'}
        >
          <View style={{ alignItems: 'center', gap: 4, width: 150 }}>
            <Text style={kt('medium', 11, t.textMuted, 2.2)}>{label}</Text>
            {manual ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <TextInput
                  value={String(manualSecs)}
                  onChangeText={(txt) => setManualClamped(parseInt(txt.replace(/[^0-9]/g, '').slice(0, 3), 10) || 0)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  maxLength={3}
                  selectionColor={t.accent}
                  cursorColor={t.accent}
                  accessibilityLabel={tr('staticWorld.holdInputA11y')}
                  // No lineHeight: on iOS a line box shorter than Oswald's pushes the digits up and clips them.
                  style={{ fontFamily: WORLD_FONTS.bold, fontSize: 50, height: 66, marginVertical: -7, color: t.text, padding: 0, textAlign: 'center', minWidth: 30, includeFontPadding: false }}
                />
                <Text style={kt('bold', 30, t.textMuted)}>{tr('staticWorld.secondsUnit')}</Text>
              </View>
            ) : (
              <Text style={kt('bold', phase === 'ready' ? 72 : 50, phase === 'idle' && pb <= 0 ? t.textDisabled : t.text, 0, phase === 'ready' ? 78 : 56)} numberOfLines={1} adjustsFontSizeToFit>
                {big}
              </Text>
            )}
            <Text style={kt('medium', 12, t.accentText, 1.4)} numberOfLines={1}>{manual ? tr('worlds.tapToType', { sub }) : sub}</Text>
          </View>
        </AnimatedRing>
      </View>

      {manual ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
            {QUICK.map(v => {
              const on = manualSecs === v;
              return (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityLabel={tr('worlds.nSeconds', { n: v })}
                  onPress={() => setManualSecs(v)}
                  style={{ height: 38, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', backgroundColor: on ? t.accent : t.mode === 'dark' ? '#141414' : t.button, borderWidth: 1, borderColor: on ? t.accent : t.mode === 'dark' ? '#242424' : t.border }}
                >
                  <Text style={kt('semibold', 13, on ? t.onAccent : t.textSecondary)}>{tr('units.secLower', { value: v })}</Text>
                </Pressable>
              );
            })}
          </View>
          {adjustRow(tr('worlds.fineTune'), d => setManualClamped(manualSecs + d))}
          <KitButton tokens={t} label={tr('worlds.logPerformance')} onPress={onLog} loading={saving} disabled={manualSecs <= 0} />
        </View>
      ) : phase === 'idle' ? (
        <KitButton tokens={t} label={tr('worlds.startTimer')} icon="play" onPress={timer.start} />
      ) : phase === 'ready' ? (
        <KitButton tokens={t} label={tr('worlds.cancelCaps')} variant="outline" onPress={timer.reset} />
      ) : phase === 'run' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('worlds.stopAndLogA11y')}
          onPress={timer.stop}
          style={({ pressed }) => ({ height: 56, borderRadius: 16, backgroundColor: t.mode === 'dark' ? '#ffffff' : t.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed ? 0.85 : 1 })}
        >
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: t.mode === 'dark' ? '#000000' : '#ffffff' }} />
          <Text style={kt('bold', 17, t.mode === 'dark' ? '#000000' : '#ffffff', 2.6)}>{tr('worlds.stopAndLog')}</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 12 }}>
          {adjustRow(tr('worlds.adjust'), timer.adjust)}
          <KitButton tokens={t} label={tr('worlds.logPerformance')} onPress={onLog} loading={saving} disabled={seconds <= 0} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <KitButton tokens={t} label={tr('worlds.restart')} variant="outline" height={46} fontSize={13} onPress={timer.start} style={{ flex: 1, borderWidth: 1 }} />
            <KitButton tokens={t} label={tr('worlds.discard')} variant="outline" height={46} fontSize={13} onPress={timer.reset} style={{ flex: 1, borderWidth: 1 }} />
          </View>
        </View>
      )}
      {isSlowSave && (
        <Text style={[kt('regular', 13, t.textSecondary), { textAlign: 'center', marginTop: 8 }]}>{tr('worlds.stillSubmitting')}</Text>
      )}

      <TopList tokens={t} title={tr('staticWorld.topHolds')} rightLabel={tr('staticWorld.ptsPerSec', { mult: m.multiplier })} rows={topRows} emptyText={tr('staticWorld.noHolds')} />
    </View>
  );
}
