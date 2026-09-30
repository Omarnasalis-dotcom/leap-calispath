import React from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BoardFilters, Gender, kt, rankColor, Scope, YouBadge } from '../worlds/kit';
import { initials } from '../../lib/worldStanding';
import { getCountryCode } from '../../constants/countries';
import { gapToLeader, ScoringType } from '../../lib/weeklyChallenge';
import { WeeklyBoardRow } from '../../services/ChallengeService';
import { WeeklyTokens } from './weeklyTokens';
import { formatGap, formatScore } from './WeeklyParts';
import { t as tr } from '../../i18n';

const BLOCK_HEIGHTS = [84, 60, 46]; // by place: 1st, 2nd, 3rd

function Podium({ tokens: t, type, rows, myId }: { tokens: WeeklyTokens; type: ScoringType; rows: WeeklyBoardRow[]; myId?: string }) {
  // Visual order 2nd · 1st · 3rd, bottom-aligned.
  const order = [1, 0, 2].filter(i => rows[i]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6 }}>
      {order.map(i => {
        const r = rows[i];
        const you = r.user_id === myId;
        const first = i === 0;
        const place = [t.gold, t.silver, t.bronze][i];
        const av = first ? 56 : 44;
        return (
          <View key={r.user_id} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
            <View style={{ width: av, height: av, borderRadius: av / 2, backgroundColor: t.tile, borderWidth: 2, borderColor: you ? t.accent : place, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={kt('semibold', first ? 18 : 15, t.text)}>{initials(r.name)}</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 1, maxWidth: '100%' }}>
              <Text style={kt(you ? 'semibold' : 'regular', 12, you ? t.accentText : t.textDim)} numberOfLines={1}>
                {you ? tr('weekly.you') : r.name}
              </Text>
              <Text style={kt('semibold', 16, t.text)} numberOfLines={1}>{formatScore(type, r.score)}</Text>
            </View>
            <View style={{
              width: '100%', height: BLOCK_HEIGHTS[i], borderTopLeftRadius: 12, borderTopRightRadius: 12,
              borderTopWidth: 2, borderTopColor: place, overflow: 'hidden',
              alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
              <LinearGradient colors={first ? t.podiumFirst : t.podiumOther} style={StyleSheet.absoluteFillObject} />
              <Text style={kt('bold', first ? 26 : 20, place, 0, first ? 28 : 22)}>{i + 1}</Text>
              <Text style={kt('semibold', 10, t.textFaint, 1)}>{getCountryCode(r.country) || ' '}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FullList({ tokens: t, type, rows, myId }: { tokens: WeeklyTokens; type: ScoringType; rows: WeeklyBoardRow[]; myId?: string }) {
  const leader = rows[0]?.score ?? 0;
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.boardBg, overflow: 'hidden' }}>
      {rows.map((r, i) => {
        const you = r.user_id === myId;
        return (
          <View key={r.user_id} style={{
            flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 16,
            borderTopWidth: i ? 1 : 0, borderTopColor: t.divider,
            backgroundColor: you ? t.accentSoft : 'transparent',
          }}>
            <Text style={[kt('bold', 16, rankColor(t, i, false)), { width: 22 }]}>{i + 1}</Text>
            <View style={{ width: 26, height: 18, borderRadius: 4, backgroundColor: t.button, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={kt('semibold', 10, t.textDim)}>{getCountryCode(r.country) || '—'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[kt(you ? 'medium' : 'regular', 14, you ? t.text : t.textSecondary), { flexShrink: 1 }]} numberOfLines={1}>{r.name}</Text>
              {you && <YouBadge tokens={t} />}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={kt('semibold', 15, t.text)}>{formatScore(type, r.score)}</Text>
              <Text style={kt('medium', 10.5, t.textFaint)}>
                {i === 0 ? tr('weekly.leader') : formatGap(type, gapToLeader(type, leader, r.score))}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface Props {
  tokens: WeeklyTokens;
  type: ScoringType;
  live: boolean;
  /** Sorted and already filtered. */
  rows: WeeklyBoardRow[];
  myId?: string;
  myName: string;
  showAll: boolean;
  onToggleAll: () => void;
  inCommunity: boolean;
  scope: Scope;
  onScope: (s: Scope) => void;
  gender: Gender;
  onGender: (g: Gender) => void;
}

/** LEADERBOARD / FINAL STANDINGS section of the Challenge screen. */
export function WeeklyBoard({
  tokens: t, type, live, rows, myId, myName, showAll, onToggleAll,
  inCommunity, scope, onScope, gender, onGender,
}: Props) {
  const myIndex = myId ? rows.findIndex(r => r.user_id === myId) : -1;
  const me = myIndex >= 0 ? rows[myIndex] : null;
  const leader = rows[0]?.score ?? 0;

  return (
    <View style={{ paddingTop: 32, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={kt('semibold', 19, t.text, 2)}>{live ? tr('weekly.leaderboard') : tr('weekly.finalStandings')}</Text>
        <Text style={kt('medium', 12, t.textMuted, 1.4)}>{tr('weekly.warriorsCount', { count: rows.length })}</Text>
      </View>

      <BoardFilters tokens={t} inCommunity={inCommunity} scope={scope} onScope={onScope} gender={gender} onGender={onGender} />

      {rows.length === 0 ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, paddingVertical: 28, paddingHorizontal: 20 }}>
          <Text style={[kt('regular', 13, t.textMuted), { textAlign: 'center' }]}>
            {scope === 'community' || gender !== 'ALL' ? tr('weekly.notInFilter') : tr('weekly.beFirst')}
          </Text>
        </View>
      ) : (
        <>
          <Podium tokens={t} type={type} rows={rows} myId={myId} />

          {me && myIndex >= 3 && !showAll && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, paddingHorizontal: 16, borderRadius: 16,
              backgroundColor: t.accentSoft, borderWidth: 1, borderColor: 'rgba(252,84,84,0.4)',
            }}>
              <Text style={[kt('bold', 18, t.accentText), { minWidth: 34 }]} numberOfLines={1}>{`#${myIndex + 1}`}</Text>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[kt('medium', 14, t.text), { flexShrink: 1 }]} numberOfLines={1}>{myName}</Text>
                <YouBadge tokens={t} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={kt('semibold', 16, t.text)}>{formatScore(type, me.score)}</Text>
                <Text style={kt('medium', 11, t.textMuted)}>
                  {tr('weekly.toFirst', { gap: formatGap(type, gapToLeader(type, leader, me.score)) })}
                </Text>
              </View>
            </View>
          )}

          {showAll && <FullList tokens={t} type={type} rows={rows} myId={myId} />}

          {rows.length > 3 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.create(300, 'easeInEaseOut', 'opacity'));
                onToggleAll();
              }}
              style={({ pressed }) => ({
                height: 48, borderRadius: 14, backgroundColor: t.control, borderWidth: 1, borderColor: t.cardBorder,
                alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={kt('semibold', 13, t.textSecondary, 2)}>
                {showAll ? tr('weekly.showLess') : tr('weekly.seeAll', { count: rows.length })}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
