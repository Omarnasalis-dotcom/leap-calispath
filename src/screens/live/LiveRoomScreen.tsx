import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, ScrollView, Share, Text, TextInput, Vibration, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { KitButton, KitIcon, WorldPage, WorldSheet, YouBadge, kt } from '../../components/worlds/kit';
import { getWeeklyTokens, WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, SquareButton, StatusPill, StepButton } from '../../components/weekly/WeeklyParts';
import {
  HalfExercises, HalvesList, LiveChallengeCard, LivePodium, OnlineDot, formatPts, playerName, sideLabel,
} from '../../components/live/LiveParts';
import { LiveCelebration } from '../../components/live/LiveCelebration';
import { GlobalErrorBoundary } from '../../components/GlobalErrorBoundary';
import { LeapLogo } from '../../components/LeapLogo';
import { LiveTournamentError, LiveTournamentService } from '../../services/LiveTournamentService';
import {
  LiveHalf, LivePlayer, LiveRoomState, bumpTally, canStartNextHalf, clampReps, closedAtMs, countdownLeft, halfPoints,
  halfSecondsLeft, livePhase, lobbyStatus, logSecondsLeft, offlinePlayers, restSecondsLeft, sideHasRoom, sideNameOf,
  sideStandings, HOST_FALLBACK_SEC, SIDE_NAME_MAX,
} from '../../lib/liveTournament';
import { formatClock } from '../../lib/weeklyChallenge';
import { setOpenLiveRoom } from '../../lib/liveRoomFocus';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { track } from '../../lib/analytics';
import { useServerClock } from '../../hooks/useServerClock';
import { useMountedRef } from '../../hooks/useMountedRef';
import { useKeepAwakeWhile } from '../../hooks/useKeepAwakeWhile';
import { useBackgroundTimerAlerts } from '../../hooks/useBackgroundTimerAlerts';
import { ltr, t as tr } from '../../i18n';
import { WORLD_FONTS } from '../../../constants/worldKitTokens';

/**
 * Backstop for dropped realtime events; also how each phone reports it's
 * online (15 s window). Slower while a half runs, when nothing on the
 * server changes (the phone also reloads at every timer edge). Keeps a
 * full room light on the database: see 20261023140000_live_load_tuning.
 */
const POLL_MS = { idle: 3000, running: 6000 } as const;
/** Logging alert lead: "30 seconds left to log". */
const LOG_WARN_SEC = 30;

const clockText = (seconds: number) => ltr(formatClock(Math.max(0, Math.ceil(seconds))));

function confirm(title: string, body: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: tr('live.cancel'), style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

function showError(e: unknown) {
  const message = e instanceof Error ? e.message : tr('live.loadFailed');
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(tr('live.kicker'), message);
}

// ── Offline-safe log drafts ────────────────────────────────────────────────
// A log is saved on the phone before it's sent; `pending` stays true until
// the server has it, so a send that fails for lack of signal is retried on
// reconnect (or on the next successful poll) while logging is still open.

interface LogDraft {
  reps: number[];
  pending: boolean;
}

const draftKey = (roomId: string, half: number, userId: string) => `live-log:${roomId}:${half}:${userId}`;
/** The player's own rep counter during a half (never sent; it pre-fills their log). */
const tallyKey = (roomId: string, half: number, userId: string) => `live-tally:${roomId}:${half}:${userId}`;

async function readTally(key: string): Promise<number[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

async function readDraft(key: string): Promise<LogDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LogDraft) : null;
  } catch {
    return null;
  }
}

async function writeDraft(key: string, draft: LogDraft | null): Promise<void> {
  try {
    if (draft) await AsyncStorage.setItem(key, JSON.stringify(draft));
    else await AsyncStorage.removeItem(key);
  } catch {
    // Storage blocked: the send itself still works online.
  }
}

// ── Screen ─────────────────────────────────────────────────────────────────

interface Props {
  roomId: string;
}

/** A Live Tournament room: lobby, each half, logging, standings and the final reveal. */
export function LiveRoomScreen({ roomId }: Props) {
  const { mode } = useTheme();
  const t = useMemo(() => getWeeklyTokens(mode), [mode]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myId = user?.id;
  const isMounted = useMountedRef();

  const [state, setState] = useState<LiveRoomState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const [online, setOnline] = useState(true);

  const playing = state?.room.status === 'playing';
  const clock = useServerClock(playing ? 250 : null);

  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await LiveTournamentService.getRoomState(roomId);
      if (!isMounted.current) return;
      clock.sync(res);
      setState(res.data);
      setLoadError(null);
    } catch (e: any) {
      if (!isMounted.current) return;
      // Removed from the room: nothing to show here.
      if (e instanceof LiveTournamentError && e.code === 'NOT_IN_ROOM') {
        router.back();
        return;
      }
      setLoadError(e?.message ?? tr('live.loadFailed'));
    } finally {
      inFlight.current = false;
    }
  }, [roomId]);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    setOpenLiveRoom(roomId);
    load();
    return () => {
      setFocused(false);
      setOpenLiveRoom(null);
    };
  }, [load, roomId]));

  useEffect(() => NetInfo.addEventListener(s => setOnline(s.isConnected !== false)), []);

  // Live updates, with polling underneath while the room is open and the app is in front.
  useEffect(() => {
    const channel = supabase
      .channel(`live-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_rooms', filter: `id=eq.${roomId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_room_players', filter: `room_id=eq.${roomId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, load]);

  const settled = state?.room.status === 'finished' || state?.room.status === 'abandoned';
  const halfRunning = !!state && state.room.status === 'playing' && state.room.half_closed_at == null
    && clock.serverNow() < Date.parse(state.room.half_ends_at ?? '');
  const pollMs = halfRunning ? POLL_MS.running : POLL_MS.idle;
  useEffect(() => {
    if (!focused || settled) return;
    let active = AppState.currentState === 'active';
    const id = setInterval(() => { if (active) load(); }, pollMs);
    const sub = AppState.addEventListener('change', next => {
      active = next === 'active';
      if (active) load();
    });
    return () => { clearInterval(id); sub.remove(); };
  }, [focused, settled, load, pollMs]);

  // Reload at the moments the step changes on the server clock (timer end, logging deadline).
  const now = clock.now;
  const halfCount = state?.challenge.halves.length ?? 0;
  const phase = state ? livePhase(state.room, halfCount, now) : 'lobby';
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current !== phase && (phase === 'logging' || phase === 'rest' || phase === 'finished')) load();
    prevPhase.current = phase;
  }, [phase, load]);

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

  // ── Sound + haptics on every phone, driven by the shared clock ──
  const left = state && phase === 'countdown' ? countdownLeft(state.room, now) : 0;
  const prevSound = useRef({ phase, left });
  useEffect(() => {
    const p = prevSound.current;
    if (phase === 'countdown' && left !== p.left && left > 0 && left <= 3) SoundService.playTick();
    if (phase === 'running' && p.phase === 'countdown') {
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
    }
    if (phase === 'logging' && p.phase === 'running') {
      SoundService.playDigitalBuzzer(2);
      Vibration.vibrate([0, 500, 200, 500]);
    }
    prevSound.current = { phase, left };
  }, [phase, left]);

  const inRoom = state?.room.status === 'lobby' || playing;
  useKeepAwakeWhile(!!inRoom && focused, 'live-room');

  const myResultThisHalf = state?.results.find(r => r.half === state.room.current_half && r.user_id === myId);
  useBackgroundTimerAlerts(() => {
    if (!state || !playing) return [];
    const r = state.room;
    const n = r.current_half;
    const at = (iso: string | null, offsetSec = 0) => (iso ? (Date.parse(iso) - now) / 1000 + offsetSec : -1);
    const alerts = [];
    if (phase === 'countdown') {
      alerts.push({ inSeconds: at(r.half_started_at), title: tr('live.alertGoTitle', { n }), body: tr('live.alertGoBody') });
    }
    if (phase === 'countdown' || phase === 'running') {
      alerts.push({ inSeconds: at(r.half_ends_at), title: tr('live.alertTimeUpTitle'), body: tr('live.alertTimeUpBody') });
    }
    if ((phase === 'countdown' || phase === 'running' || phase === 'logging') && !myResultThisHalf) {
      alerts.push({ inSeconds: at(r.log_closes_at, -LOG_WARN_SEC), title: tr('live.alertLogSoonTitle'), body: tr('live.alertLogSoonBody') });
    }
    return alerts.filter(a => a.inSeconds > 0);
  });

  const finishedTracked = useRef(false);
  useEffect(() => {
    if (state?.room.status === 'finished' && !finishedTracked.current) {
      finishedTracked.current = true;
      track('live_match_finished', { halves: state.room.current_half, sides: state.room.side_count, players: state.players.length });
    }
  }, [state?.room.status]);

  if (!state) {
    return (
      <WorldPage tokens={t}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          {loadError ? (
            <>
              <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{loadError}</Text>
              <KitButton tokens={t} variant="outline" label={tr('live.retry')} onPress={load} height={48} />
            </>
          ) : <LeapLogo size={40} animated />}
        </View>
      </WorldPage>
    );
  }

  const { room, challenge, players } = state;
  const isHost = !!myId && room.host_id === myId;

  const startHalf = () => {
    const away = offlinePlayers(players).filter(p => p.user_id !== myId);
    const go = () => run(async () => {
      const res = await LiveTournamentService.startHalf(roomId);
      clock.sync(res);
      track('live_half_started', { half: res.data.half, sides: room.side_count, players: players.length });
      // Best effort: the half has started either way.
      void LiveTournamentService.sendHalfStartedPush(roomId);
    });
    if (away.length > 0) {
      confirm(tr('live.offlineWarnTitle'), tr('live.offlineWarnBody', { names: away.map(playerName).join(', ') }), tr('live.startAnyway'), go);
    } else {
      go();
    }
  };

  const endRoom = () => confirm(tr('live.endTitle'), tr('live.endBody'), tr('live.endRoom'), () =>
    run(() => LiveTournamentService.abandonRoom(roomId)));

  let body: React.ReactNode;
  if (room.status === 'abandoned') {
    body = <EndedView tokens={t} />;
  } else if (phase === 'finished') {
    body = <LiveCelebration tokens={t} state={state} myId={myId} />;
  } else if (phase === 'lobby') {
    body = (
      <LobbyView
        tokens={t} state={state} myId={myId} isHost={isHost} busy={busy}
        onPickSide={side => run(() => LiveTournamentService.pickSide(roomId, side))}
        onNameSide={name => LiveTournamentService.nameSide(roomId, name).then(() => load())}
        onReady={ready => run(() => LiveTournamentService.setReady(roomId, ready))}
        onRemove={p => confirm(tr('live.removeTitle'), tr('live.removeBody', { name: playerName(p) }), tr('live.remove'),
          () => run(() => LiveTournamentService.leaveRoom(roomId, p.user_id!)))}
        onLeave={() => confirm(tr('live.leaveTitle'), isHost ? tr('live.leaveHostBody') : tr('live.leaveBody'), tr('live.leave'), async () => {
          setBusy(true);
          try {
            await LiveTournamentService.leaveRoom(roomId);
            router.back();
          } catch (e) {
            showError(e);
            await load();
          } finally {
            if (isMounted.current) setBusy(false);
          }
        })}
        onStart={startHalf}
      />
    );
  } else if (phase === 'countdown' || phase === 'running') {
    body = <PlayView key={`play-${room.current_half}`} tokens={t} state={state} now={now} myId={myId} />;
  } else if (phase === 'logging') {
    body = (
      <LogView
        key={`log-${room.current_half}`}
        tokens={t} state={state} now={now} myId={myId} isHost={isHost} online={online}
        onLogged={() => load()}
      />
    );
  } else {
    body = (
      <RestView
        tokens={t} state={state} now={now} myId={myId} busy={busy}
        canStart={canStartNextHalf(room, halfCount, myId, now)}
        onStart={startHalf}
      />
    );
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 14, paddingHorizontal: 24 }}>
      <SquareButton tokens={t} icon="back" label={tr('common.close')} onPress={() => router.back()} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={kt('medium', 11, t.textMuted, 2.4)}>
          {room.status === 'playing' ? tr('live.halfOf', { n: room.current_half, total: halfCount }) : tr('live.roomKicker')}
        </Text>
        <Text style={[kt('bold', 22, t.text, 1, 26), { marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
          {challenge.title.toUpperCase()}
        </Text>
      </View>
      {isHost && inRoom && (
        <SquareButton tokens={t} icon="close" label={tr('live.endRoom')} onPress={endRoom} />
      )}
    </View>
  );

  return (
    <GlobalErrorBoundary>
      <WorldPage tokens={t}>
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          {header}
          {body}
        </View>
      </WorldPage>
    </GlobalErrorBoundary>
  );
}

// ── Lobby ──────────────────────────────────────────────────────────────────

function PlayerRow({ tokens: t, player, isMe, showReady, canRemove, onRemove }: {
  tokens: WeeklyTokens; player: LivePlayer; isMe: boolean; showReady: boolean; canRemove: boolean; onRemove: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12,
      borderRadius: 12, backgroundColor: isMe ? t.accentSoft : t.card, borderWidth: 1, borderColor: isMe ? t.liveBorder : t.cardBorder,
    }}>
      <OnlineDot tokens={t} online={player.online} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[kt(isMe ? 'semibold' : 'regular', 14.5, player.user_id ? t.text : t.textFaint), { flexShrink: 1 }]} numberOfLines={1}>
          {playerName(player)}
        </Text>
        {isMe && <YouBadge tokens={t} />}
        {player.is_host && <KitIcon name="crown" size={13} color={t.gold} />}
      </View>
      {player.online === false && <Text style={kt('medium', 10, t.textFaint, 1.2)}>{tr('live.offline')}</Text>}
      {showReady && (player.is_ready
        ? <Text style={kt('bold', 10.5, t.green, 1.4)}>{tr('live.ready')}</Text>
        : null)}
      {canRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('live.removePlayer', { name: playerName(player) })}
          hitSlop={8}
          onPress={onRemove}
          style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: t.control, opacity: pressed ? 0.6 : 1 })}
        >
          <KitIcon name="close" size={12} color={t.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

function LobbyView({ tokens: t, state, myId, isHost, busy, onPickSide, onNameSide, onReady, onRemove, onLeave, onStart }: {
  tokens: WeeklyTokens; state: LiveRoomState; myId: string | undefined; isHost: boolean; busy: boolean;
  onPickSide: (side: number | null) => void; onNameSide: (name: string) => Promise<void>; onReady: (ready: boolean) => void;
  onRemove: (p: LivePlayer) => void; onLeave: () => void; onStart: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { room, challenge, players, side_names: names } = state;
  const real = players.filter(p => p.user_id);
  const me = real.find(p => p.user_id === myId);
  const status = lobbyStatus(players, room.side_count, names);

  // Team name sheet (your own side only).
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const openNaming = () => {
    setNameInput(me?.side != null ? sideNameOf(names, me.side) ?? '' : '');
    setNameError(null);
    setNaming(true);
  };
  const saveName = async () => {
    const value = nameInput.trim();
    if (!value || savingName) return;
    setSavingName(true);
    setNameError(null);
    try {
      await onNameSide(value);
      setNaming(false);
    } catch (e: any) {
      setNameError(e?.message ?? tr('live.loadFailed'));
    } finally {
      setSavingName(false);
    }
  };
  const unassigned = real.filter(p => p.side == null);

  const share = () => {
    Share.share({ message: tr('live.shareMessage', { challenge: challenge.title, code: room.code }) }).catch(() => {});
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 170 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: 16, borderRadius: 20, padding: 16, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, gap: 12 }}>
          <Label tokens={t}>{tr('live.roomCode')}</Label>
          <Text
            selectable
            accessibilityLabel={`${tr('live.roomCode')} ${room.code.split('').join(' ')}`}
            style={{ fontFamily: WORLD_FONTS.bold, fontSize: 40, letterSpacing: 10, color: t.text, textAlign: 'center', writingDirection: 'ltr' }}
          >
            {room.code}
          </Text>
          <KitButton tokens={t} variant="outline" label={tr('live.shareCode')} onPress={share} height={48} fontSize={14} />
          <Text style={[kt('light', 12.5, t.textMuted, 0, 18), { textAlign: 'center' }]}>{tr('live.inviteHint')}</Text>
        </View>

        {Array.from({ length: room.side_count }, (_, i) => i + 1).map(side => {
          const onSide = real.filter(p => p.side === side);
          const mine = me?.side === side;
          const canJoin = !!me && !mine && sideHasRoom(players, side, challenge.team_size, myId);
          return (
            <View key={side} style={{ paddingTop: 20, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={kt('bold', 15, mine ? t.accentText : t.text, 0.8)} numberOfLines={1}>{sideLabel(side, names)}</Text>
                  <Text style={kt('medium', 11, t.textMuted, 1.2)} numberOfLines={1}>
                    {sideNameOf(names, side) == null
                      ? `${tr('live.unnamed')} · ${tr('live.sideCount', { n: onSide.length, size: challenge.team_size })}`
                      : tr('live.sideCount', { n: onSide.length, size: challenge.team_size })}
                  </Text>
                </View>
                {mine && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={openNaming}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: t.accent, opacity: pressed || busy ? 0.6 : 1 })}
                  >
                    <KitIcon name="pencil" size={12} color={t.accentText} />
                    <Text style={kt('bold', 11, t.accentText, 1.2)}>{sideNameOf(names, side) == null ? tr('live.nameTeam') : tr('live.rename')}</Text>
                  </Pressable>
                )}
                {canJoin && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onPickSide(side)}
                    style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: t.accent, opacity: pressed || busy ? 0.6 : 1 })}
                  >
                    <Text style={kt('bold', 11.5, t.onAccent, 1.4)}>{tr('live.joinSide')}</Text>
                  </Pressable>
                )}
              </View>
              {onSide.map(p => (
                <PlayerRow
                  key={p.user_id!}
                  tokens={t}
                  player={p}
                  isMe={p.user_id === myId}
                  showReady
                  canRemove={isHost && p.user_id !== myId}
                  onRemove={() => onRemove(p)}
                />
              ))}
              {Array.from({ length: Math.max(0, challenge.team_size - onSide.length) }).map((_, i) => (
                <View key={`open-${i}`} style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, justifyContent: 'center', paddingHorizontal: 14 }}>
                  <Text style={kt('light', 13.5, t.textFaint)}>{tr('live.openSpot')}</Text>
                </View>
              ))}
            </View>
          );
        })}

        {unassigned.length > 0 && (
          <View style={{ paddingTop: 20, gap: 8 }}>
            <Label tokens={t} size={11}>{tr('live.noSide')}</Label>
            {unassigned.map(p => (
              <PlayerRow
                key={p.user_id!}
                tokens={t}
                player={p}
                isMe={p.user_id === myId}
                showReady={false}
                canRemove={isHost && p.user_id !== myId}
                onRemove={() => onRemove(p)}
              />
            ))}
          </View>
        )}

        <LiveChallengeCard tokens={t} challenge={challenge} />
        <HalvesList tokens={t} halves={challenge.halves} />

        <Pressable accessibilityRole="button" onPress={onLeave} disabled={busy} hitSlop={10} style={({ pressed }) => ({ alignSelf: 'center', marginTop: 28, padding: 6, opacity: pressed ? 0.6 : 1 })}>
          <Text style={kt('medium', 13, t.textMuted, 2)}>{tr('live.leave')}</Text>
        </Pressable>
      </ScrollView>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20, gap: 10 }}>
        {me?.side == null ? (
          <View style={{ borderRadius: 14, padding: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder }}>
            <Text style={[kt('regular', 13, t.textSecondary, 0, 18), { textAlign: 'center' }]}>{tr('live.pickSideFirst')}</Text>
          </View>
        ) : (
          <KitButton
            tokens={t}
            variant={me.is_ready ? 'outline' : undefined}
            label={me.is_ready ? tr('live.notReadyYet') : tr('live.imReady')}
            icon={me.is_ready ? undefined : 'check'}
            onPress={() => onReady(!me.is_ready)}
            disabled={busy}
            height={52}
          />
        )}
        {isHost ? (
          <KitButton
            tokens={t}
            label={status.blocker ? tr(`live.blocker_${status.blocker}`) : tr('live.startHalf', { n: 1 })}
            icon={status.blocker ? undefined : 'play'}
            onPress={onStart}
            disabled={!!status.blocker || busy}
            loading={busy}
          />
        ) : (
          <KitButton tokens={t} variant="outline" label={tr('live.waitingHost')} onPress={() => {}} disabled />
        )}
      </View>

      <WorldSheet tokens={t} visible={naming} onClose={() => { if (!savingName) setNaming(false); }} variant="log" title={tr('live.teamNameTitle')}>
        <View style={{ gap: 14, paddingBottom: 8, paddingHorizontal: 24 }}>
          <Text style={kt('light', 14, t.textSecondary, 0, 20)}>{tr('live.teamNameHint')}</Text>
          <TextInput
            value={nameInput}
            onChangeText={v => { setNameInput(v); setNameError(null); }}
            placeholder={tr('live.teamNamePlaceholder')}
            placeholderTextColor={t.textFaint}
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            maxLength={SIDE_NAME_MAX}
            returnKeyType="done"
            onSubmitEditing={saveName}
            accessibilityLabel={tr('live.teamNamePlaceholder')}
            style={[
              { height: 56, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: nameError ? t.accent : t.tintBorder, backgroundColor: t.inputBg },
              // kt() swaps in the Arabic face; team names can be Arabic.
              kt('medium', 17, t.text),
            ]}
          />
          {nameError ? <Text style={kt('regular', 13, t.accentText, 0, 18)}>{nameError}</Text> : null}
          <KitButton tokens={t} label={tr('live.save')} onPress={saveName} loading={savingName} disabled={savingName || nameInput.trim() === ''} />
        </View>
      </WorldSheet>
    </>
  );
}

// ── Countdown + half timer ─────────────────────────────────────────────────

function BigClock({ tokens: t, label, value, hot, countdown }: { tokens: WeeklyTokens; label: string; value: string; hot: boolean; countdown?: boolean }) {
  return (
    <View style={{
      marginTop: 18, borderRadius: 24, paddingVertical: 22, alignItems: 'center',
      backgroundColor: hot ? t.liveBg : t.card, borderWidth: 1, borderColor: hot ? t.liveBorder : t.cardBorder,
    }}>
      <Label tokens={t}>{label}</Label>
      <Text
        accessibilityLiveRegion={countdown ? 'assertive' : 'none'}
        style={{ fontFamily: WORLD_FONTS.bold, fontSize: countdown ? 96 : 72, color: countdown ? t.accentText : t.text, writingDirection: 'ltr' }}
      >
        {value}
      </Text>
    </View>
  );
}

/** One exercise during a half: −5 · −1 · a number you can type · +1 · +5. */
function TallyRow({ tokens: t, name, points, max, value, onBump, onSet }: {
  tokens: WeeklyTokens; name: string; points: number; max: number; value: number;
  onBump: (delta: number) => void; onSet: (value: number) => void;
}) {
  const full = value >= max;
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const step = (delta: number) => {
    const disabled = delta < 0 ? value <= 0 : full;
    return (
      <Pressable
        key={delta}
        accessibilityRole="button"
        accessibilityLabel={`${name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
        disabled={disabled}
        onPress={() => onBump(delta)}
        style={({ pressed }) => ({
          flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: delta > 0 ? (delta === 1 ? t.accent : t.buttonTint) : t.control,
          borderWidth: delta > 0 ? 0 : 1, borderColor: t.cardBorder,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <Text style={[kt('bold', 16, delta === 1 ? t.onAccent : delta > 0 ? t.accentText : t.textSecondary), { writingDirection: 'ltr' }]}>
          {`${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 10, backgroundColor: t.card, borderWidth: 1, borderColor: full ? t.greenBorder : t.liveBorder }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <Text style={[kt('medium', 16, t.text, 0.4), { flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
        <Text style={kt('medium', 11, t.textMuted, 1.2)}>{tr('weekly.ptsPerRep', { count: points })}</Text>
      </View>
      {/* Steps stay in this order in Arabic too (minus on the left, like a number line). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' }}>
        {step(-5)}
        {step(-1)}
        <View style={{ alignItems: 'center', gap: 2 }}>
          <TextInput
            value={text}
            onChangeText={raw => {
              const digits = raw.replace(/[^0-9]/g, '');
              setText(digits);
              if (digits !== '') onSet(Math.min(max, Number(digits)));
            }}
            onBlur={() => setText(String(value))}
            keyboardType="number-pad"
            inputMode="numeric"
            selectTextOnFocus
            maxLength={3}
            accessibilityLabel={`${name} ${tr('live.repsField')}`}
            style={{
              width: 76, height: 52, borderRadius: 12, borderWidth: 1, borderColor: full ? t.greenBorder : t.tintBorder,
              backgroundColor: t.inputBg, textAlign: 'center', fontFamily: WORLD_FONTS.bold, fontSize: 28,
              color: full ? t.green : t.text, padding: 0, writingDirection: 'ltr',
            }}
          />
          <Text style={kt('medium', 10.5, t.textFaint, 1.2)}>{tr('live.maxReps', { reps: max })}</Text>
        </View>
        {step(1)}
        {step(5)}
      </View>
    </View>
  );
}

function PlayView({ tokens: t, state, now, myId }: { tokens: WeeklyTokens; state: LiveRoomState; now: number; myId: string | undefined }) {
  const isMounted = useMountedRef();
  const { room, challenge, players } = state;
  const n = room.current_half;
  const half = challenge.halves[n - 1];
  const counting = now < Date.parse(room.half_started_at ?? '');
  const playing = players.some(p => p.user_id === myId && p.side != null);
  const key = myId ? tallyKey(room.id, n, myId) : null;
  const [tally, setTally] = useState<number[]>(() => half?.movements.map(() => 0) ?? []);

  // Survives the app closing mid-half.
  useEffect(() => {
    if (!key || !half) return;
    readTally(key).then(saved => { if (saved && isMounted.current) setTally(clampReps(half.movements, saved)); });
  }, [key]);

  const bump = (i: number, delta: number) => {
    if (!half) return;
    setTally(prev => {
      const next = bumpTally(half.movements, prev, i, delta);
      if (key) AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <BigClock
        tokens={t}
        hot
        countdown={counting}
        label={counting ? tr('live.getReady') : tr('live.timeLeft')}
        value={counting ? String(countdownLeft(room, now)) : clockText(halfSecondsLeft(room, now))}
      />
      {half && playing ? (
        <View style={{ paddingTop: 20, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Label tokens={t} size={11} color={t.accentText}>{tr('live.halfOf', { n, total: challenge.halves.length })}</Label>
            <Text style={kt('semibold', 14, t.text)}>{formatPts(halfPoints(half.movements, tally))}</Text>
          </View>
          {half.movements.map((m, i) => (
            <TallyRow
              key={`${m.name}-${i}`} tokens={t} name={m.name} points={m.points} max={m.reps} value={tally[i] ?? 0}
              onBump={d => bump(i, d)} onSet={v => bump(i, v - (tally[i] ?? 0))}
            />
          ))}
          <Text style={kt('light', 12.5, t.textMuted, 0, 18)}>{tr('live.counterHint')}</Text>
        </View>
      ) : half ? (
        <View style={{ paddingTop: 20 }}><HalfExercises tokens={t} half={half} n={n} total={challenge.halves.length} highlight /></View>
      ) : null}
    </ScrollView>
  );
}

// ── Logging ────────────────────────────────────────────────────────────────

function RepsRow({ tokens: t, name, max, value, onChange }: {
  tokens: WeeklyTokens; name: string; max: number; value: number; onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 12,
      borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder,
    }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={kt('medium', 15, t.text)} numberOfLines={1}>{name}</Text>
        <Text style={kt('regular', 11, t.textFaint)}>{tr('live.maxReps', { reps: max })}</Text>
      </View>
      <StepButton tokens={t} kind="minus" size={36} label={`${name} −`} disabled={value <= 0} onPress={() => onChange(Math.max(0, value - 1))} />
      <TextInput
        value={text}
        onChangeText={raw => {
          const digits = raw.replace(/[^0-9]/g, '');
          setText(digits);
          if (digits !== '') onChange(Math.min(max, Number(digits)));
        }}
        onBlur={() => setText(String(value))}
        keyboardType="number-pad"
        inputMode="numeric"
        selectTextOnFocus
        maxLength={3}
        accessibilityLabel={name}
        style={{
          width: 56, height: 44, borderRadius: 10, borderWidth: 1, borderColor: t.tintBorder, backgroundColor: t.inputBg,
          textAlign: 'center', fontFamily: WORLD_FONTS.bold, fontSize: 22, color: t.text, padding: 0, writingDirection: 'ltr',
        }}
      />
      <StepButton tokens={t} kind="plus" size={36} label={`${name} +`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

/** Reps per exercise for one player, saved on the phone first and sent (resent on reconnect). */
function LogForm({ tokens: t, roomId, half, halfN, userId, isSelf, title, online, onSent }: {
  tokens: WeeklyTokens; roomId: string; half: LiveHalf; halfN: number; userId: string; isSelf: boolean; title: string;
  online: boolean; onSent: (points: number) => void;
}) {
  const isMounted = useMountedRef();
  const key = draftKey(roomId, halfN, userId);
  const [reps, setReps] = useState<number[]>(() => half.movements.map(() => 0));
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  // Restore a draft (e.g. the app was closed while offline); otherwise start
  // from the player's own counter from the half.
  useEffect(() => {
    (async () => {
      const d = await readDraft(key);
      if (!isMounted.current) return;
      if (d) {
        setReps(clampReps(half.movements, d.reps));
        setPending(d.pending);
        return;
      }
      const counted = isSelf ? await readTally(tallyKey(roomId, halfN, userId)) : null;
      if (counted && isMounted.current) setReps(clampReps(half.movements, counted));
    })();
  }, [key]);

  const send = useCallback(async (values: number[]) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    await writeDraft(key, { reps: values, pending: true });
    try {
      const res = await LiveTournamentService.submitReps(roomId, halfN, values, userId);
      await writeDraft(key, null);
      track('live_reps_logged', { half: halfN, self: isSelf });
      if (isMounted.current) setPending(false);
      onSent(res.points);
    } catch (e: any) {
      if (e instanceof LiveTournamentError && e.code) {
        // The server said no (logging closed, …): nothing to resend.
        await writeDraft(key, null);
        if (isMounted.current) {
          setPending(false);
          setError(e.message);
        }
      } else if (isMounted.current) {
        // No signal: keep it and resend on reconnect.
        setPending(true);
      }
    } finally {
      sendingRef.current = false;
      if (isMounted.current) setSending(false);
    }
  }, [key, roomId, halfN, userId, isSelf, onSent]);

  // Resend a pending log as soon as the phone is back online.
  useEffect(() => {
    if (online && pending && !sendingRef.current) send(reps);
  }, [online, pending]);

  const points = halfPoints(half.movements, reps);

  return (
    <View style={{ gap: 10 }}>
      <Text style={kt('bold', 16, t.text, 1.6)}>{title}</Text>
      <Text style={kt('light', 12.5, t.textMuted, 0, 18)}>{tr('live.logHint')}</Text>
      {half.movements.map((m, i) => (
        <RepsRow
          key={`${m.name}-${i}`}
          tokens={t}
          name={m.name}
          max={m.reps}
          value={reps[i] ?? 0}
          onChange={v => setReps(r => r.map((x, j) => (j === i ? v : x)))}
        />
      ))}
      <StatusPill tokens={t} good text={formatPts(points)} style={{ alignSelf: 'center' }} />
      {pending && (
        <View style={{ borderRadius: 14, padding: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder }}>
          <Text style={[kt('regular', 13, t.textSecondary, 0, 18), { textAlign: 'center' }]}>
            {online ? tr('live.sending') : tr('live.savedOffline')}
          </Text>
        </View>
      )}
      {error ? <Text style={kt('regular', 13, t.accentText, 0, 18)}>{error}</Text> : null}
      <KitButton tokens={t} label={tr('live.sendReps')} onPress={() => send(reps)} loading={sending} disabled={sending} />
    </View>
  );
}

function LogView({ tokens: t, state, now, myId, isHost, online, onLogged }: {
  tokens: WeeklyTokens; state: LiveRoomState; now: number; myId: string | undefined; isHost: boolean;
  online: boolean; onLogged: () => void;
}) {
  const { room, challenge, players, logged, results } = state;
  const n = room.current_half;
  const half = challenge.halves[n - 1];
  const me = players.find(p => p.user_id === myId);
  const mine = results.find(r => r.half === n && r.user_id === myId);
  const [editing, setEditing] = useState(false);
  const [entryFor, setEntryFor] = useState<LivePlayer | null>(null);
  const loggedSet = new Set(logged);

  if (!half) return null;

  let main: React.ReactNode;
  if (entryFor?.user_id && !loggedSet.has(entryFor.user_id)) {
    main = (
      <LogForm
        key={`for-${entryFor.user_id}`}
        tokens={t} roomId={room.id} half={half} halfN={n} userId={entryFor.user_id} isSelf={false}
        title={tr('live.logFor', { name: playerName(entryFor) })} online={online}
        onSent={() => { setEntryFor(null); onLogged(); }}
      />
    );
  } else if (me?.side != null && myId && (!mine || editing)) {
    main = (
      <LogForm
        key="me"
        tokens={t} roomId={room.id} half={half} halfN={n} userId={myId} isSelf
        title={tr('live.logTitle')} online={online}
        onSent={() => { setEditing(false); onLogged(); }}
      />
    );
  } else if (mine) {
    main = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 16, backgroundColor: t.greenSoft, borderWidth: 1, borderColor: t.greenBorder }}>
        <Text style={[kt('semibold', 14, t.green, 1.2), { flex: 1 }]}>{tr('live.loggedPts', { pts: formatPts(Number(mine.points)) })}</Text>
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={8}
          style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: t.greenBorder, opacity: pressed ? 0.6 : 1 })}>
          <Text style={kt('bold', 11, t.green, 1.2)}>{tr('live.edit')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <BigClock tokens={t} hot={false} label={tr('live.logCloses')} value={clockText(logSecondsLeft(room, now))} />
      <View style={{ paddingTop: 20 }}>{main}</View>

      <View style={{ paddingTop: 24, gap: 8 }}>
        <Label tokens={t} size={11}>{tr('live.players')}</Label>
        {players.filter(p => p.user_id && p.side != null).map(p => {
          const done = loggedSet.has(p.user_id);
          const canLogFor = isHost && !done && p.user_id !== myId;
          return (
            <View key={p.user_id!} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12,
              borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: done ? t.greenBorder : t.cardBorder,
            }}>
              <OnlineDot tokens={t} online={p.online} />
              <Text style={[kt('medium', 14, t.text), { flex: 1 }]} numberOfLines={1}>{playerName(p)}</Text>
              <Text style={[kt('medium', 10.5, t.textFaint, 1.2), { maxWidth: 110 }]} numberOfLines={1}>{sideLabel(p.side!, state.side_names)}</Text>
              {done ? (
                <Text style={kt('bold', 10.5, t.green, 1.4)}>{tr('live.logged')}</Text>
              ) : canLogFor ? (
                <Pressable accessibilityRole="button" onPress={() => setEntryFor(p)} hitSlop={6}
                  style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: t.accent, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={kt('bold', 11, t.accentText, 1.2)}>{tr('live.logForThem')}</Text>
                </Pressable>
              ) : (
                <Text style={kt('medium', 10.5, t.textFaint, 1.4)}>{tr('live.waiting')}</Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Between halves ─────────────────────────────────────────────────────────

function RestView({ tokens: t, state, now, myId, busy, canStart, onStart }: {
  tokens: WeeklyTokens; state: LiveRoomState; now: number; myId: string | undefined; busy: boolean;
  canStart: boolean; onStart: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { room, challenge, players, results } = state;
  const n = room.current_half;
  const halfCount = challenge.halves.length;
  const me = players.find(p => p.user_id === myId);
  const visible = results.filter(r => r.half <= n);
  const standings = sideStandings(visible, room.side_count, halfCount);
  const iMissed = me?.side != null && !results.some(r => r.half === n && r.user_id === myId);
  const rest = restSecondsLeft(room, challenge.rest_sec, now);
  const closed = closedAtMs(room, now);
  const fallbackIn = closed == null ? 0 : (closed + HOST_FALLBACK_SEC * 1000 - now) / 1000;
  const isHost = room.host_id === myId;
  const next = challenge.halves[n];

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <BigClock tokens={t} hot={false} label={tr('live.coolDown')} value={clockText(rest)} />
        {iMissed && (
          <View style={{ marginTop: 14, borderRadius: 14, padding: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder }}>
            <Text style={[kt('regular', 13, t.textSecondary, 0, 18), { textAlign: 'center' }]}>{tr('live.youMissedHalf')}</Text>
          </View>
        )}
        <View style={{ paddingTop: 20, gap: 10 }}>
          <Label tokens={t} size={11}>{tr('live.standingsAfter', { n })}</Label>
          <LivePodium tokens={t} rows={standings} mySide={me?.side} names={state.side_names} />
        </View>
        {next && (
          <View style={{ paddingTop: 24, gap: 10 }}>
            <Label tokens={t} size={11} color={t.accentText}>{tr('live.nextUp', { n: n + 1 })}</Label>
            <HalfExercises tokens={t} half={next} n={n + 1} total={halfCount} />
          </View>
        )}
        <Text style={[kt('light', 12.5, t.textMuted, 0, 18), { marginTop: 16 }]}>
          {isHost ? tr('live.hostCanStart') : fallbackIn > 0
            ? tr('live.anyoneCanStartIn', { time: clockText(fallbackIn) })
            : tr('live.anyoneCanStartNow')}
        </Text>
      </ScrollView>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20 }}>
        {canStart ? (
          <KitButton tokens={t} label={tr('live.startHalf', { n: n + 1 })} icon="play" onPress={onStart} disabled={busy} loading={busy} />
        ) : (
          <KitButton tokens={t} variant="outline" label={tr('live.waitingHost')} onPress={() => {}} disabled />
        )}
      </View>
    </>
  );
}

function EndedView({ tokens: t }: { tokens: WeeklyTokens }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={kt('bold', 20, t.text, 1.6)}>{tr('live.endedTitle')}</Text>
      <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{tr('live.endedHint')}</Text>
      <KitButton tokens={t} variant="outline" label={tr('live.back')} onPress={() => router.back()} height={48} />
    </View>
  );
}
