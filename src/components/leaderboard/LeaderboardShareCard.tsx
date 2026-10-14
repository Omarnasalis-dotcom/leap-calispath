import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';
import { countPassed } from '../../lib/fx/easing';
import { useTheme } from '../../contexts/ThemeContext';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { shareCardImage } from '../../lib/shareCard';
import { track } from '../../lib/analytics';
import { KitIcon, kt } from '../worlds/kit';
import { LeapLogo } from '../LeapLogo';
import { clamp01, easeOutBack, easeOutCubic } from '../../lib/prCelebration';
import {
  buildShareBoard, formatShareGap, formatShareScore, LB_AFTER, LB_COUNTDOWN_END, LB_END, LB_LOCK, PLACE_RISE, placeLand,
  podiumScoreSize, RISE_DUR, rankAt, scoreProgress, SharePlace, ShareRow, ShareScoreType, shareTitleSize, ShareVariant, usernameInitials,
} from '../../lib/leaderboardShare';
import { getLBTokens, LBTokens, MEDAL_GOLD, rgba, WR_COLORS } from './leaderboardShareTokens';
import { isArabic, ltr, t as tr } from '../../i18n';

export interface LeaderboardShareCardProps {
  visible: boolean;
  onClose: () => void;
  variant: ShareVariant;
  title: string;
  subLine: string;
  /** Weekly only: false → "FINAL STANDINGS", no live dot. */
  live?: boolean;
  communityScoped: boolean;
  scoreType: ShareScoreType;
  /** The board as it's on screen: sorted and filtered. */
  rows: ShareRow[];
  myId?: string;
  myName: string;
}

/** Clock runs far past the end so the ambient motes keep drifting. */
const CLOCK_END = 900;
const MOTE_LOOP = 640;
/** Index = place (0 = 1st). */
const GEO = [{ av: 60, h: 84, num: 30 }, { av: 48, h: 60, num: 22 }, { av: 48, h: 46, num: 20 }];
const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  a: -Math.PI + (i / 17) * Math.PI + (((i * 37) % 10) - 5) / 40 + (i % 6 === 5 ? Math.PI * 0.9 : 0),
  dist: 36 + ((i * 29) % 36),
  s: 4 + (i % 3),
  d: (i % 5) * 0.03,
  white: i % 3 === 0,
}));
const NOT_RANKED_LINE: Record<ShareVariant, string> = {
  strength: 'leaderboardShare.notRankedStrength',
  weekly: 'leaderboardShare.notRankedWeekly',
  wellRounded: 'leaderboardShare.notRankedWellRounded',
  static: 'leaderboardShare.notRankedWorld',
  power: 'leaderboardShare.notRankedWorld',
  endurance: 'leaderboardShare.notRankedWorld',
  journey: 'leaderboardShare.notRankedJourney',
};
const BOARD_LABEL: Record<ShareVariant, string> = {
  strength: 'leaderboardShare.strength',
  weekly: 'leaderboardShare.weekly',
  wellRounded: 'leaderboardShare.wellRounded',
  static: 'leaderboardShare.worlds',
  power: 'leaderboardShare.worlds',
  endurance: 'leaderboardShare.worlds',
  journey: 'leaderboardShare.journey',
};
const WORLD_ICON: Partial<Record<ShareVariant, 'snowflake' | 'bolt' | 'stopwatch' | 'podium'>> = {
  static: 'snowflake',
  power: 'bolt',
  endurance: 'stopwatch',
  journey: 'podium',
};

function useFadeUp(clock: SharedValue<number>, start: number, dy = 14, dur = 0.5, fade?: SharedValue<number>) {
  return useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - start) / dur));
    return { opacity: p * (fade ? fade.value : 1), transform: [{ translateY: (1 - p) * dy }] };
  });
}

// ── Icons (static SVG) ──────────────────────────────────────────────────────
function BoardIcon({ variant, color }: { variant: ShareVariant; color: string }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const worldIcon = WORLD_ICON[variant];
  if (worldIcon) return <KitIcon name={worldIcon} size={13} color={color} strokeWidth={2.6} />;
  if (variant === 'wellRounded') {
    return (
      <Svg width={15} height={13} viewBox="0 0 26 22">
        <Circle cx={9} cy={8} r={5.5} fill="none" stroke={WR_COLORS[0]} strokeWidth={2.4} />
        <Circle cx={17} cy={8} r={5.5} fill="none" stroke={WR_COLORS[1]} strokeWidth={2.4} />
        <Circle cx={13} cy={15} r={5.5} fill="none" stroke={WR_COLORS[2]} strokeWidth={2.4} />
      </Svg>
    );
  }
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      {variant === 'strength'
        ? <><Path d="M2 20l7-12 4 6 3-4 6 10z" {...stroke} /><Path d="M9 8l1.5 2.5" {...stroke} /></>
        : <><Path d="M5 21V4" {...stroke} /><Path d="M5 4h12l-2.5 4L17 12H5" {...stroke} /></>}
    </Svg>
  );
}

function PeopleIcon({ color }: { color: string }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={3.5} {...stroke} />
      <Path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" {...stroke} />
      <Path d="M16 4.8a3.5 3.5 0 0 1 0 6.4" {...stroke} />
      <Path d="M18.5 14.8c1.6.8 2.6 2.6 3 5.2" {...stroke} />
    </Svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Podium ──────────────────────────────────────────────────────────────────
function Spark({ clock, av, spark, color }: { clock: SharedValue<number>; av: number; spark: typeof SPARKS[number]; color: string }) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const burst = clamp01((T - LB_LOCK) / 0.9);
    if (T < LB_LOCK || burst >= 1) return { opacity: 0 };
    const p = clamp01((burst - spark.d) / (1 - spark.d));
    const r = av / 2 + 4 + easeOutCubic(p) * spark.dist;
    return {
      opacity: p > 0 ? 1 - p : 0,
      transform: [
        { translateX: av / 2 + r * Math.cos(spark.a) - spark.s / 2 },
        { translateY: av / 2 + r * Math.sin(spark.a) - spark.s / 2 },
        { rotate: `${45 + p * 90}deg` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: spark.s, height: spark.s, borderRadius: 1, backgroundColor: color, boxShadow: `0 0 ${spark.s * 2}px ${color}` }, style]}
    />
  );
}

function SplitBar({ clock, i, split }: { clock: SharedValue<number>; i: number; split: [number, number, number] }) {
  const sum = split[0] + split[1] + split[2] || 1;
  return (
    <View style={{ flexDirection: 'row', gap: 1.5, width: 62, height: 4, marginTop: 5 }}>
      {split.map((v, k) => <SplitSegment key={k} clock={clock} i={i} width={(62 - 3) * (v / sum)} color={WR_COLORS[k]} />)}
    </View>
  );
}

function SplitSegment({ clock, i, width, color }: { clock: SharedValue<number>; i: number; width: number; color: string }) {
  const style = useAnimatedStyle(() => ({ width: width * scoreProgress(clock.value, i) }));
  return <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: color }, style]} />;
}

/**
 * Podium score counting up from 0. Its own state, so a tick re-renders only
 * this Text (not the whole card); sized from the final value so it doesn't
 * jump size mid-count.
 */
function PodiumScore({ clock, i, score, type, first, color }: {
  clock: SharedValue<number>; i: number; score: number; type: ShareScoreType; first: boolean; color: string;
}) {
  const [shown, setShown] = useState(0);
  useAnimatedReaction(
    () => {
      const v = score * scoreProgress(clock.value, i);
      return type === 'points' ? Math.round(v * 100) / 100 : type === 'time' ? Math.floor(v) : Math.round(v);
    },
    (now, was) => { if (now !== was) runOnJS(setShown)(now); },
  );
  return (
    <Text style={[kt('bold', podiumScoreSize(formatShareScore(score, type), first), color), { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
      {formatShareScore(shown, type)}
    </Text>
  );
}

/** YOU-row rank counting down from the total (own state, like PodiumScore). */
function RankCounter({ clock, rank, total, countdown, color }: {
  clock: SharedValue<number>; rank: number | null; total: number; countdown: boolean; color: string;
}) {
  const [shown, setShown] = useState(rank ?? 0);
  useAnimatedReaction(
    () => (rank != null ? rankAt(clock.value, rank, total, countdown) : 0),
    (now, was) => { if (now !== was) runOnJS(setShown)(now); },
  );
  const bump = useAnimatedStyle(() => {
    const a = clock.value - LB_COUNTDOWN_END;
    const b = countdown && a > 0 && a < 0.3 ? Math.sin((a / 0.3) * Math.PI) : 0;
    return { transform: [{ scale: 1 + b * 0.14 }] };
  });
  // Sized from the widest value it will show (the start of the countdown).
  const widest = rank == null ? '—' : `#${countdown ? total : rank}`;
  return (
    <Animated.Text
      style={[kt('bold', widest.length >= 5 ? 20 : 26, color, 0, 30), { minWidth: 44, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }, bump]}
      numberOfLines={1}
    >
      {rank == null ? '—' : ltr(`#${shown}`)}
    </Animated.Text>
  );
}

const Place = React.memo(function Place({ clock, tk, i, place, scoreType, unit, youOnPodium }: {
  clock: SharedValue<number>; tk: LBTokens; i: number; place?: SharePlace; scoreType: ShareScoreType; unit: string; youOnPodium: boolean;
}) {
  const g = GEO[i];
  const first = i === 0;
  const filled = !!place;
  const you = !!place?.isYou;
  const medal = tk.medals[i];
  const ring = you ? tk.accent : medal;
  const land = placeLand(i);
  const rise = PLACE_RISE[i];
  const [blockW, setBlockW] = useState(0);

  const topStyle = useAnimatedStyle(() => {
    const dp = clamp01((clock.value - (land - 0.05)) / 0.4);
    return { opacity: clamp01(dp * 2.5) * (filled ? 1 : 0.7), transform: [{ translateY: (1 - easeOutBack(dp)) * -26 }] };
  });
  const blockStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const rp = easeOutCubic(clamp01((T - rise) / RISE_DUR));
    const la = T - land;
    const settle = la > 0 && la < 0.25 ? Math.sin((la / 0.25) * Math.PI) * 3 : 0;
    return { transform: [{ translateY: (1 - rp) * g.h + settle }] };
  });
  const pulseStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const p = clamp01((T - LB_LOCK) / 0.8);
    return { opacity: first && filled && T >= LB_LOCK ? (1 - p) * 0.8 : 0, transform: [{ scale: 1 + easeOutCubic(p) * 0.7 }] };
  });
  const crownStyle = useAnimatedStyle(() => {
    const c = clamp01((clock.value - LB_LOCK) / 0.35);
    return { opacity: clamp01(c * 2), transform: [{ scale: c > 0 ? easeOutBack(c) : 0 }, { translateY: (1 - easeOutCubic(c)) * 6 }] };
  });
  const shimmerStyle = useAnimatedStyle(() => {
    const s = clamp01((clock.value - LB_LOCK) / 0.6);
    return { opacity: first && filled && s > 0 && s < 1 ? 1 : 0, transform: [{ translateX: (-0.6 + 2.2 * easeOutCubic(s)) * blockW }] };
  });
  const youPulseStyle = useAnimatedStyle(() => {
    const a = clock.value - LB_LOCK - LB_AFTER.you;
    if (!you || !youOnPodium || a < 0) return { opacity: 0 };
    const p = clamp01(a / 1.2);
    return { opacity: 0.35 + 0.65 * Math.max(0, Math.sin(p * Math.PI * 2)) * (1 - p * 0.5) };
  });

  const sparkColors = tk.variant === 'wellRounded' ? [...WR_COLORS] : [medal, '#ffffff', '#F4D58A'];
  const dashed = { borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: tk.t5 };

  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', width: '100%', minWidth: 0, paddingBottom: 8 }, topStyle]}>
        <View style={{ width: g.av, height: g.av }}>
          {first && filled && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -4, top: -4, right: -4, bottom: -4, borderRadius: g.av, borderWidth: 2, borderColor: medal }, pulseStyle]} />}
          <View style={[
            { width: g.av, height: g.av, borderRadius: g.av / 2, alignItems: 'center', justifyContent: 'center' },
            filled ? { borderWidth: 2, borderColor: ring, backgroundColor: rgba(ring, 0.14) } : dashed,
            you && { boxShadow: `0 0 16px ${rgba(tk.accent, 0.45 * tk.glowK)}` },
          ]}>
            {filled && <Text style={kt('semibold', first ? 20 : 16, tk.t1, 0.5)}>{place!.initials}</Text>}
          </View>
          {first && filled && (
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: g.av / 2 - 11, top: -19, width: 22, height: 16 }, crownStyle]}>
              <Svg width={22} height={16} viewBox="0 0 22 16"><Path d="M1.5 4.5l5 4.2L11 1.5l4.5 7.2 5-4.2-1.8 10H3.3z" fill={MEDAL_GOLD} /></Svg>
            </Animated.View>
          )}
          {first && filled && SPARKS.map((s, k) => (
            <Spark key={k} clock={clock} av={g.av} spark={s} color={s.white ? '#ffffff' : sparkColors[k % sparkColors.length]} />
          ))}
        </View>
        <Text
          style={[kt('medium', 12, you ? tk.accent : filled ? tk.t2 : tk.t5, 0.4), { marginTop: 7, maxWidth: '100%', textAlign: 'center', writingDirection: 'ltr' }]}
          numberOfLines={1}
        >
          {filled ? place!.username : '—'}
        </Text>
        {filled && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 1, direction: 'ltr' }}>
            <PodiumScore clock={clock} i={i} score={place!.score} type={scoreType} first={first} color={tk.t1} />
            {!!unit && <Text style={kt('medium', 9, tk.t4, 1.2)}>{unit}</Text>}
          </View>
        )}
        {filled && place!.split && <SplitBar clock={clock} i={i} split={place!.split} />}
      </Animated.View>
      <View style={{ width: '100%', height: g.h, overflow: 'hidden' }} onLayout={first ? (e: LayoutChangeEvent) => setBlockW(e.nativeEvent.layout.width) : undefined}>
        <Animated.View style={[
          { width: '100%', height: g.h, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', alignItems: 'center', paddingTop: first ? 10 : 7 },
          filled ? { borderTopWidth: 2, borderTopColor: medal } : [dashed, { opacity: 0.6 }],
          blockStyle,
        ]}>
          {filled && <LinearGradient colors={[rgba(medal, tk.blockTop), rgba(medal, 0.04)]} style={StyleSheet.absoluteFill} />}
          {first && filled && blockW > 0 && (
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: blockW * 0.45 }, shimmerStyle]}>
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0.4 }} end={{ x: 1, y: 0.6 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}
          {you && youOnPodium && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderWidth: 2, borderColor: tk.accent, backgroundColor: rgba(tk.accent, 0.16) }, youPulseStyle]} />
          )}
          <Text style={kt('bold', g.num, filled ? medal : tk.t5, 0, g.num + 4)}>{i + 1}</Text>
        </Animated.View>
      </View>
    </View>
  );
});

function Mote({ clock, i, color }: { clock: SharedValue<number>; i: number; color: string }) {
  const x = (i * 53 + 17) % 330;
  const y = (i * 97 + 40) % MOTE_LOOP;
  const s = 2 + (i % 3);
  const v = 12 + (i % 4) * 5;
  const start = LB_LOCK + LB_AFTER.motes;
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    return {
      opacity: clamp01((T - start) / 1) * 0.55,
      transform: [{ translateX: x + Math.sin(T * 1.3 + x) * 4 }, { translateY: (((y - T * v) % MOTE_LOOP) + MOTE_LOOP) % MOTE_LOOP }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: s, height: s, borderRadius: s / 2, backgroundColor: color }, style]} />;
}

function LiveDot({ clock, color }: { clock: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * Math.abs(Math.sin(clock.value * 3)) }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, boxShadow: `0 0 8px ${color}` }, style]} />;
}

// ── Card ────────────────────────────────────────────────────────────────────
export function LeaderboardShareCard(props: LeaderboardShareCardProps) {
  if (!props.visible) return null;
  return <LeaderboardShareModal {...props} />;
}

/**
 * Shareable leaderboard card (assets/design_handoff_leaderboard_share):
 * the top 3 rise onto a podium, then the sharer's own row and rank. Shows
 * only usernames, ranks and scores (no country, gender or community name).
 * One Reanimated clock drives the whole timeline.
 */
function LeaderboardShareModal({
  onClose, variant, title, subLine, live = true, communityScoped, scoreType, rows, myId, myName,
}: LeaderboardShareCardProps) {
  const { mode } = useTheme();
  const tk = useMemo(() => getLBTokens(variant, mode), [variant, mode]);
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);

  const board = useMemo(() => buildShareBoard(rows, myId, myName), [rows, myId, myName]);
  const { top3, you, total, countdown } = board;
  const ranked = you.rank != null;
  const youOnPodium = ranked && you.rank! <= 3;
  const filledLands = top3.map((_, i) => placeLand(i));
  const unit = scoreType === 'time' ? '' : tr('leaderboardShare.pts');

  const clock = useSharedValue(0);
  const fade = useSharedValue(1);

  const run = (from: number) => {
    cancelAnimation(clock);
    clock.value = from;
    clock.value = withTiming(CLOCK_END, { duration: (CLOCK_END - from) * 1000, easing: Easing.linear });
  };

  useEffect(() => {
    track('leaderboard_share_opened', { variant });
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(rm => {
      if (!alive) return;
      if (rm) {
        // Final frame at once, nothing drifting or pulsing.
        cancelAnimation(clock);
        clock.value = LB_END;
        fade.value = 0;
        fade.value = withTiming(1, { duration: 200 });
      } else {
        run(0);
      }
    }).catch(() => run(0));
    return () => { alive = false; cancelAnimation(clock); };
  }, []);

  // ── Haptics + sound (sounds respect the Arena mute inside SoundService) ───
  const tick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); SoundService.playTick(); };
  const light = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  const lockCue = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    SoundService.playBoxingBell();
  };
  // A tick per filled place landing; a skip jumps several at once and stays
  // quiet (only the LOCK cue still plays).
  useAnimatedReaction(
    () => countPassed(filledLands, clock.value),
    (now, was) => { if (was != null && now - was === 1 && clock.value < LB_LOCK + 0.05) runOnJS(tick)(); },
  );
  useAnimatedReaction(() => clock.value >= LB_LOCK, (now, was) => { if (now && was === false) runOnJS(lockCue)(); });
  useAnimatedReaction(
    () => youOnPodium && clock.value >= LB_LOCK + LB_AFTER.you,
    (now, was) => { if (now && was === false && clock.value < LB_LOCK + LB_AFTER.you + 0.2) runOnJS(light)(); },
  );
  useAnimatedReaction(
    () => countdown && clock.value >= LB_COUNTDOWN_END,
    (now, was) => { if (now && was === false && clock.value < LB_COUNTDOWN_END + 0.2) runOnJS(tick)(); },
  );

  const skip = () => {
    if (clock.value < LB_END) run(LB_END);
  };

  // ── Animated styles ─────────────────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({ opacity: clamp01(clock.value / 0.35) * fade.value }));
  const cardStyle = useAnimatedStyle(() => {
    const p = clamp01((clock.value - 0.05) / 0.55);
    return {
      opacity: clamp01(p * 1.6) * fade.value,
      transform: [{ translateY: (1 - easeOutCubic(p)) * 40 }, { scale: 0.9 + 0.1 * easeOutBack(p) }],
    };
  });
  const glowStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const g = T < LB_LOCK
      ? 0.12 + clamp01((T - 0.75) / (LB_LOCK - 0.75)) * 0.1
      : 0.26 + 0.24 * (1 - clamp01((T - LB_LOCK) / 0.9));
    return { opacity: Math.min(1, g * 1.6 * tk.glowK) };
  });
  const eyebrowStyle = useFadeUp(clock, 0.35, 8);
  const titleStyle = useFadeUp(clock, 0.45, 10);
  const youStyle = useFadeUp(clock, LB_LOCK + LB_AFTER.you, 16);
  const logoStyle = useFadeUp(clock, LB_LOCK + LB_AFTER.logo, 6);
  const doneStyle = useFadeUp(clock, LB_LOCK + LB_AFTER.done, 24, 0.5, fade);
  const shareStyle = useFadeUp(clock, LB_LOCK + LB_AFTER.share, 24, 0.5, fade);

  const handleShare = async () => {
    skip();
    const result = await shareCardImage(cardRef, 'leaderboard-share-card', 'leap-arena-leaderboard.png');
    if (result === 'shared') track('leaderboard_shared', { variant });
    else if (result === 'unavailable') Alert.alert(tr('celebration.shareUnavailableTitle'), tr('celebration.shareUnavailable'));
    else Alert.alert(tr('celebration.error'), tr('celebration.shareFailed'));
  };

  const date = new Date().toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const titleSize = shareTitleSize(title);
  const eyebrow = variant === 'weekly' && !live ? tr('leaderboardShare.finalStandings') : tr('leaderboardShare.leaderboard');
  const rankColor = !ranked ? tk.t5 : youOnPodium ? tk.medals[you.rank! - 1] : tk.accent;
  const gapColor = !ranked ? tk.t3 : you.rank === 1 ? MEDAL_GOLD : tk.accent;
  const gapNum = ranked && you.rank! > 1 ? `${formatShareGap(you.gap, scoreType)}${unit ? ` ${unit}` : ''}` : '';
  const gapLabel = !ranked ? tr('leaderboardShare.notRanked') : you.rank === 1 ? tr('leaderboardShare.leader') : tr('leaderboardShare.toFirst');
  const places = [1, 0, 2];

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tk.backdrop }, backdropStyle]} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Tapping the card skips to the final frame; the backdrop does nothing. */}
        <Pressable onPress={skip} accessibilityHint={tr('prCelebration.tapToSkip')}>
          <Animated.View style={cardStyle}>
            {/* Glow behind the card (not captured in the shared image). */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
              borderRadius: 30, backgroundColor: tk.card, boxShadow: `0 0 70px 4px ${tk.accent}`,
            }, glowStyle]} />
            <View
              ref={cardRef}
              collapsable={false}
              nativeID="leaderboard-share-card"
              style={{ borderRadius: 30, paddingTop: 22, paddingHorizontal: 22, paddingBottom: 24, backgroundColor: tk.card, borderWidth: 1, borderColor: tk.cardBorder, overflow: 'hidden' }}
            >
              {variant === 'wellRounded' ? (
                // Three-world glow: a horizontal colour band faded out downwards
                // (fixed height, so the gradients never size themselves).
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300 }}>
                  <LinearGradient
                    colors={[rgba(WR_COLORS[0], tk.radialAlpha), rgba(WR_COLORS[1], tk.radialAlpha * 0.8), rgba(WR_COLORS[2], tk.radialAlpha)]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient colors={[rgba(tk.card, 0), tk.card]} start={{ x: 0.5, y: 0.1 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
                </View>
              ) : (
                <LinearGradient
                  pointerEvents="none"
                  colors={[rgba(tk.accent, tk.radialAlpha), 'transparent']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 0.55 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { direction: 'ltr' }]}>
                {Array.from({ length: 13 }, (_, i) => <Mote key={i} clock={clock} i={i} color={tk.mote} />)}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <BoardIcon variant={variant} color={tk.accent} />
                  <Text style={kt('semibold', isArabic ? 12 : 11, tk.accent, 2.4)}>{tr(BOARD_LABEL[variant] as 'leaderboardShare.strength')}</Text>
                </View>
                <Text style={kt('medium', 11, tk.t5, 1.6)}>{ltr(date)}</Text>
              </View>

              <Animated.Text style={[kt('semibold', isArabic ? 14 : 12, tk.t2, 4), { marginTop: 18, textAlign: 'center' }, eyebrowStyle]}>
                {eyebrow}
              </Animated.Text>

              <Animated.View style={[{ marginTop: 8, alignItems: 'center' }, titleStyle]}>
                <Text
                  style={[kt('bold', titleSize, tk.t1, 1.4, Math.round(titleSize * 1.12)), { textAlign: 'center' }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={22 / titleSize}
                >
                  {title.toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6 }}>
                  {variant === 'weekly' && live && <LiveDot clock={clock} color={tk.accent} />}
                  <Text style={[kt('medium', 13, tk.t3, 1.6), { textAlign: 'center' }]} numberOfLines={1}>{subLine}</Text>
                </View>
                {communityScoped && (
                  <View style={{ marginTop: 10, height: 24, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: tk.chipBorder, backgroundColor: tk.youBg, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PeopleIcon color={tk.t2} />
                    <Text style={kt('semibold', isArabic ? 11.5 : 10, tk.t2, 2)}>{tr('leaderboardShare.myCommunity')}</Text>
                  </View>
                )}
              </Animated.View>

              {/* Podium: always 2nd · 1st · 3rd, left to right in every language. */}
              <View style={{ marginTop: 16, paddingTop: 22, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderBottomWidth: 1, borderBottomColor: tk.floorLine, direction: 'ltr' }}>
                {places.map(i => (
                  <Place
                    key={i} clock={clock} tk={tk} i={i} place={top3[i]}
                    scoreType={scoreType}
                    unit={unit} youOnPodium={youOnPodium}
                  />
                ))}
              </View>

              <Animated.View style={[{ marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: tk.youBorder, backgroundColor: tk.youBg, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 11 }, youStyle]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <RankCounter clock={clock} rank={you.rank} total={total} countdown={countdown} color={rankColor} />
                  <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: tk.accent, backgroundColor: rgba(tk.accent, 0.14), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={kt('semibold', 13, tk.t1)}>{usernameInitials(you.username)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[kt('semibold', 14, tk.t1, 0.3), { flexShrink: 1, writingDirection: 'ltr' }]} numberOfLines={1}>{you.username}</Text>
                      <View style={{ height: 16, paddingHorizontal: 6, borderRadius: 5, backgroundColor: tk.accent, justifyContent: 'center' }}>
                        <Text style={kt('bold', isArabic ? 10 : 9, '#ffffff', 1.4)}>{tr('leaderboardShare.you')}</Text>
                      </View>
                    </View>
                    <Text style={[kt('medium', isArabic ? 11.5 : 10, tk.t4, 1.2), { marginTop: 2 }]}>
                      {ranked ? tr('leaderboardShare.ofWarriors', { n: ltr(total.toLocaleString('en-US')) }) : tr(NOT_RANKED_LINE[variant] as 'leaderboardShare.notRankedWeekly')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, direction: 'ltr' }}>
                    <Text style={[kt('bold', 18, ranked ? tk.t1 : tk.t5), { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
                      {ranked && you.score != null ? formatShareScore(you.score, scoreType) : '—'}
                    </Text>
                    {ranked && !!unit && <Text style={kt('medium', 9, tk.t4, 1.2)}>{unit}</Text>}
                  </View>
                </View>
                <View style={{ marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: tk.youDivider, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {!!gapNum && <Text style={[kt('semibold', 11, gapColor, 1), { fontVariant: ['tabular-nums'] }]}>{ltr(gapNum)}</Text>}
                  <Text style={kt('semibold', isArabic ? 12 : 11, gapColor, 1.8)}>{gapLabel}</Text>
                </View>
              </Animated.View>

              <Animated.View style={[{ marginTop: 16, alignItems: 'center' }, logoStyle]}>
                <View style={{ height: 30, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: tk.pillBorder, flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' }}>
                  <LeapLogo size={18} animated={false} />
                  <Text style={kt('semibold', 11, tk.t1, 2.4)}>LEAP ARENA</Text>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </Pressable>

        {/* DONE is the one primary action; Share is a square icon beside it
            (outside the card, so it never appears in the shared image). */}
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 14 }}>
          <Animated.View style={[{ flex: 1 }, doneStyle]}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => ({
                height: 56, borderRadius: 16, backgroundColor: tk.accent, alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 10px 30px ${rgba(tk.accent, 0.3)}`, opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={kt('bold', 16, '#ffffff', 2.6)}>{tr('leaderboardShare.done')}</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={shareStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('leaderboardShare.share')}
              onPress={handleShare}
              hitSlop={4}
              style={({ pressed }) => ({
                width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: tk.shareBorder, backgroundColor: tk.shareBg,
                alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
              })}
            >
              <ShareIcon color={tk.t1} />
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
    </Modal>
  );
}

/**
 * Share button for board headers: a small outlined square, or (round) the
 * 40-px filled circle that matches a world sheet's close button.
 */
export function BoardShareButton({ color, borderColor, onPress, round, background }: {
  color: string; borderColor: string; onPress: () => void; round?: boolean; background?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('leaderboardShare.share')}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        ...(round
          ? { width: 40, height: 40, borderRadius: 20, backgroundColor: background }
          : { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor }),
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
      })}
    >
      <Svg width={round ? 15 : 16} height={round ? 15 : 16} viewBox="0 0 24 24">
        <Path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}
