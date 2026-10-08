import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, LayoutAnimation, Platform, Pressable, Text, Vibration, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ChallengeService, WeeklyBoardRow, WeeklyChallenge } from '../services/ChallengeService';
import { NotificationService } from '../services/NotificationService';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import {
  amrapScore, formatClock, gapToLeader, getUserGroup, projectedRank, sortBoard,
} from '../lib/weeklyChallenge';
import { useMountedRef } from '../hooks/useMountedRef';
import { useSafeMutation } from '../hooks/useSafeMutation';
import { useReturnTo } from '../hooks/useReturnTo';
import { useWallClockTimer } from '../hooks/useWallClockTimer';
import { useBackgroundTimerAlerts } from '../hooks/useBackgroundTimerAlerts';
import { useKeepAwakeWhile } from '../hooks/useKeepAwakeWhile';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { WorldPage, Gender, Scope, kt } from '../components/worlds/kit';
import { getWeeklyTokens } from '../components/weekly/weeklyTokens';
import { WeeklyAdminModal } from '../components/weekly/WeeklyAdminModal';
import { ChallengeOverview, MyStanding } from './weekly/ChallengeOverview';
import { ChallengeActive } from './weekly/ChallengeActive';
import { ChallengeLogAmrap, ChallengeLogForTime } from './weekly/ChallengeLog';
import { ChallengeSubmitted, LastResult } from './weekly/ChallengeSubmitted';
import { TeamHub } from './team/TeamHub';
import { ModeSwitch, WeeklyMode } from '../components/team/TeamParts';
import { checkTeamChallengeEnabled } from '../lib/appVersion';
import { t as tr } from '../i18n';

type Phase = 'overview' | 'active' | 'log' | 'done';

/** An attempt shorter than this is dropped without asking (owner decision). */
const CONFIRM_AFTER_SEC = 10;
const COUNTDOWN_FROM = 3;

interface WeeklyChallengeScreenProps {
  onClose?: () => void;
}

export function WeeklyChallengeScreen({ onClose }: WeeklyChallengeScreenProps) {
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useMemo(() => getWeeklyTokens(mode), [mode]);
  const isMounted = useMountedRef();
  const { user, profile } = useAuth();
  const { completeQuestAndReturn } = useReturnTo();
  const { safeMutate, isMutating: submitting } = useSafeMutation();

  const isAdmin = (profile as any)?.is_admin === true;
  const userGroup = getUserGroup(profile?.strength_tier ?? 0);
  const [adminGroupView, setAdminGroupView] = useState<1 | 2 | 3>(userGroup);
  const group = isAdmin ? adminGroupView : userGroup;
  const currentWeek = ChallengeService.getCurrentWeekStart();

  // Team Challenge: behind app_config.team_challenge_enabled; admins always see it.
  const [teamEnabled, setTeamEnabled] = useState(false);
  const [weeklyMode, setWeeklyMode] = useState<WeeklyMode>('solo');
  useEffect(() => {
    let cancelled = false;
    checkTeamChallengeEnabled().then(on => { if (!cancelled && isMounted.current) setTeamEnabled(on); });
    return () => { cancelled = true; };
  }, []);
  const showTeam = isAdmin || teamEnabled;

  // ── Data ────────────────────────────────────────────────────────────────
  const [weeks, setWeeks] = useState<string[]>([currentWeek]);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null);
  const [board, setBoard] = useState<WeeklyBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [allChallenges, setAllChallenges] = useState<WeeklyChallenge[]>([]);

  const [showAll, setShowAll] = useState(false);
  const [scope, setScope] = useState<Scope>('public');
  const [gender, setGender] = useState<Gender>('ALL');

  const live = weekStart === currentWeek;
  const type = challenge?.scoring_type ?? 'time';
  const amrap = type === 'reps';
  const capSec = (challenge?.time_limit || 10) * 60;

  useEffect(() => {
    let cancelled = false;
    ChallengeService.getChallengeWeeks(group).then(list => {
      if (cancelled || !isMounted.current) return;
      setWeeks([currentWeek, ...list.filter(w => w !== currentWeek)]);
    });
    return () => { cancelled = true; };
  }, [group, currentWeek]);

  /** Loads the week's challenge and board; returns the sorted board. */
  const loadChallenge = useCallback(async (): Promise<WeeklyBoardRow[]> => {
    setLoading(true);
    try {
      const found = await ChallengeService.getActive(group, weekStart);
      if (!isMounted.current) return [];
      const rows = found ? sortBoard(found.scoring_type, await ChallengeService.getBoard(found.id)) : [];
      if (!isMounted.current) return [];
      setChallenge(found);
      setBoard(rows);
      if (isAdmin) {
        const all = await ChallengeService.getAllActiveForWeek(weekStart);
        if (isMounted.current) setAllChallenges(all);
      }
      return rows;
    } catch (error) {
      console.error('Error loading challenge:', error);
      return [];
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [group, weekStart, isAdmin]);

  useEffect(() => {
    setShowAll(false);
    setChallenge(null);
    setBoard([]);
    loadChallenge();
  }, [loadChallenge]);

  // Standing on the whole board (the hero card ignores the filters).
  const standing: MyStanding = useMemo(() => {
    const i = user ? board.findIndex(r => r.user_id === user.id) : -1;
    if (i < 0) return { best: null, rank: null, count: board.length, gap: null };
    return { best: board[i].score, rank: i + 1, count: board.length, gap: gapToLeader(type, board[0].score, board[i].score) };
  }, [board, user, type]);

  const filteredRows = useMemo(() => board.filter(r =>
    (scope !== 'community' || (!!profile?.community_id && r.community_id === profile.community_id)) &&
    (gender === 'ALL' || (r.gender || '').toUpperCase() === gender),
  ), [board, scope, gender, profile?.community_id]);

  // ── Attempt ─────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('overview');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [result, setResult] = useState(0);
  const [logRounds, setLogRounds] = useState(0);
  const [partial, setPartial] = useState<number[]>([]);
  const [last, setLast] = useState<LastResult | null>(null);

  const goToAmrapLog = () => {
    setLogRounds(rounds);
    setPartial((challenge?.movements ?? []).map(() => 0));
    setPhase('log');
  };

  const timer = useWallClockTimer(amrap ? capSec : null, () => {
    SoundService.playDigitalBuzzer(2);
    Vibration.vibrate([0, 500, 200, 500]);
    goToAmrapLog();
  });

  // 3 · 2 · 1, then the clock starts.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown === 0) {
      setCountdown(null);
      countdownEndRef.current = null;
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
      timer.start();
      return;
    }
    SoundService.playTick();
    const id = setTimeout(() => setCountdown(c => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // The 3·2·1 steps pause while the app is in the background: on return,
  // if it should have ended, start the clock from when it ended.
  const countdownEndRef = useRef<number | null>(null);
  useEffect(() => {
    if (countdown == null) return;
    const sub = AppState.addEventListener('change', next => {
      if (next !== 'active' || countdownEndRef.current == null) return;
      const endAt = countdownEndRef.current;
      if (Date.now() < endAt) return;
      countdownEndRef.current = null;
      setCountdown(null);
      SoundService.playBoxingBell();
      timer.start(endAt);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown == null]);
  useKeepAwakeWhile(countdown != null, 'weekly-countdown');
  useBackgroundTimerAlerts(() => {
    if (countdown == null || countdownEndRef.current == null) return [];
    const goIn = (countdownEndRef.current - Date.now()) / 1000;
    return amrap && capSec
      ? [{ inSeconds: goIn + capSec, title: tr('timerAlerts.capReached'), body: tr('timerAlerts.capReachedBody') }]
      : [];
  });

  const startAttempt = () => {
    timer.reset();
    setStep(0);
    setRounds(0);
    setResult(0);
    setPhase('active');
    countdownEndRef.current = Date.now() + COUNTDOWN_FROM * 1000;
    setCountdown(COUNTDOWN_FROM);
  };

  const exitAttempt = () => {
    timer.reset();
    setCountdown(null);
    setPhase('overview');
  };

  const confirmThen = (secondsIn: number, action: () => void) => {
    if (secondsIn <= CONFIRM_AFTER_SEC) {
      action();
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`${tr('weekly.discardTitle')}\n${tr('weekly.discardBody')}`)) action();
      return;
    }
    Alert.alert(tr('weekly.discardTitle'), tr('weekly.discardBody'), [
      { text: tr('weekly.keepGoing'), style: 'cancel' },
      { text: tr('weekly.discard'), style: 'destructive', onPress: action },
    ]);
  };

  const onStepDone = () => {
    if (!challenge) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(300, 'easeInEaseOut', 'opacity'));
    if (step < challenge.movements.length - 1) {
      setStep(s => s + 1);
      return;
    }
    const secs = timer.stop();
    setResult(Math.max(1, Math.round(secs)));
    setPhase('log');
  };

  const onEndAmrap = () => {
    timer.stop();
    goToAmrapLog();
  };

  const logScore = !challenge ? 0 : amrap ? amrapScore(challenge.movements, logRounds, partial) : result;
  const projection = useMemo(() => {
    const p = projectedRank(type, board, user?.id ?? '', logScore);
    return { rank: p.rank, count: p.count, gap: gapToLeader(type, p.leader, logScore) };
  }, [type, board, user?.id, logScore]);

  const submit = async () => {
    if (!challenge || !user || logScore <= 0) return;
    if (weekStart !== ChallengeService.getCurrentWeekStart()) {
      Alert.alert(tr('weekly.endedTitle'), tr('weekly.endedSubmit'));
      return;
    }
    const score = logScore;
    const prevRank = standing.rank;
    const prevBest = standing.best;
    await safeMutate(async () => {
      const metadata = amrap
        ? {
            rounds: String(logRounds),
            additionalReps: Object.fromEntries(partial.map((r, i) => [i, String(r)])),
          }
        : { finalTimeFormatted: formatClock(score) };
      const improved = await ChallengeService.submitScore({
        challengeId: challenge.id,
        userId: user.id,
        score,
        scoringType: challenge.scoring_type,
        metadata,
      });
      const rows = await loadChallenge();
      return { data: { improved, rows }, error: null };
    }, {
      onSuccess: (data) => {
        if (!data || !isMounted.current) return;
        const { improved, rows } = data;
        const best = improved || prevBest == null ? score : prevBest;
        const i = rows.findIndex(r => r.user_id === user.id);
        const newRank = i >= 0 ? i + 1 : projectedRank(type, rows, user.id, best).rank;
        const leader = rows[0]?.score ?? best;
        setLast({ score, newBest: improved, prevRank, newRank, best, gap: gapToLeader(type, leader, best) });
        setPhase('done');
        if (improved) {
          const scoreLabel = amrap ? tr('weekly.pts', { pts: score }) : formatClock(score);
          NotificationService.notify(
            user.id,
            'weekly_challenge_pb',
            tr('weekly.pushTitle'),
            tr('weekly.pushBody', { title: challenge.title, score: scoreLabel }),
            { screen: 'weekly-challenge' },
          );
        }
      },
    });
  };

  const discardLog = () => confirmThen(amrap ? timer.elapsed : result, exitAttempt);

  const backFromDone = () => {
    // Came from a My Journey side quest: go back and mark that slot done.
    if (completeQuestAndReturn()) return;
    setLast(null);
    setPhase('overview');
  };

  // Android back mirrors the on-screen close/discard/back for each phase.
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (phase === 'active') confirmThen(timer.elapsed, exitAttempt);
    else if (phase === 'log') discardLog();
    else if (phase === 'done') backFromDone();
  };
  useEffect(() => {
    if (phase === 'overview') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, [phase]);

  // ── Render ──────────────────────────────────────────────────────────────
  const weekIndex = Math.max(0, weeks.indexOf(weekStart));

  const adminSlot = isAdmin ? (
    <View style={{ flexDirection: 'row', gap: 8, paddingTop: 16 }}>
      {([1, 2, 3] as const).map(g => {
        const on = adminGroupView === g;
        return (
          <Pressable key={g} onPress={() => setAdminGroupView(g)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : t.control, borderWidth: 1, borderColor: on ? t.accent : t.cardBorder }}>
            <Text style={kt('semibold', 11, on ? t.onAccent : t.textMuted, 1.4)}>
              {tr(g === 1 ? 'weekly.novices' : g === 2 ? 'weekly.warriors' : 'weekly.legends')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  ) : undefined;

  const modeSlot = showTeam ? <ModeSwitch tokens={t} mode={weeklyMode} onChange={setWeeklyMode} /> : undefined;

  let body: React.ReactNode;
  if (showTeam && weeklyMode === 'team' && phase === 'overview') {
    body = (
      <TeamHub
        tokens={t}
        onBack={() => onClose?.()}
        modeSlot={modeSlot}
      />
    );
  } else if (phase === 'active' && challenge) {
    body = (
      <ChallengeActive
        tokens={t}
        challenge={challenge}
        elapsed={timer.elapsed}
        countdown={countdown}
        step={step}
        rounds={rounds}
        onStepDone={onStepDone}
        onRound={() => setRounds(r => r + 1)}
        onEndAmrap={onEndAmrap}
        onClose={() => confirmThen(timer.elapsed, exitAttempt)}
      />
    );
  } else if (phase === 'log' && challenge) {
    const common = {
      tokens: t, challenge, previousBest: standing.best, projection, submitting,
      onSubmit: submit, onDiscard: discardLog,
    };
    body = amrap
      ? <ChallengeLogAmrap {...common} rounds={logRounds} partial={partial} onRounds={setLogRounds} onPartial={setPartial} />
      : <ChallengeLogForTime {...common} result={result} />;
  } else if (phase === 'done' && last) {
    body = <ChallengeSubmitted tokens={t} type={type} weekStart={weekStart} last={last} onBack={backFromDone} />;
  } else {
    body = (
      <ChallengeOverview
        tokens={t}
        challenge={challenge}
        group={group}
        weekStart={weekStart}
        live={live}
        loading={loading}
        canPrev={weekIndex < weeks.length - 1}
        canNext={weekIndex > 0}
        onPrev={() => setWeekStart(weeks[Math.min(weeks.length - 1, weekIndex + 1)])}
        onNext={() => setWeekStart(weeks[Math.max(0, weekIndex - 1)])}
        onBack={() => onClose?.()}
        onStart={startAttempt}
        standing={standing}
        boardRows={filteredRows}
        myId={user?.id}
        myName={profile?.display_name || tr('weekly.warrior')}
        showAll={showAll}
        onToggleAll={() => setShowAll(v => !v)}
        inCommunity={!!profile?.community_id}
        scope={scope}
        onScope={setScope}
        gender={gender}
        onGender={setGender}
        adminSlot={adminSlot}
        modeSlot={modeSlot}
        onManage={isAdmin ? () => setShowAdminModal(true) : undefined}
      />
    );
  }

  return (
    <GlobalErrorBoundary>
      {/* No swipe-back mid-attempt; Android back is handled above. */}
      <Stack.Screen options={{ gestureEnabled: phase === 'overview' }} />
      <WorldPage tokens={t}>
        {/* The route skips SpartanLayout's bottom inset (its own background showed as a strip); pad here on ours. */}
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>{body}</View>
        {isAdmin && (
          <WeeklyAdminModal
            visible={showAdminModal}
            onClose={() => setShowAdminModal(false)}
            challenge={challenge}
            allChallenges={allChallenges}
            onChanged={async () => { await loadChallenge(); }}
          />
        )}
      </WorldPage>
    </GlobalErrorBoundary>
  );
}
