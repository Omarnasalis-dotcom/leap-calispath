import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { kt, rankColor, YouBadge } from '../worlds/kit';
import { WeeklyTokens } from '../weekly/weeklyTokens';
import { Label } from '../weekly/WeeklyParts';
import { formatClock } from '../../lib/weeklyChallenge';
import { initials } from '../../lib/worldStanding';
import { LiveChallenge, LiveHalf, LivePlayer, SideStanding, sideLetter, sideNameOf } from '../../lib/liveTournament';
import { ltr, t as tr } from '../../i18n';

export function playerName(p: Pick<LivePlayer, 'display_name'>): string {
  return p.display_name || tr('team.deletedUser');
}

/** The team name, or "SIDE A" while it has none (the letter stays Latin in both languages). */
export const sideLabel = (side: number, names?: Record<string, string> | null) =>
  sideNameOf(names, side) ?? tr('live.side', { letter: sideLetter(side) });

/** Points: whole numbers stay whole, halves (1.5 pts per rep) keep one decimal. */
export function formatPts(points: number): string {
  const rounded = Math.round(points * 10) / 10;
  return tr('weekly.ptsValue', { pts: Number.isInteger(rounded) ? rounded : rounded.toFixed(1) });
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

/** Hero card: halves, players per side, rest, title, how it works, description. */
export function LiveChallengeCard({ tokens: t, challenge: c, closesIn }: {
  tokens: WeeklyTokens;
  challenge: Pick<LiveChallenge, 'title' | 'description' | 'halves' | 'rest_sec' | 'team_size'>;
  closesIn?: string;
}) {
  return (
    <View style={{ marginTop: 16, borderRadius: 20, padding: 14, backgroundColor: t.liveBg, borderWidth: 1, borderColor: t.liveBorder, gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip tokens={t} text={tr('live.kicker')} filled />
        <Chip tokens={t} text={tr('live.chipHalves', { count: c.halves.length })} />
        <Chip tokens={t} text={tr('live.chipPerSide', { count: c.team_size })} />
        {c.rest_sec > 0 && <Chip tokens={t} text={tr('live.chipRest', { sec: c.rest_sec })} />}
      </View>
      <Text style={kt('bold', 24, t.text, 1, 28)} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
        {c.title.toUpperCase()}
      </Text>
      <Text style={kt('light', 13, t.textSecondary, 0, 19)}>{tr('live.howItWorks')}</Text>
      {c.description ? <Text style={kt('light', 13, t.textMuted, 0, 19)}>{c.description}</Text> : null}
      {closesIn ? (
        <View style={{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, backgroundColor: t.accentChip }}>
          <Text style={kt('bold', 10.5, t.accentText, 1.6)}>{tr('weekly.liveEndsIn', { time: closesIn })}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One half's exercises: name, points per rep, max. */
export function HalfExercises({ tokens: t, half, n, total, highlight }: {
  tokens: WeeklyTokens; half: LiveHalf; n: number; total: number; highlight?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Label tokens={t} size={11} color={highlight ? t.accentText : undefined}>{tr('live.halfOf', { n, total })}</Label>
        <Text style={kt('medium', 12, t.textSecondary, 1.4)}>{ltr(formatClock(half.duration_sec))}</Text>
      </View>
      {half.movements.map((m, i) => (
        <View key={`${m.name}-${i}`} style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8,
          borderRadius: 14, backgroundColor: t.card, borderWidth: 1, borderColor: highlight ? t.liveBorder : t.border,
        }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={kt('medium', 16, t.text, 0.4)} numberOfLines={1}>{m.name}</Text>
            <Text style={[kt('medium', 11, t.textMuted, 1.2), { marginTop: 1 }]}>{tr('weekly.ptsPerRep', { count: m.points })}</Text>
          </View>
          <Text style={kt('semibold', 13, t.textSecondary, 1.2)}>{tr('live.maxReps', { reps: m.reps })}</Text>
        </View>
      ))}
    </View>
  );
}

/** Every half, the current one (if any) highlighted. */
export function HalvesList({ tokens: t, halves, current }: { tokens: WeeklyTokens; halves: LiveHalf[]; current?: number }) {
  return (
    <View style={{ paddingTop: 24, gap: 18 }}>
      {halves.map((h, i) => (
        <HalfExercises key={i} tokens={t} half={h} n={i + 1} total={halves.length} highlight={current === i + 1} />
      ))}
      <Text style={kt('light', 12.5, t.textMuted, 0, 18)}>{tr('live.anyOrder')}</Text>
    </View>
  );
}

/** Green when the phone is checking in, grey when it isn't. */
export function OnlineDot({ tokens: t, online }: { tokens: WeeklyTokens; online: boolean | undefined }) {
  return (
    <View
      accessibilityLabel={online === false ? tr('live.offline') : undefined}
      style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: online === false ? t.textFaint : t.green }}
    />
  );
}

/** Sides ranked, with points per half. */
export function SideStandings({ tokens: t, rows, halfCount, mySide, names }: {
  tokens: WeeklyTokens;
  rows: SideStanding[];
  halfCount: number;
  mySide: number | null | undefined;
  names?: Record<string, string>;
}) {
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.boardBg, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <StandingRow key={r.side} tokens={t} row={r} first={i === 0} halfCount={halfCount} mine={r.side === mySide} names={names} />
      ))}
    </View>
  );
}

export function StandingRow({ tokens: t, row: r, first, halfCount, mine, names }: {
  tokens: WeeklyTokens; row: SideStanding; first: boolean; halfCount: number; mine: boolean; names?: Record<string, string>;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8,
      borderTopWidth: first ? 0 : 1, borderTopColor: t.divider, backgroundColor: mine ? t.accentSoft : 'transparent',
    }}>
      <Text style={[kt('bold', 18, rankColor(t, r.place - 1, false)), { width: 26 }]}>{r.place}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[kt(mine ? 'bold' : 'semibold', 15, t.text, 0.6), { flexShrink: 1 }]} numberOfLines={1}>{sideLabel(r.side, names)}</Text>
          {mine && <YouBadge tokens={t} />}
        </View>
        {halfCount > 1 && (
          <Text style={[kt('regular', 11.5, t.textFaint), { marginTop: 2, writingDirection: 'ltr' }]} numberOfLines={1}>
            {r.perHalf.slice(0, halfCount).map((p, h) => `H${h + 1} ${Math.round(p * 10) / 10}`).join('  ·  ')}
          </Text>
        )}
      </View>
      <Text style={kt('semibold', 17, t.text)}>{formatPts(r.total)}</Text>
    </View>
  );
}

const BLOCK_HEIGHTS = [84, 60, 46]; // by podium spot: 1st, 2nd, 3rd

/**
 * Top 3 sides on a podium (2nd · 1st · 3rd, bottom-aligned), the same look
 * as the Weekly board; a 4th side shows as a row underneath. Tied sides
 * share a place number and colour. `wrap` lets the final celebration
 * animate each column in (index 0 = the winner).
 */
export function LivePodium({ tokens: t, rows, names, mySide, wrap }: {
  tokens: WeeklyTokens;
  rows: SideStanding[];
  names?: Record<string, string>;
  mySide: number | null | undefined;
  wrap?: (index: number, node: React.ReactNode) => React.ReactNode;
}) {
  const order = [1, 0, 2].filter(i => rows[i]);
  const rest = rows.slice(3);
  const placeColor = (place: number) => [t.gold, t.silver, t.bronze][Math.min(place, 3) - 1];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6 }}>
        {order.map(i => {
          const r = rows[i];
          const mine = r.side === mySide;
          const first = i === 0;
          const color = placeColor(r.place);
          const av = first ? 56 : 44;
          const name = sideLabel(r.side, names);
          const column = (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ width: av, height: av, borderRadius: av / 2, backgroundColor: t.tile, borderWidth: 2, borderColor: mine ? t.accent : color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={kt('semibold', first ? 18 : 15, t.text)}>{initials(name)}</Text>
              </View>
              <View style={{ alignItems: 'center', gap: 1, maxWidth: '100%' }}>
                <Text style={kt(mine ? 'semibold' : 'regular', 12, mine ? t.accentText : t.textDim)} numberOfLines={1}>{name}</Text>
                <Text style={kt('semibold', 16, t.text)} numberOfLines={1}>{formatPts(r.total)}</Text>
                {mine && <YouBadge tokens={t} />}
              </View>
              <View style={{
                width: '100%', height: BLOCK_HEIGHTS[i], borderTopLeftRadius: 12, borderTopRightRadius: 12,
                borderTopWidth: 2, borderTopColor: color, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
              }}>
                <LinearGradient colors={first ? t.podiumFirst : t.podiumOther} style={StyleSheet.absoluteFillObject} />
                <Text style={kt('bold', first ? 26 : 20, color, 0, first ? 28 : 22)}>{r.place}</Text>
              </View>
            </View>
          );
          return (
            <View key={r.side} style={{ flex: 1, minWidth: 0 }}>
              {wrap ? wrap(i, column) : column}
            </View>
          );
        })}
      </View>
      {rest.length > 0 && (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.boardBg, overflow: 'hidden' }}>
          {rest.map((r, k) => {
            const row = <StandingRow tokens={t} row={r} first={k === 0} halfCount={1} mine={r.side === mySide} names={names} />;
            return <React.Fragment key={r.side}>{wrap ? wrap(3 + k, row) : row}</React.Fragment>;
          })}
        </View>
      )}
    </View>
  );
}

