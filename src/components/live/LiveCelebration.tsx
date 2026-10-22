import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { KitButton, KitIcon, kt } from '../worlds/kit';
import { WeeklyTokens } from '../weekly/weeklyTokens';
import { Label } from '../weekly/WeeklyParts';
import { StandingRow, formatPts, playerName, sideLabel } from './LiveParts';
import { clamp01, easeOutBack, easeOutCubic } from '../../lib/prCelebration';
import { LiveRoomState, bestPlayer, celebrationTimes, playerTotals, sideStandings } from '../../lib/liveTournament';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { t as tr } from '../../i18n';

// One Reanimated clock (seconds) drives every visual, like PRCelebration;
// mixing native and JS drivers has crashed live before. Haptics, sound and
// showing the table run on JS timers set to the same timeline, so skipping
// (or reduce motion) jumps everything to the end together.
const CLOCK_END = 60;

// Confetti: fixed pieces, spread across the width, falling from the top.
const CONFETTI = Array.from({ length: 42 }, (_, i) => ({
  x: (i * 37) % 100, // % of width
  delay: (i % 7) * 0.08,
  fall: 1.9 + (i % 5) * 0.25,
  sway: 10 + (i % 4) * 6,
  spin: (i % 2 ? 1 : -1) * (300 + (i % 3) * 120),
  w: i % 3 === 0 ? 10 : 7,
  h: i % 3 === 0 ? 5 : 9,
  color: i % 4,
}));

function Confetto({ clock, start, piece, colors }: {
  clock: SharedValue<number>; start: number; piece: typeof CONFETTI[number]; colors: string[];
}) {
  const style = useAnimatedStyle(() => {
    const p = clamp01((clock.value - start - piece.delay) / piece.fall);
    if (p <= 0 || p >= 1) return { opacity: 0 };
    return {
      opacity: p > 0.8 ? (1 - p) / 0.2 : 1,
      transform: [
        { translateY: -20 + p * 520 },
        { translateX: Math.sin(p * Math.PI * 3) * piece.sway },
        { rotate: `${p * piece.spin}deg` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', top: 0, left: `${piece.x}%`, width: piece.w, height: piece.h, borderRadius: 1.5,
        backgroundColor: colors[piece.color],
      }, style]}
    />
  );
}

/** Fades a block up from `start` (seconds on the clock). */
function FadeUp({ clock, start, dy = 18, children }: { clock: SharedValue<number>; start: number; dy?: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - start) / 0.45));
    return { opacity: p, transform: [{ translateY: (1 - p) * dy }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Pops in with a small overshoot. */
function Pop({ clock, start, children }: { clock: SharedValue<number>; start: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const p = clamp01((clock.value - start) / 0.55);
    return { opacity: clamp01(p * 3), transform: [{ scale: 0.6 + 0.4 * easeOutBack(p) }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * The end of a Live Tournament match: sides land from last place to first,
 * then the winner pops with confetti, then the best player. Tap to skip.
 */
export function LiveCelebration({ tokens: t, state, myId }: { tokens: WeeklyTokens; state: LiveRoomState; myId: string | undefined }) {
  const { room, challenge, players, results, side_names: names } = state;
  const halfCount = challenge.halves.length;
  const me = players.find(p => p.user_id === myId);
  const standings = useMemo(() => sideStandings(results, room.side_count, halfCount), [results, room.side_count, halfCount]);
  const best = bestPlayer(results);
  const totals = playerTotals(results);
  const bestRow = best ? players.find(p => p.user_id === best.user_id) : undefined;
  const winners = standings.filter(s => s.place === 1);
  const iWon = winners.some(w => w.side === me?.side);
  const times = useMemo(() => celebrationTimes(room.side_count), [room.side_count]);

  const clock = useSharedValue(0);
  const [settled, setSettled] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const winFired = useRef(false);

  const fireWin = () => {
    if (winFired.current) return;
    winFired.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    SoundService.playBoxingBell();
  };

  const jumpToEnd = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimation(clock);
    clock.value = times.end;
    clock.value = withTiming(CLOCK_END, { duration: (CLOCK_END - times.end) * 1000, easing: Easing.linear });
    fireWin();
    setSettled(true);
  };

  useEffect(() => {
    let alive = true;
    const play = () => {
      clock.value = withTiming(CLOCK_END, { duration: CLOCK_END * 1000, easing: Easing.linear });
      timers.current = [
        setTimeout(fireWin, times.win * 1000),
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), times.best * 1000),
        setTimeout(() => setSettled(true), times.end * 1000),
      ];
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(rm => { if (alive) (rm ? jumpToEnd() : play()); })
      .catch(() => { if (alive) play(); });
    return () => {
      alive = false;
      timers.current.forEach(clearTimeout);
      cancelAnimation(clock);
    };
  }, []);

  const confettiColors = [t.accent, t.gold, t.green, t.text];
  const winnerName = winners.length > 1
    ? winners.map(w => sideLabel(w.side, names)).join(' · ')
    : sideLabel(winners[0]?.side ?? 1, names);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48, gap: 14 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={settled ? undefined : jumpToEnd} accessibilityHint={settled ? undefined : tr('live.tapToSkip')} style={{ gap: 14 }}>
          <Text style={[kt('medium', 11, t.textMuted, 2.4), { textAlign: 'center', marginTop: 18 }]}>{tr('live.finalKicker')}</Text>

          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.boardBg, overflow: 'hidden' }}>
            {standings.map((r, i) => (
              <FadeUp key={r.side} clock={clock} start={times.rowAt(i)}>
                <StandingRow tokens={t} row={r} first={i === 0} halfCount={halfCount} mine={r.side === me?.side} names={names} />
              </FadeUp>
            ))}
          </View>

          <Pop clock={clock} start={times.win}>
            <View style={{ alignItems: 'center', gap: 4, paddingVertical: 8 }}>
              <Label tokens={t} color={iWon ? t.gold : undefined}>{winners.length > 1 ? tr('live.tie') : tr('live.winner')}</Label>
              <Text
                style={[kt('bold', 34, iWon ? t.gold : t.text, 1), { textAlign: 'center' }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {winnerName.toUpperCase()}
              </Text>
              <Text style={kt('semibold', 14, t.textSecondary, 1.2)}>{formatPts(winners[0]?.total ?? 0)}</Text>
            </View>
          </Pop>

          {best && (
            <FadeUp clock={clock} start={times.best}>
              <View style={{ borderRadius: 20, padding: 18, alignItems: 'center', gap: 6, backgroundColor: t.liveBg, borderWidth: 1, borderColor: t.liveBorder }}>
                <Pop clock={clock} start={times.best + 0.15}>
                  <KitIcon name="crown" size={26} color={t.gold} />
                </Pop>
                <Label tokens={t}>{tr('live.bestPlayer')}</Label>
                <Text style={kt('bold', 22, t.text, 1)} numberOfLines={1}>{bestRow ? playerName(bestRow) : tr('team.deletedUser')}</Text>
                <Text style={kt('semibold', 15, t.accentText, 1)} numberOfLines={1}>{`${sideLabel(best.side, names)} · ${formatPts(best.total)}`}</Text>
              </View>
            </FadeUp>
          )}
        </Pressable>

        {settled && (
          <>
            <View style={{ gap: 8, paddingTop: 6 }}>
              <Label tokens={t}>{tr('live.byPlayer')}</Label>
              {players.filter(p => p.user_id && p.side != null)
                .map(p => ({ p, total: totals.find(x => x.user_id === p.user_id)?.total ?? 0 }))
                .sort((a, b) => b.total - a.total)
                .map(({ p, total }) => {
                  const isMe = p.user_id === myId;
                  return (
                    <View key={p.user_id!} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 12,
                      backgroundColor: isMe ? t.accentSoft : t.card, borderWidth: 1, borderColor: isMe ? t.liveBorder : t.cardBorder,
                    }}>
                      <Text style={[kt(isMe ? 'semibold' : 'medium', 14, t.text), { flex: 1 }]} numberOfLines={1}>{playerName(p)}</Text>
                      <Text style={[kt('medium', 10.5, t.textFaint, 1.2), { maxWidth: 110 }]} numberOfLines={1}>{sideLabel(p.side!, names)}</Text>
                      <Text style={kt('semibold', 14, t.text)}>{formatPts(total)}</Text>
                    </View>
                  );
                })}
            </View>
            <KitButton tokens={t} label={tr('live.done')} onPress={() => router.back()} style={{ marginTop: 8 }} />
          </>
        )}
      </ScrollView>

      {/* Confetti over everything, never blocking taps. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 520, overflow: 'hidden' }}>
        {CONFETTI.map((piece, i) => (
          <Confetto key={i} clock={clock} start={times.win} piece={piece} colors={confettiColors} />
        ))}
      </View>
    </View>
  );
}
