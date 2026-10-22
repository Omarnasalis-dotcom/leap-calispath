import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { KitButton, KitIcon, SegmentedSwitch, WorldSheet, kt } from '../../components/worlds/kit';
import { WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, WeeklyHeader } from '../../components/weekly/WeeklyParts';
import { closesInLabel } from '../../components/team/TeamParts';
import { HalvesList, LiveChallengeCard, PodiumBoard, PodiumItem, formatPts, sideLabel } from '../../components/live/LiveParts';
import { LeapLogo } from '../../components/LeapLogo';
import { LiveTournamentError, LiveTournamentService } from '../../services/LiveTournamentService';
import {
  LiveChallenge, LiveHistoryRow, LivePlayerBoardRow, LiveTeamBoardRow, MAX_SIDES, MIN_SIDES, ROOM_CODE_LENGTH,
} from '../../lib/liveTournament';
import { track } from '../../lib/analytics';
import { useMountedRef } from '../../hooks/useMountedRef';
import { isArabic, ltr, t as tr } from '../../i18n';
import { WORLD_FONTS } from '../../../constants/worldKitTokens';

interface Props {
  tokens: WeeklyTokens;
  onBack: () => void;
  modeSlot: React.ReactNode;
}

type Sheet = 'create' | 'join' | null;

export const openLiveRoom = (roomId: string) => router.push({ pathname: '/live-room', params: { roomId } });

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric' }).toUpperCase();

/** Weekly Challenge → LIVE: this week's live challenges, your unfinished room, create / join, history. */
export function LiveHub({ tokens: t, onBack, modeSlot }: Props) {
  const isMounted = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<LiveChallenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [myRoomId, setMyRoomId] = useState<string | null>(null);
  const [history, setHistory] = useState<LiveHistoryRow[]>([]);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [code, setCode] = useState('');
  const [sides, setSides] = useState(2);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [open, room, past] = await Promise.all([
        LiveTournamentService.getOpenChallenges(),
        LiveTournamentService.getMyRoom(),
        LiveTournamentService.getHistory(),
      ]);
      if (!isMounted.current) return;
      setChallenges(open);
      setMyRoomId(room);
      setHistory(past);
      setLoadError(null);
    } catch (e: any) {
      if (isMounted.current) setLoadError(e?.message ?? tr('live.loadFailed'));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  // Also refreshes when coming back from a room.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { track('live_tab_opened'); }, []);

  const challenge = challenges.find(c => c.id === selectedId) ?? challenges[0] ?? null;

  const openSheet = (s: Sheet) => {
    setCode('');
    setSides(2);
    setSheetError(null);
    setSheet(s);
  };

  const submitSheet = async () => {
    if (busy) return;
    if (sheet === 'join' && code.trim() === '') return;
    if (sheet === 'create' && !challenge) return;
    setBusy(true);
    setSheetError(null);
    try {
      let roomId: string;
      if (sheet === 'create') {
        roomId = (await LiveTournamentService.createRoom(challenge!.id, sides)).roomId;
        track('live_room_created', { sides, halves: challenge!.halves.length, team_size: challenge!.team_size });
      } else {
        roomId = await LiveTournamentService.joinRoom(code);
        track('live_room_joined');
      }
      if (!isMounted.current) return;
      setSheet(null);
      openLiveRoom(roomId);
    } catch (e: any) {
      // Already in an unfinished room (maybe the one a retried create just
      // made): open it rather than showing an error.
      if (e instanceof LiveTournamentError && e.code === 'ALREADY_IN_ROOM') {
        const existing = await LiveTournamentService.getMyRoom().catch(() => null);
        if (existing && isMounted.current) {
          setSheet(null);
          openLiveRoom(existing);
          return;
        }
      }
      if (isMounted.current) setSheetError(e?.message ?? tr('live.loadFailed'));
    } finally {
      if (isMounted.current) setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <WeeklyHeader tokens={t} onBack={onBack} />
        {modeSlot}

        {myRoomId && (
          <Pressable
            accessibilityRole="button"
            onPress={() => openLiveRoom(myRoomId)}
            style={({ pressed }) => ({
              marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
              backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.liveBorder, opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={kt('bold', 13, t.accentText, 1.6)}>{tr('live.yourRoom')}</Text>
              <Text style={kt('light', 13, t.textSecondary, 0, 18)}>{tr('live.yourRoomHint')}</Text>
            </View>
            <Text style={kt('bold', 12, t.text, 1.4)}>{tr('live.openRoom')}</Text>
            <KitIcon name="forward" size={14} color={t.textMuted} />
          </Pressable>
        )}

        {loading && !challenge ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}><LeapLogo size={40} animated /></View>
        ) : loadError && !challenge ? (
          <View style={{ marginTop: 18, alignItems: 'center', gap: 14 }}>
            <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{loadError}</Text>
            <KitButton tokens={t} variant="outline" label={tr('live.retry')} onPress={() => { setLoading(true); load(); }} height={48} />
          </View>
        ) : !challenge ? (
          <View style={{ marginTop: 18, borderRadius: 26, padding: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, alignItems: 'center', gap: 8 }}>
            <Text style={[kt('semibold', 17, t.text, 1.6), { textAlign: 'center' }]}>{tr('live.noChallenge')}</Text>
            <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{tr('live.checkBack')}</Text>
          </View>
        ) : (
          <>
            {challenges.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 16 }}>
                {challenges.map(c => {
                  const on = c.id === challenge.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setSelectedId(c.id)}
                      style={({ pressed }) => ({
                        maxWidth: 220, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
                        backgroundColor: on ? t.accent : t.control, borderWidth: 1, borderColor: on ? t.accent : t.cardBorder,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text style={kt('bold', 12, on ? t.onAccent : t.text, 1)} numberOfLines={1}>{c.title.toUpperCase()}</Text>
                      <Text style={kt('medium', 10, on ? t.onAccent : t.textMuted, 1.2)} numberOfLines={1}>
                        {`${tr('live.chipHalves', { count: c.halves.length })} · ${tr('live.chipPerSide', { count: c.team_size })}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <LiveChallengeCard tokens={t} challenge={challenge} closesIn={closesInLabel(challenge.ends_at)} />

            {!myRoomId && (
              <View style={{ flexDirection: 'row', gap: 10, paddingTop: 16 }}>
                <KitButton tokens={t} label={tr('live.createRoom')} icon="plus" onPress={() => openSheet('create')} height={52} fontSize={14} style={{ flex: 1 }} />
                <KitButton tokens={t} variant="outline" label={tr('live.joinRoom')} onPress={() => openSheet('join')} height={52} fontSize={14} style={{ flex: 1 }} />
              </View>
            )}

            <HalvesList tokens={t} halves={challenge.halves} />
            <LiveBoards tokens={t} challengeId={challenge.id} />
          </>
        )}

        {!loading && history.length > 0 && (
          <View style={{ paddingTop: 28, gap: 10 }}>
            <Label tokens={t} size={11}>{tr('live.history')}</Label>
            {history.map(h => (
              <View key={h.room_id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
                backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
              }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={kt('medium', 10.5, t.textFaint, 1.4)} numberOfLines={1}>
                    {`${ltr(shortDate(h.finished_at))} · ${h.challenge_title.toUpperCase()}`}
                  </Text>
                  <Text style={kt('semibold', 15, t.text, 0.4)} numberOfLines={1}>{h.my_side_name ?? sideLabel(h.my_side)}</Text>
                  {h.is_best_player && <Text style={kt('bold', 10.5, t.gold, 1.4)}>{tr('live.bestPlayerTag')}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={kt('semibold', 15, t.text)}>{formatPts(h.my_points)}</Text>
                  <Text style={kt('medium', 11, h.side_place === 1 ? t.gold : t.accentText, 1.2)}>
                    {tr('live.placeOf', { place: h.side_place, count: h.side_count })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <WorldSheet
        tokens={t}
        visible={sheet != null}
        onClose={() => { if (!busy) setSheet(null); }}
        variant="log"
        title={sheet === 'join' ? tr('live.joinTitle') : tr('live.createTitle')}
      >
        <View style={{ gap: 14, paddingBottom: 8, paddingHorizontal: 24 }}>
          <Text style={kt('light', 14, t.textSecondary, 0, 20)}>
            {sheet === 'join' ? tr('live.joinHint') : tr('live.createHint')}
          </Text>
          {sheet === 'join' ? (
            <TextInput
              value={code}
              onChangeText={v => { setCode(v); setSheetError(null); }}
              placeholder={tr('live.codePlaceholder')}
              placeholderTextColor={t.textFaint}
              autoFocus
              autoCorrect={false}
              autoCapitalize="characters"
              maxLength={ROOM_CODE_LENGTH + 2}
              returnKeyType="done"
              onSubmitEditing={submitSheet}
              accessibilityLabel={tr('live.codePlaceholder')}
              style={{
                height: 56, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1,
                borderColor: sheetError ? t.accent : t.tintBorder, backgroundColor: t.inputBg, color: t.text,
                fontFamily: WORLD_FONTS.bold, fontSize: 24, letterSpacing: 6, textAlign: 'center', writingDirection: 'ltr',
              }}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Array.from({ length: MAX_SIDES - MIN_SIDES + 1 }, (_, i) => MIN_SIDES + i).map(n => {
                const on = n === sides;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setSides(n)}
                    style={({ pressed }) => ({
                      flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? t.accent : t.control, borderWidth: 1, borderColor: on ? t.accent : t.cardBorder,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Text style={kt('bold', 13, on ? t.onAccent : t.text, 1.2)}>{tr('live.sidesOption', { count: n })}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {sheetError ? <Text style={kt('regular', 13, t.accentText, 0, 18)}>{sheetError}</Text> : null}
          <KitButton
            tokens={t}
            label={sheet === 'join' ? tr('live.join') : tr('live.create')}
            onPress={submitSheet}
            loading={busy}
            disabled={busy || (sheet === 'join' && code.trim() === '')}
          />
        </View>
      </WorldSheet>
    </View>
  );
}

type BoardKind = 'players' | 'teams';

/** The challenge's public leaderboards: every finished room that played all halves. */
function LiveBoards({ tokens: t, challengeId }: { tokens: WeeklyTokens; challengeId: string }) {
  const isMounted = useMountedRef();
  const [kind, setKind] = useState<BoardKind>('players');
  const [players, setPlayers] = useState<LivePlayerBoardRow[] | null>(null);
  const [teams, setTeams] = useState<LiveTeamBoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, tm] = await Promise.all([
        LiveTournamentService.getPlayerBoard(challengeId),
        LiveTournamentService.getTeamBoard(challengeId),
      ]);
      if (!isMounted.current) return;
      setPlayers(p);
      setTeams(tm);
      setError(null);
    } catch (e: any) {
      if (isMounted.current) setError(e?.message ?? tr('live.loadFailed'));
    }
  }, [challengeId]);

  // Refreshes on focus too (coming back from a finished room).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items: PodiumItem[] | null = kind === 'players'
    ? players && players.map(r => ({
        key: r.user_id,
        place: r.rank,
        name: r.display_name || tr('team.deletedUser'),
        score: formatPts(r.points),
        mine: r.is_mine,
        sub: r.team_name ?? undefined,
      }))
    : teams && teams.map(r => ({
        key: `${r.room_id}-${r.side}`,
        place: r.rank,
        name: r.team_name || sideLabel(r.side),
        score: formatPts(r.points_per_player),
        mine: r.is_mine,
        sub: r.members.map(m => m.display_name || tr('team.deletedUser')).join(' · '),
      }));

  return (
    <View style={{ paddingTop: 28, gap: 12 }}>
      <Label tokens={t} size={11}>{tr('live.leaderboard')}</Label>
      <SegmentedSwitch
        tokens={t}
        items={[
          { key: 'players', label: tr('live.boardPlayers') },
          { key: 'teams', label: tr('live.boardTeams') },
        ]}
        active={kind}
        onChange={setKind}
        accessibilityLabel={tr('live.leaderboard')}
      />
      {kind === 'teams' && <Text style={kt('light', 12.5, t.textMuted, 0, 18)}>{tr('live.teamBoardHint')}</Text>}
      {error && !items ? (
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={[kt('light', 13, t.textMuted, 0, 18), { textAlign: 'center' }]}>{error}</Text>
          <KitButton tokens={t} variant="outline" label={tr('live.retry')} onPress={load} height={44} />
        </View>
      ) : !items ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}><LeapLogo size={28} animated /></View>
      ) : items.length === 0 ? (
        <View style={{ borderRadius: 16, padding: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong }}>
          <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{tr('live.boardEmpty')}</Text>
        </View>
      ) : (
        <PodiumBoard tokens={t} items={items} />
      )}
    </View>
  );
}

