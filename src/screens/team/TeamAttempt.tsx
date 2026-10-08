import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, Vibration, View } from 'react-native';
import { KitButton, kt } from '../../components/worlds/kit';
import { WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, SquareButton, StatusPill, StepButton } from '../../components/weekly/WeeklyParts';
import { TeamMovements, formatTeamScore, memberName } from '../../components/team/TeamParts';
import {
  attemptPhase, clockSeconds, countdownLeft, leaderSubmits, membersWithoutResult, progressScore,
  requiredReps, repsDone, TeamAttempt, TeamChallenge, TeamMember, TeamState,
} from '../../lib/teamChallenge';
import { formatClock } from '../../lib/weeklyChallenge';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { useKeepAwakeWhile } from '../../hooks/useKeepAwakeWhile';
import { useBackgroundTimerAlerts } from '../../hooks/useBackgroundTimerAlerts';
import { ltr, t as tr } from '../../i18n';
import { WORLD_FONTS } from '../../../constants/worldKitTokens';

// ── Rounds + reps entry ────────────────────────────────────────────────────

function Stepper({ tokens: t, value, min, max, onChange, size, label }: {
  tokens: WeeklyTokens; value: number; min: number; max: number; onChange: (v: number) => void; size: number; label: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <StepButton tokens={t} kind="minus" size={size} label={`${label} −`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <Text style={[kt('bold', size >= 52 ? 40 : 22, t.text), { minWidth: size >= 52 ? 64 : 36, textAlign: 'center' }]}>{value}</Text>
      <StepButton tokens={t} kind="plus" size={size} label={`${label} +`} primary={size >= 52} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

/** Full rounds + reps per movement in the unfinished round, with a live score preview. */
export function ProgressEntry({ tokens: t, challenge, title, initialRounds = 0, busy, onSubmit }: {
  tokens: WeeklyTokens;
  challenge: TeamChallenge;
  title: string;
  initialRounds?: number;
  busy: boolean;
  onSubmit: (rounds: number, partial: number[]) => void;
}) {
  const forTime = challenge.scoring_type === 'time';
  const [rounds, setRounds] = useState(initialRounds);
  const [partial, setPartial] = useState<number[]>(() => challenge.movements.map(() => 0));
  const score = progressScore(challenge, rounds, partial);
  const missing = forTime ? requiredReps(challenge) - repsDone(challenge, rounds, partial) : 0;
  // For Time can't have done more full rounds than the workout has.
  const maxRounds = forTime ? challenge.rounds : 999;

  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <Text style={[kt('bold', 18, t.text, 1.6), { textAlign: 'center' }]}>{title}</Text>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Label tokens={t}>{tr('team.fullRounds')}</Label>
        <Stepper tokens={t} value={rounds} min={0} max={maxRounds} onChange={setRounds} size={52} label={tr('team.fullRounds')} />
      </View>
      <View style={{ gap: 8 }}>
        <Label tokens={t}>{tr('team.partialRound')}</Label>
        {challenge.movements.map((m, i) => (
          <View key={`${m.name}-${i}`} style={{
            flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14,
            borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder,
          }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={kt('medium', 15, t.text)} numberOfLines={1}>{m.name}</Text>
              <Text style={kt('regular', 11, t.textFaint)}>{ltr(`/ ${m.reps}`)}</Text>
            </View>
            <Stepper
              tokens={t} value={partial[i]} min={0} max={m.reps} size={36} label={m.name}
              onChange={v => setPartial(p => p.map((x, j) => (j === i ? v : x)))}
            />
          </View>
        ))}
      </View>
      <StatusPill
        tokens={t}
        good={!forTime}
        text={forTime
          ? tr('team.previewCapped', { time: formatTeamScore('time', score), missing })
          : tr('team.previewPoints', { score: formatTeamScore('reps', score) })}
      />
      <KitButton tokens={t} label={tr('team.submitScore')} onPress={() => onSubmit(rounds, partial)} loading={busy} disabled={busy} />
    </View>
  );
}

// ── Live attempt ───────────────────────────────────────────────────────────

interface AttemptProps {
  tokens: WeeklyTokens;
  state: TeamState & { attempt: TeamAttempt };
  /** Server time, ms. */
  now: number;
  myId: string | undefined;
  busy: boolean;
  /** For Time finish: undefined = the whole team, else that member. */
  onFinish: (userId?: string) => void;
  /** Rounds + reps: null = the whole team, else that member. */
  onSubmitProgress: (userId: string | null, rounds: number, partial: number[]) => void;
  onCancel: () => void;
}

function MemberStatus({ tokens: t, member, result, forTime, canAct, actLabel, onAct }: {
  tokens: WeeklyTokens; member: TeamMember; result: { score: number; capped: boolean } | undefined;
  forTime: boolean; canAct: boolean; actLabel: string; onAct: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14,
      borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: result ? t.greenBorder : t.cardBorder,
    }}>
      <Text style={[kt('medium', 15, t.text), { flex: 1 }]} numberOfLines={1}>{memberName(member)}</Text>
      {result ? (
        <Text style={kt('semibold', 14, t.green)}>{formatTeamScore(forTime ? 'time' : 'reps', result.score)}</Text>
      ) : canAct ? (
        <Pressable accessibilityRole="button" onPress={onAct} hitSlop={6}
          style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: t.accent, opacity: pressed ? 0.6 : 1 })}>
          <Text style={kt('bold', 11, t.accentText, 1.2)}>{actLabel}</Text>
        </Pressable>
      ) : (
        <Text style={kt('medium', 11, t.textFaint, 1.4)}>{tr('team.stillGoing')}</Text>
      )}
    </View>
  );
}

export function TeamAttemptView({ tokens: t, state, now, myId, busy, onFinish, onSubmitProgress, onCancel }: AttemptProps) {
  const { challenge, members, attempt, team } = state;
  const phase = attemptPhase(attempt, now);
  const forTime = challenge.scoring_type === 'time';
  const byLeader = leaderSubmits(challenge.format);
  const isLeader = !!myId && team.leader_id === myId;
  const players = members.filter(m => m.user_id);

  const results = useMemo(() => {
    const map = new Map<string, { score: number; capped: boolean }>();
    attempt.results.filter(r => !r.is_team_row && r.user_id).forEach(r => map.set(r.user_id!, { score: Number(r.score), capped: r.capped }));
    return map;
  }, [attempt.results]);
  const teamRow = attempt.results.find(r => r.is_team_row);
  const mine = myId ? results.get(myId) : undefined;
  const missing = membersWithoutResult(players, attempt);

  // Local helper only: taps here pre-fill the rounds at the end.
  const [roundTally, setRoundTally] = useState(0);
  // Leader entering a missing member's result (Collect).
  const [entryFor, setEntryFor] = useState<TeamMember | null>(null);

  // ── Sound + haptics on every phone, driven by the shared clock ──
  const left = phase === 'countdown' ? countdownLeft(attempt, now) : 0;
  const prev = useRef({ phase, left });
  useEffect(() => {
    const p = prev.current;
    if (phase === 'countdown' && left !== p.left && left > 0) SoundService.playTick();
    if (phase === 'running' && p.phase === 'countdown') {
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
    }
    if (phase === 'scoring' && p.phase === 'running') {
      SoundService.playDigitalBuzzer(2);
      Vibration.vibrate([0, 500, 200, 500]);
    }
    prev.current = { phase, left };
  }, [phase, left]);

  const live = phase === 'countdown' || phase === 'running' || phase === 'scoring';
  useKeepAwakeWhile(live, 'team-attempt');
  useBackgroundTimerAlerts(() => {
    if (phase !== 'countdown' && phase !== 'running') return [];
    const inSeconds = (Date.parse(attempt.cap_at) - now) / 1000;
    return inSeconds > 0
      ? [{ inSeconds, title: tr('timerAlerts.capReached'), body: tr('timerAlerts.capReachedBody') }]
      : [];
  });

  // ── Clock ──
  const clock = phase === 'countdown'
    ? String(left)
    : forTime
      ? ltr(formatClock(Math.floor(clockSeconds('time', attempt, now))))
      : ltr(formatClock(Math.ceil(clockSeconds('reps', attempt, now))));
  const clockLabel = phase === 'countdown'
    ? tr('team.getReady')
    : phase === 'scoring'
      ? (forTime ? tr('team.capReached') : tr('team.timeUp'))
      : forTime ? tr('team.elapsed') : tr('team.timeLeft');

  // ── What this phone does now ──
  let action: React.ReactNode = null;
  if (phase === 'running') {
    if (forTime && byLeader) {
      action = isLeader
        ? <KitButton tokens={t} label={tr('team.finishTeam')} onPress={() => onFinish()} loading={busy} disabled={busy} height={64} />
        : <Note tokens={t} text={tr('team.leaderFinishes')} />;
    } else if (forTime) {
      action = mine
        ? <Note tokens={t} text={`${tr('team.finishedAt', { time: formatTeamScore('time', mine.score) })} · ${tr('team.waitingTeammates')}`} good />
        : <KitButton tokens={t} label={tr('team.finishMine')} onPress={() => onFinish(myId)} loading={busy} disabled={busy} height={64} />;
    } else if (!byLeader || isLeader) {
      action = (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Label tokens={t}>{tr('team.roundCounter')}</Label>
          <Stepper tokens={t} value={roundTally} min={0} max={999} onChange={setRoundTally} size={52} label={tr('team.roundCounter')} />
          <Text style={[kt('light', 12.5, t.textMuted, 0, 18), { textAlign: 'center' }]}>{tr('team.roundCounterHint')}</Text>
        </View>
      );
    } else {
      action = <Note tokens={t} text={tr('team.leaderLogs')} />;
    }
  } else if (phase === 'scoring') {
    if (byLeader) {
      action = teamRow
        ? null
        : isLeader
          ? <ProgressEntry key="team" tokens={t} challenge={challenge} busy={busy} initialRounds={roundTally}
              title={forTime ? tr('team.enterProgressTeam') : tr('team.enterScore')}
              onSubmit={(r, p) => onSubmitProgress(null, r, p)} />
          : <Note tokens={t} text={tr('team.waitingLeaderScore')} />;
    } else if (entryFor?.user_id && !results.has(entryFor.user_id)) {
      action = <ProgressEntry key={entryFor.user_id} tokens={t} challenge={challenge} busy={busy}
        title={tr('team.enteringFor', { name: memberName(entryFor) })}
        onSubmit={(r, p) => onSubmitProgress(entryFor.user_id, r, p)} />;
    } else if (!mine && myId) {
      action = <ProgressEntry key="me" tokens={t} challenge={challenge} busy={busy} initialRounds={roundTally}
        title={forTime ? tr('team.enterProgress') : tr('team.enterMyScore')}
        onSubmit={(r, p) => onSubmitProgress(myId, r, p)} />;
    } else {
      action = (
        <Note tokens={t} good text={missing.length
          ? `${tr('team.scoreIn')} · ${tr('team.waitingFor', { names: missing.map(memberName).join(', ') })}`
          : tr('team.scoreIn')} />
      );
    }
  }

  // Collect: everyone's progress; the leader can act for anyone still missing.
  const showRoster = !byLeader && (phase === 'running' ? forTime : phase === 'scoring');
  const leaderCanAct = (m: TeamMember) => isLeader && m.user_id !== myId && (phase === 'scoring' || forTime);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={kt('medium', 11, t.textMuted, 2.4)}>{tr('team.attemptKicker')}</Text>
          <Text style={[kt('bold', 22, t.text, 1, 26), { marginTop: 2 }]} numberOfLines={1}>{team.name}</Text>
        </View>
        {isLeader && live && (
          <SquareButton tokens={t} icon="close" label={tr('team.cancelAttempt')} onPress={onCancel} />
        )}
      </View>

      <View style={{
        marginTop: 18, borderRadius: 24, paddingVertical: 22, alignItems: 'center',
        backgroundColor: phase === 'scoring' ? t.card : t.liveBg, borderWidth: 1, borderColor: phase === 'scoring' ? t.cardBorder : t.liveBorder,
      }}>
        <Label tokens={t}>{clockLabel}</Label>
        <Text
          accessibilityLiveRegion={phase === 'countdown' ? 'assertive' : 'none'}
          style={{ fontFamily: WORLD_FONTS.bold, fontSize: phase === 'countdown' ? 96 : 72, color: phase === 'countdown' ? t.accentText : t.text, writingDirection: 'ltr' }}
        >
          {clock}
        </Text>
        {forTime && phase !== 'scoring' && (
          <Text style={kt('medium', 12, t.textMuted, 1.6)}>{tr('team.capAt', { cap: ltr(formatClock(challenge.time_limit_sec)) })}</Text>
        )}
      </View>

      {action && <View style={{ paddingTop: 20 }}>{action}</View>}

      {showRoster && (
        <View style={{ paddingTop: 20, gap: 8 }}>
          {players.filter(m => m.user_id !== myId || phase === 'running').map(m => (
            <MemberStatus
              key={m.user_id!}
              tokens={t}
              member={m}
              result={results.get(m.user_id!)}
              forTime={forTime}
              canAct={leaderCanAct(m) && !busy}
              actLabel={phase === 'running' ? tr('team.finishFor', { name: memberName(m) }) : tr('team.enterFor', { name: memberName(m) })}
              onAct={() => (phase === 'running' ? onFinish(m.user_id!) : setEntryFor(m))}
            />
          ))}
        </View>
      )}

      {(phase === 'countdown' || phase === 'running') && <TeamMovements tokens={t} challenge={challenge} />}
    </ScrollView>
  );
}

function Note({ tokens: t, text, good }: { tokens: WeeklyTokens; text: string; good?: boolean }) {
  return (
    <View style={{ borderRadius: 16, padding: 16, backgroundColor: good ? t.greenSoft : t.card, borderWidth: 1, borderColor: good ? t.greenBorder : t.cardBorder }}>
      <Text style={[kt('regular', 14, good ? t.green : t.textSecondary, 0, 20), { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

// ── Result ─────────────────────────────────────────────────────────────────

export function TeamResultView({ tokens: t, state, attempt, rank, onDone }: {
  tokens: WeeklyTokens;
  state: TeamState;
  attempt: TeamAttempt;
  rank: { rank: number; count: number } | null;
  onDone: () => void;
}) {
  const { challenge, members, team } = state;
  const type = challenge.scoring_type;
  const score = Number(attempt.score ?? 0);
  const newBest = team.best_attempt_id === attempt.id;
  const perPlayer = !leaderSubmits(challenge.format);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48, paddingTop: 28, gap: 16 }} showsVerticalScrollIndicator={false}>
      <Text style={[kt('medium', 11, t.textMuted, 2.4), { textAlign: 'center' }]}>{tr('team.resultKicker')}</Text>
      <Text style={[kt('bold', 22, t.text, 1), { textAlign: 'center' }]} numberOfLines={1}>{team.name}</Text>
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 12 }}>
        <Label tokens={t}>{type === 'time' ? tr('team.teamTime') : tr('team.teamScore')}</Label>
        <Text style={{ fontFamily: WORLD_FONTS.bold, fontSize: 64, color: t.text, writingDirection: 'ltr' }}>{formatTeamScore(type, score)}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        <StatusPill
          tokens={t}
          good={newBest}
          text={newBest ? tr('team.newBest') : tr('team.bestWas', { best: formatTeamScore(type, Number(team.best_score ?? score)) })}
        />
        {attempt.capped ? <StatusPill tokens={t} good={false} text={tr('team.cappedTag')} /> : null}
        {rank ? <StatusPill tokens={t} good={rank.rank === 1} text={tr('team.rankNow', { rank: rank.rank, count: rank.count })} /> : null}
      </View>

      {perPlayer && (
        <View style={{ gap: 8, paddingTop: 8 }}>
          <Label tokens={t}>{tr('team.byPlayer')}</Label>
          {members.filter(m => m.user_id).map(m => {
            const r = attempt.results.find(x => x.user_id === m.user_id);
            return (
              <View key={m.user_id!} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder }}>
                <Text style={[kt('medium', 14, t.text), { flex: 1 }]} numberOfLines={1}>{memberName(m)}</Text>
                <Text style={kt('semibold', 14, r?.capped ? t.textMuted : t.text)}>
                  {r ? formatTeamScore(type, Number(r.score)) : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <KitButton tokens={t} label={tr('team.backToLobby')} onPress={onDone} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}
