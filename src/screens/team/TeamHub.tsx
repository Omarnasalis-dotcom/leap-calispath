import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { KitButton, KitIcon, WorldSheet, kt } from '../../components/worlds/kit';
import { WeeklyTokens } from '../../components/weekly/weeklyTokens';
import { Label, WeeklyHeader } from '../../components/weekly/WeeklyParts';
import {
  TeamBoard, TeamChallengeCard, TeamMovements, closesInLabel, formatRuleShort, formatTeamScore, memberName,
} from '../../components/team/TeamParts';
import { LeapLogo } from '../../components/LeapLogo';
import { TeamChallengeService } from '../../services/TeamChallengeService';
import { MyTeamRow, TEAM_NAME_MAX, TeamBoardRow, TeamChallenge } from '../../lib/teamChallenge';
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

const openLobby = (teamId: string) => router.push({ pathname: '/team-lobby', params: { teamId } });

/** Weekly Challenge → TEAM: the open team challenges (a picker when there's more than one), your teams, the board, create / join. */
export function TeamHub({ tokens: t, onBack, modeSlot }: Props) {
  const isMounted = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<TeamChallenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allMine, setAllMine] = useState<MyTeamRow[]>([]);
  const [boards, setBoards] = useState<Record<string, TeamBoardRow[]>>({});

  const [sheet, setSheet] = useState<Sheet>(null);
  const [input, setInput] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [open, mine] = await Promise.all([
        TeamChallengeService.getOpenChallenges(),
        TeamChallengeService.getMyTeams(),
      ]);
      // Several challenges can run at once (owner decision); each has its own board.
      const rows = await Promise.all(open.map(c => TeamChallengeService.getBoard(c.id)));
      if (!isMounted.current) return;
      setChallenges(open);
      setAllMine(mine);
      setBoards(Object.fromEntries(open.map((c, i) => [c.id, rows[i]])));
      setLoadError(null);
    } catch (e: any) {
      if (isMounted.current) setLoadError(e?.message ?? tr('team.loadFailed'));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  // Also refreshes when coming back from a lobby.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Once per visit to the tab, not on every return from a lobby.
  useEffect(() => { track('team_tab_opened'); }, []);

  const challenge = challenges.find(c => c.id === selectedId) ?? challenges[0] ?? null;
  const board = challenge ? boards[challenge.id] ?? [] : [];
  const myTeams = challenge ? allMine.filter(m => m.challenge_id === challenge.id) : [];
  // Newest first (get_my_teams order): teams from challenges that have ended.
  const openIds = new Set(challenges.map(c => c.id));
  const pastTeams = allMine.filter(m => !openIds.has(m.challenge_id) && Date.parse(m.ends_at) <= Date.now());

  const openSheet = (s: Sheet) => {
    setInput('');
    setSheetError(null);
    setSheet(s);
  };

  const submitSheet = async () => {
    if (!challenge || busy) return;
    const value = input.trim();
    if (!value) return;
    setBusy(true);
    setSheetError(null);
    try {
      let teamId: string;
      if (sheet === 'create') {
        teamId = (await TeamChallengeService.createTeam(challenge.id, value)).teamId;
        track('team_created', { format: challenge.format, team_size: challenge.team_size });
      } else {
        teamId = await TeamChallengeService.joinTeam(value);
        track('team_joined', { format: challenge.format, team_size: challenge.team_size });
      }
      if (!isMounted.current) return;
      setSheet(null);
      openLobby(teamId);
    } catch (e: any) {
      if (isMounted.current) setSheetError(e?.message ?? tr('team.loadFailed'));
    } finally {
      if (isMounted.current) setBusy(false);
    }
  };

  const type = challenge?.scoring_type ?? 'reps';

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <WeeklyHeader tokens={t} onBack={onBack} />
        {modeSlot}

        {loading && !challenge ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}><LeapLogo size={40} animated /></View>
        ) : loadError && !challenge ? (
          <View style={{ marginTop: 18, alignItems: 'center', gap: 14 }}>
            <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{loadError}</Text>
            <KitButton tokens={t} variant="outline" label={tr('team.retry')} onPress={() => { setLoading(true); load(); }} height={48} />
          </View>
        ) : !challenge ? (
          <View style={{ marginTop: 18, borderRadius: 26, padding: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, alignItems: 'center', gap: 8 }}>
            <Text style={[kt('semibold', 17, t.text, 1.6), { textAlign: 'center' }]}>{tr('team.noChallenge')}</Text>
            <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{tr('team.checkBack')}</Text>
          </View>
        ) : (
          <>
            {challenges.length > 1 && (
              <ChallengePicker tokens={t} challenges={challenges} activeId={challenge.id} onSelect={setSelectedId} />
            )}
            <TeamChallengeCard tokens={t} challenge={challenge} closesIn={closesInLabel(challenge.ends_at)} />

            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 16 }}>
              <KitButton tokens={t} label={tr('team.createTeam')} icon="plus" onPress={() => openSheet('create')} height={52} fontSize={14} style={{ flex: 1 }} />
              <KitButton tokens={t} variant="outline" label={tr('team.joinWithCode')} onPress={() => openSheet('join')} height={52} fontSize={14} style={{ flex: 1 }} />
            </View>

            {myTeams.length > 0 && (
              <View style={{ paddingTop: 24, gap: 10 }}>
                <Label tokens={t} size={11}>{tr('team.yourTeams')}</Label>
                {myTeams.map(team => (
                  <Pressable
                    key={team.team_id}
                    accessibilityRole="button"
                    onPress={() => openLobby(team.team_id)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
                      backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={kt('semibold', 16, t.text, 0.4)} numberOfLines={1}>{team.team_name}</Text>
                      <Text style={kt('regular', 12, t.textMuted)} numberOfLines={1}>
                        {team.members.map(memberName).join(' · ')}
                      </Text>
                      <Text style={kt('medium', 10.5, t.textFaint, 1.4)}>
                        {tr('team.playersCount', { n: team.members.filter(m => m.user_id).length, size: team.team_size })}
                        {team.is_leader ? `  ·  ${tr('team.leader')}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      {team.best_score != null ? (
                        <>
                          <Text style={kt('semibold', 16, t.text)}>{formatTeamScore(type, team.best_score)}</Text>
                          {team.rank != null && <Text style={kt('medium', 11, t.accentText, 1.2)}>{ltr(`#${team.rank}`)}</Text>}
                        </>
                      ) : (
                        <Text style={kt('medium', 10.5, t.textFaint, 1.4)}>{tr('team.noScoreYet')}</Text>
                      )}
                    </View>
                    <KitIcon name="forward" size={14} color={t.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}

            <TeamMovements tokens={t} challenge={challenge} />
            <TeamBoard tokens={t} type={type} rows={board} />
          </>
        )}

        {!loading && pastTeams.length > 0 && <TeamHistory tokens={t} teams={pastTeams} />}
      </ScrollView>

      <WorldSheet
        tokens={t}
        visible={sheet != null}
        onClose={() => { if (!busy) setSheet(null); }}
        variant="log"
        title={sheet === 'join' ? tr('team.joinTitle') : tr('team.createTitle')}
      >
        <View style={{ gap: 14, paddingBottom: 8 }}>
          <Text style={kt('light', 14, t.textSecondary, 0, 20)}>
            {sheet === 'join' ? tr('team.joinHint') : tr('team.createHint')}
          </Text>
          <TextInput
            value={input}
            onChangeText={v => { setInput(v); setSheetError(null); }}
            placeholder={sheet === 'join' ? tr('team.codePlaceholder') : tr('team.namePlaceholder')}
            placeholderTextColor={t.textFaint}
            autoFocus
            autoCorrect={false}
            autoCapitalize={sheet === 'join' ? 'characters' : 'words'}
            maxLength={sheet === 'join' ? 8 : TEAM_NAME_MAX}
            returnKeyType="done"
            onSubmitEditing={submitSheet}
            accessibilityLabel={sheet === 'join' ? tr('team.codePlaceholder') : tr('team.namePlaceholder')}
            style={[
              {
                height: 56, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1,
                borderColor: sheetError ? t.accent : t.tintBorder, backgroundColor: t.inputBg, color: t.text,
              },
              sheet === 'join'
                ? { fontFamily: WORLD_FONTS.bold, fontSize: 24, letterSpacing: 6, textAlign: 'center', writingDirection: 'ltr' }
                // kt() swaps in the Arabic face; team names can be Arabic.
                : kt('medium', 17, t.text),
            ]}
          />
          {sheetError ? <Text style={kt('regular', 13, t.accentText, 0, 18)}>{sheetError}</Text> : null}
          <KitButton
            tokens={t}
            label={sheet === 'join' ? tr('team.join') : tr('team.create')}
            onPress={submitSheet}
            loading={busy}
            disabled={busy || input.trim() === ''}
          />
        </View>
      </WorldSheet>
    </View>
  );
}

/** Teams from challenges that have ended: final result and rank, tap for the team page. */
function TeamHistory({ tokens: t, teams }: { tokens: WeeklyTokens; teams: MyTeamRow[] }) {
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
  return (
    <View style={{ paddingTop: 28, gap: 10 }}>
      <Label tokens={t} size={11}>{tr('team.history')}</Label>
      {teams.map(team => (
        <Pressable
          key={team.team_id}
          accessibilityRole="button"
          onPress={() => openLobby(team.team_id)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
            backgroundColor: t.card, borderWidth: 1, borderColor: t.border, opacity: pressed ? 0.75 : 1,
          })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={kt('medium', 10.5, t.textFaint, 1.4)} numberOfLines={1}>
              {`${ltr(`${date(team.starts_at)} – ${date(team.ends_at)}`)} · ${team.challenge_title.toUpperCase()}`}
            </Text>
            <Text style={kt('semibold', 15, t.text, 0.4)} numberOfLines={1}>{team.team_name}</Text>
            <Text style={kt('regular', 12, t.textMuted)} numberOfLines={1}>{team.members.map(memberName).join(' · ')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            {team.best_score != null ? (
              <>
                <Text style={kt('semibold', 15, t.text)}>{formatTeamScore(team.scoring_type, team.best_score)}</Text>
                {team.rank != null && (
                  <Text style={kt('medium', 11, team.rank === 1 ? t.gold : t.accentText, 1.2)}>{tr('team.finalRank', { rank: team.rank })}</Text>
                )}
              </>
            ) : (
              <Text style={kt('medium', 10.5, t.textFaint, 1.4)}>{tr('team.notRanked')}</Text>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** One chip per open challenge when several run at once. */
function ChallengePicker({ tokens: t, challenges, activeId, onSelect }: {
  tokens: WeeklyTokens; challenges: TeamChallenge[]; activeId: string; onSelect: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 16 }}>
      {challenges.map(c => {
        const on = c.id === activeId;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(c.id)}
            style={({ pressed }) => ({
              maxWidth: 220, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
              backgroundColor: on ? t.accent : t.control, borderWidth: 1, borderColor: on ? t.accent : t.cardBorder,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={kt('bold', 12, on ? t.onAccent : t.text, 1)} numberOfLines={1}>{c.title.toUpperCase()}</Text>
            <Text style={kt('medium', 10, on ? t.onAccent : t.textMuted, 1.2)} numberOfLines={1}>{formatRuleShort(c)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
