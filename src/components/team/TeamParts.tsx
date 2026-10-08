import React from 'react';
import { Text, View } from 'react-native';
import { kt, SegmentedSwitch, YouBadge, rankColor } from '../worlds/kit';
import { WeeklyTokens } from '../weekly/weeklyTokens';
import { Label } from '../weekly/WeeklyParts';
import { formatClock, roundPoints, totalReps } from '../../lib/weeklyChallenge';
import { TeamBoardRow, TeamChallenge, TeamMember, TeamScoringType } from '../../lib/teamChallenge';
import { ltr, t as tr } from '../../i18n';

export type WeeklyMode = 'solo' | 'team';

/** "4:05.3" for team times (server times have tenths), "386 PTS" for AMRAP. */
export function formatTeamScore(type: TeamScoringType, score: number): string {
  if (type === 'reps') return tr('weekly.ptsValue', { pts: Math.round(score) });
  const tenths = Math.round(score * 10) % 10;
  return ltr(`${formatClock(Math.floor(score))}.${tenths}`);
}

/** Bare value for tight cells: "4:05.3" or "386". */
export function formatTeamScoreShort(type: TeamScoringType, score: number): string {
  return type === 'reps' ? String(Math.round(score)) : formatTeamScore(type, score);
}

export function memberName(m: TeamMember): string {
  return m.display_name || tr('team.deletedUser');
}

const FORMAT_KEYS = { sync: 'team.formatSync', switch: 'team.formatSwitch', collect: 'team.formatCollect' } as const;

/** One line telling the team how this format works and who logs the result. */
export function formatRule(c: Pick<TeamChallenge, 'format' | 'scoring_type'>): string {
  if (c.format === 'sync') return tr('team.ruleSync');
  if (c.format === 'switch') return tr('team.ruleSwitch');
  return c.scoring_type === 'reps' ? tr('team.ruleCollectAmrap') : tr('team.ruleCollectTime');
}

/** "TEAM SYNC · FOR TIME · TEAMS OF 3", for compact places like the challenge picker. */
export function formatRuleShort(c: Pick<TeamChallenge, 'format' | 'scoring_type' | 'team_size'>): string {
  return [tr(FORMAT_KEYS[c.format]), c.scoring_type === 'reps' ? 'AMRAP' : 'FOR TIME', tr('team.teamsOf', { count: c.team_size })].join(' · ');
}

/** "3D 14H" / "14H 20M" until the challenge closes. */
export function closesInLabel(endsAt: string, now = Date.now()): string {
  const totalMinutes = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  return days > 0
    ? tr('weekly.endsDaysHours', { d: days, h: hours })
    : tr('weekly.endsHoursMinutes', { h: hours, m: totalMinutes % 60 });
}

/** SOLO | TEAM switch at the top of Weekly Challenge. */
export function ModeSwitch({ tokens: t, mode, onChange }: { tokens: WeeklyTokens; mode: WeeklyMode; onChange: (m: WeeklyMode) => void }) {
  return (
    <View style={{ paddingTop: 16 }}>
      <SegmentedSwitch
        tokens={t}
        items={[
          { key: 'solo', label: tr('team.modeSolo') },
          { key: 'team', label: tr('team.modeTeam') },
        ]}
        active={mode}
        onChange={onChange}
        accessibilityLabel={tr('team.modeSwitchLabel')}
      />
    </View>
  );
}

function Chip({ tokens: t, text, filled }: { tokens: WeeklyTokens; text: string; filled?: boolean }) {
  return (
    <View style={{
      paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8,
      backgroundColor: filled ? t.accent : 'transparent', borderWidth: filled ? 0 : 1, borderColor: t.borderStrong,
    }}>
      <Text style={kt(filled ? 'bold' : 'semibold', 10.5, filled ? t.onAccent : t.textSecondary, 1.6)} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** Hero card: format, type, team size, title, how it works, description. */
export function TeamChallengeCard({ tokens: t, challenge: c, closesIn }: { tokens: WeeklyTokens; challenge: TeamChallenge; closesIn?: string }) {
  const minutes = Math.round(c.time_limit_sec / 60);
  return (
    <View style={{ marginTop: 16, borderRadius: 20, padding: 14, backgroundColor: t.liveBg, borderWidth: 1, borderColor: t.liveBorder, gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip tokens={t} text={tr(FORMAT_KEYS[c.format])} filled />
        <Chip tokens={t} text={c.scoring_type === 'reps' ? tr('team.chipAmrap', { min: minutes }) : tr('team.chipForTime', { min: minutes })} />
        <Chip tokens={t} text={tr('team.teamsOf', { count: c.team_size })} />
      </View>
      <Text style={kt('bold', 24, t.text, 1, 28)} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
        {c.title.toUpperCase()}
      </Text>
      <Text style={kt('light', 13, t.textSecondary, 0, 19)}>{formatRule(c)}</Text>
      {c.scoring_type === 'time' && (
        <Text style={kt('light', 12.5, t.textMuted, 0, 18)}>
          {tr('team.ruleCap', { cap: ltr(formatClock(c.time_limit_sec)) })}
        </Text>
      )}
      {c.description ? <Text style={kt('light', 13, t.textMuted, 0, 19)}>{c.description}</Text> : null}
      {closesIn ? (
        <View style={{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, backgroundColor: t.accentChip }}>
          <Text style={kt('bold', 10.5, t.accentText, 1.6)}>{tr('weekly.liveEndsIn', { time: closesIn })}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Movement rows; For Time shows the round count, AMRAP the points per round. */
export function TeamMovements({ tokens: t, challenge: c }: { tokens: WeeklyTokens; challenge: TeamChallenge }) {
  const amrap = c.scoring_type === 'reps';
  return (
    <View style={{ paddingTop: 24, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Label tokens={t} size={11}>{tr('weekly.movements')}</Label>
        <Text style={kt('medium', 12, t.textSecondary, 1.4)}>
          {amrap
            ? tr('weekly.metaAmrap', { pts: roundPoints(c.movements) })
            : c.rounds > 1
              ? tr('team.roundsOf', { count: c.rounds })
              : tr('weekly.metaForTime', { reps: totalReps(c.movements) })}
        </Text>
      </View>
      {c.movements.map((m, i) => (
        <View key={`${m.name}-${i}`} style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8,
          borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
        }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.buttonTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={kt('bold', 12, t.accentText)}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={kt('medium', 16, t.text, 0.4)}>{m.name}</Text>
            {amrap && <Text style={[kt('medium', 11, t.textMuted, 1.2), { marginTop: 1 }]}>{tr('weekly.ptsPerRep', { count: m.points })}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={kt('semibold', 22, t.text)}>{m.reps}</Text>
            <Text style={kt('medium', 11, t.textMuted, 1.2)}>{tr('weekly.repsUnit')}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Ranked teams (best attempt each), with member names under the team name. */
export function TeamBoard({ tokens: t, type, rows }: { tokens: WeeklyTokens; type: TeamScoringType; rows: TeamBoardRow[] }) {
  return (
    <View style={{ paddingTop: 28, gap: 10 }}>
      <Label tokens={t} size={11}>{tr('team.leaderboard')}</Label>
      {rows.length === 0 ? (
        <View style={{ borderRadius: 16, padding: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong }}>
          <Text style={[kt('light', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{tr('team.noTeamsRanked')}</Text>
        </View>
      ) : (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.boardBg, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <View key={r.team_id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8,
              borderTopWidth: i ? 1 : 0, borderTopColor: t.divider,
              backgroundColor: r.is_mine ? t.accentSoft : 'transparent',
            }}>
              <Text style={[kt('bold', 16, rankColor(t, i, false)), { width: 24 }]}>{r.rank}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[kt(r.is_mine ? 'semibold' : 'medium', 14, r.is_mine ? t.text : t.textSecondary), { flexShrink: 1 }]} numberOfLines={1}>
                    {r.team_name}
                  </Text>
                  {r.is_mine && <YouBadge tokens={t} />}
                </View>
                <Text style={[kt('regular', 11.5, t.textFaint), { marginTop: 2 }]} numberOfLines={1}>
                  {r.members.map(memberName).join(' · ')}
                </Text>
              </View>
              <Text style={kt('semibold', 15, t.text)}>{formatTeamScore(type, r.best_score)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
