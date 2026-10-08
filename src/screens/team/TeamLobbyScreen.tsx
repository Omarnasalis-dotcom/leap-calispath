import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { KitButton, KitIcon, WorldPage, YouBadge, kt } from '../../components/worlds/kit';
import { getWeeklyTokens, WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, SquareButton } from '../../components/weekly/WeeklyParts';
import { TeamChallengeCard, TeamMovements, formatTeamScore, memberName } from '../../components/team/TeamParts';
import { GlobalErrorBoundary } from '../../components/GlobalErrorBoundary';
import { LeapLogo } from '../../components/LeapLogo';
import { TeamChallengeError, TeamChallengeService } from '../../services/TeamChallengeService';
import { TeamAttempt, TeamMember, TeamState } from '../../lib/teamChallenge';
import { TeamAttemptView, TeamResultView } from './TeamAttempt';
import { track } from '../../lib/analytics';
import { useServerClock } from '../../hooks/useServerClock';
import { useMountedRef } from '../../hooks/useMountedRef';
import { t as tr } from '../../i18n';
import { WORLD_FONTS } from '../../../constants/worldKitTokens';

/** Backstop for dropped realtime events (first live-synced feature in the app). */
const POLL_MS = 3000;

function confirm(title: string, body: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: tr('team.cancel'), style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

function showError(e: unknown) {
  const message = e instanceof Error ? e.message : tr('team.loadFailed');
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(tr('weekly.title'), message);
}

function MemberRow({ tokens: t, member, isMe, canRemove, onRemove }: {
  tokens: WeeklyTokens; member: TeamMember; isMe: boolean; canRemove: boolean; onRemove: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16,
      borderRadius: 14, backgroundColor: isMe ? t.accentSoft : t.card, borderWidth: 1, borderColor: isMe ? t.liveBorder : t.cardBorder,
    }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' }}>
        {member.is_leader
          ? <KitIcon name="crown" size={16} color={t.gold} />
          : <Text style={kt('semibold', 13, t.textDim)}>{memberName(member).slice(0, 1).toUpperCase()}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[kt(isMe ? 'semibold' : 'regular', 15, member.user_id ? t.text : t.textFaint), { flexShrink: 1 }]} numberOfLines={1}>
          {memberName(member)}
        </Text>
        {isMe && <YouBadge tokens={t} />}
        {member.is_leader && <Text style={kt('bold', 10, t.gold, 1.4)}>{tr('team.leader')}</Text>}
      </View>
      {canRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('team.removePlayer', { name: memberName(member) })}
          hitSlop={8}
          onPress={onRemove}
          style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.control, opacity: pressed ? 0.6 : 1 })}
        >
          <KitIcon name="close" size={13} color={t.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

interface Props {
  teamId: string;
}

/** Results older than this aren't shown again when the lobby is reopened. */
const RESULT_FRESH_MS = 30 * 60 * 1000;

/** Team lobby: roster, invite code, start; the attempt and its result run here too. */
export function TeamLobbyScreen({ teamId }: Props) {
  const { mode } = useTheme();
  const t = useMemo(() => getWeeklyTokens(mode), [mode]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isMounted = useMountedRef();

  const [state, setState] = useState<TeamState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);
  const [rank, setRank] = useState<{ attemptId: string; rank: number; count: number } | null>(null);

  const attemptLive = state?.attempt?.status === 'running';
  const clock = useServerClock(attemptLive ? 250 : null);

  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await TeamChallengeService.getTeamState(teamId);
      if (!isMounted.current) return;
      clock.sync(res);
      setState(res.data);
      setLoadError(null);
    } catch (e: any) {
      if (!isMounted.current) return;
      // Removed from the team (or it was deleted): nothing to show here.
      if (e instanceof TeamChallengeError && e.code === 'NOT_A_MEMBER') {
        router.back();
        return;
      }
      setLoadError(e?.message ?? tr('team.loadFailed'));
    } finally {
      inFlight.current = false;
    }
  }, [teamId]);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    load();
    return () => setFocused(false);
  }, [load]));

  // Live updates, with polling underneath while the screen is open and the app is in front.
  useEffect(() => {
    const channel = supabase
      .channel(`team-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: `team_id=eq.${teamId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_attempts', filter: `team_id=eq.${teamId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_attempt_results' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId, load]);

  useEffect(() => {
    if (!focused) return;
    let active = AppState.currentState === 'active';
    const id = setInterval(() => { if (active) load(); }, POLL_MS);
    const sub = AppState.addEventListener('change', next => {
      active = next === 'active';
      if (active) load();
    });
    return () => { clearInterval(id); sub.remove(); };
  }, [focused, load]);

  // Board rank for a just-submitted attempt's result screen.
  const lastAttempt = state?.attempt;
  const showResultFor =
    lastAttempt?.status === 'submitted' && lastAttempt.submitted_at && lastAttempt.id !== dismissedResult &&
    clock.serverNow() - Date.parse(lastAttempt.submitted_at) < RESULT_FRESH_MS
      ? lastAttempt
      : null;
  const challengeId = state?.challenge.id;
  useEffect(() => {
    if (!showResultFor || !challengeId || rank?.attemptId === showResultFor.id) return;
    let cancelled = false;
    TeamChallengeService.getBoard(challengeId)
      .then(rows => {
        const mine = rows.find(r => r.team_id === teamId);
        if (!cancelled && isMounted.current && mine) setRank({ attemptId: showResultFor.id, rank: mine.rank, count: rows.length });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showResultFor?.id, challengeId]);

  /** Runs an action, then reloads whatever happened (also after a failure). */
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      showError(e);
    } finally {
      await load();
      if (isMounted.current) setBusy(false);
    }
  };

  if (!state) {
    return (
      <WorldPage tokens={t}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          {loadError ? (
            <>
              <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{loadError}</Text>
              <KitButton tokens={t} variant="outline" label={tr('team.retry')} onPress={load} height={48} />
            </>
          ) : <LeapLogo size={40} animated />}
        </View>
      </WorldPage>
    );
  }

  const { team, challenge, members, attempt } = state;
  const myId = user?.id;
  const isLeader = !!myId && team.leader_id === myId;
  const locked = team.locked_at != null;
  const present = members.filter(m => m.user_id);
  const missing = Math.max(0, challenge.team_size - present.length);
  const type = challenge.scoring_type;
  // Past the window: results are final, nothing to start, invite or leave.
  const ended = clock.serverNow() >= Date.parse(challenge.ends_at);
  const emptySlots = locked || ended ? 0 : missing;

  const share = () => {
    Share.share({
      message: tr('team.shareMessage', { team: team.name, challenge: challenge.title, code: team.invite_code }),
    }).catch(() => {});
  };

  const removeMember = (m: TeamMember) =>
    confirm(tr('team.removeTitle'), tr('team.removeBody', { name: memberName(m) }), tr('team.remove'), () =>
      run(() => TeamChallengeService.leaveTeam(team.id, m.user_id!)),
    );

  const leave = () =>
    confirm(tr('team.leaveTitle'), isLeader ? tr('team.leaveLeaderBody') : tr('team.leaveBody'), tr('team.leave'), async () => {
      setBusy(true);
      try {
        await TeamChallengeService.leaveTeam(team.id);
        router.back();
      } catch (e) {
        showError(e);
        await load();
      } finally {
        if (isMounted.current) setBusy(false);
      }
    });

  const start = () => run(async () => {
    const res = await TeamChallengeService.startAttempt(team.id);
    clock.sync(res);
    track('team_attempt_started', { format: challenge.format, scoring: challenge.scoring_type, team_size: challenge.team_size });
  });

  const submitted = (done: boolean) => {
    if (done) track('team_attempt_submitted', { format: challenge.format, scoring: challenge.scoring_type, team_size: challenge.team_size });
  };

  if (attemptLive && attempt) {
    const liveAttempt = attempt as TeamAttempt;
    return (
      <GlobalErrorBoundary>
        <WorldPage tokens={t}>
          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <TeamAttemptView
              tokens={t}
              state={{ ...state, attempt: liveAttempt }}
              now={clock.now}
              myId={myId}
              busy={busy}
              onFinish={userId => run(async () => submitted((await TeamChallengeService.finish(liveAttempt.id, userId)).attemptSubmitted))}
              onSubmitProgress={(userId, rounds, partial) =>
                run(async () => submitted((await TeamChallengeService.submitProgress(liveAttempt.id, userId, rounds, partial)).attemptSubmitted))}
              onCancel={() => confirm(tr('team.cancelAttemptTitle'), tr('team.cancelAttemptBody'), tr('team.cancelAttemptConfirm'),
                () => run(() => TeamChallengeService.abandonAttempt(liveAttempt.id)))}
            />
          </View>
        </WorldPage>
      </GlobalErrorBoundary>
    );
  }

  if (showResultFor) {
    return (
      <GlobalErrorBoundary>
        <WorldPage tokens={t}>
          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <TeamResultView
              tokens={t}
              state={state}
              attempt={showResultFor}
              rank={rank?.attemptId === showResultFor.id ? rank : null}
              onDone={() => setDismissedResult(showResultFor.id)}
            />
          </View>
        </WorldPage>
      </GlobalErrorBoundary>
    );
  }

  return (
    <GlobalErrorBoundary>
      <WorldPage tokens={t}>
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 14 }}>
              <SquareButton tokens={t} icon="back" label={tr('common.close')} onPress={() => router.back()} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={kt('medium', 11, t.textMuted, 2.4)}>{tr('team.lobbyKicker')}</Text>
                <Text style={[kt('bold', 24, t.text, 1, 28), { marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{team.name}</Text>
              </View>
            </View>

            {/* Invite code while there's room on the team. */}
            {!locked && !ended && missing > 0 && (
              <View style={{ marginTop: 16, borderRadius: 20, padding: 16, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, gap: 12 }}>
                <Label tokens={t}>{tr('team.inviteCode')}</Label>
                <Text
                  selectable
                  accessibilityLabel={`${tr('team.inviteCode')} ${team.invite_code.split('').join(' ')}`}
                  style={{ fontFamily: WORLD_FONTS.bold, fontSize: 40, letterSpacing: 10, color: t.text, textAlign: 'center', writingDirection: 'ltr' }}
                >
                  {team.invite_code}
                </Text>
                <KitButton tokens={t} variant="outline" label={tr('team.shareCode')} onPress={share} height={48} fontSize={14} />
                <Text style={[kt('light', 12.5, t.textMuted, 0, 18), { textAlign: 'center' }]}>{tr('team.inviteHint')}</Text>
              </View>
            )}

            <View style={{ paddingTop: 24, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Label tokens={t} size={11}>{tr('team.players')}</Label>
                <Text style={kt('medium', 12, t.textSecondary, 1.4)}>
                  {locked ? tr('team.rosterLocked') : tr('team.playersCount', { n: present.length, size: challenge.team_size })}
                </Text>
              </View>
              {members.map((m, i) => (
                <MemberRow
                  key={m.user_id ?? `deleted-${i}`}
                  tokens={t}
                  member={m}
                  isMe={m.user_id === myId}
                  canRemove={isLeader && !locked && !ended && !attemptLive && !!m.user_id && m.user_id !== myId}
                  onRemove={() => removeMember(m)}
                />
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <View key={`empty-${i}`} style={{ minHeight: 56, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, justifyContent: 'center', paddingHorizontal: 16 }}>
                  <Text style={kt('light', 14, t.textFaint)}>{tr('team.waitingPlayer')}</Text>
                </View>
              ))}
              {locked && <Text style={kt('light', 12.5, t.textMuted, 0, 18)}>{tr('team.rosterLockedHint')}</Text>}
            </View>

            {team.best_score != null && (
              <View style={{ marginTop: 20, flexDirection: 'row', borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, paddingVertical: 16 }}>
                <View style={{ flex: 1, paddingHorizontal: 20 }}>
                  <Label tokens={t}>{tr('team.teamBest')}</Label>
                  <Text style={[kt('semibold', 24, t.text), { marginTop: 4 }]}>{formatTeamScore(type, Number(team.best_score))}</Text>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 20, borderStartWidth: 1, borderStartColor: t.cardBorder }}>
                  <Label tokens={t}>{tr('team.attempts')}</Label>
                  <Text style={[kt('semibold', 24, t.text), { marginTop: 4 }]}>{team.attempts_count}</Text>
                </View>
              </View>
            )}

            <TeamChallengeCard tokens={t} challenge={challenge} />
            <TeamMovements tokens={t} challenge={challenge} />

            {!locked && !ended && !attemptLive && (
              <Pressable accessibilityRole="button" onPress={leave} disabled={busy} hitSlop={10} style={({ pressed }) => ({ alignSelf: 'center', marginTop: 28, padding: 6, opacity: pressed ? 0.6 : 1 })}>
                <Text style={kt('medium', 13, t.textMuted, 2)}>{tr('team.leave')}</Text>
              </Pressable>
            )}
          </ScrollView>

          {!attemptLive && (
            <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20 }}>
              {ended ? (
                <View style={{ borderRadius: 16, padding: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, alignItems: 'center', gap: 4 }}>
                  <Text style={kt('bold', 13, t.text, 1.6)}>{tr('team.challengeEnded')}</Text>
                  <Text style={[kt('light', 12.5, t.textMuted, 0, 18), { textAlign: 'center' }]}>{tr('team.challengeEndedHint')}</Text>
                </View>
              ) : isLeader ? (
                <KitButton
                  tokens={t}
                  label={missing > 0 ? tr('team.playersNeeded', { count: missing }) : tr('team.start')}
                  icon={missing > 0 ? undefined : 'play'}
                  onPress={start}
                  disabled={missing > 0 || busy}
                  loading={busy}
                />
              ) : (
                <KitButton tokens={t} variant="outline" label={tr('team.waitingLeader')} onPress={() => {}} disabled />
              )}
            </View>
          )}
        </View>
      </WorldPage>
    </GlobalErrorBoundary>
  );
}
