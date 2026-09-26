import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { AnimatedRing } from './AnimatedRing';
import { KitIcon } from './KitIcon';
import { kt } from './type';

export interface GapCircle {
  label: string;
  value: string;
  sub: string;
  progress: number;
  /** King state: value + ring in gold. */
  gold?: boolean;
  /** Greyed "—" value. */
  empty?: boolean;
}

interface Props {
  tokens: WorldKitTokens;
  /** Prefix for the circle labels: "STATIC" · "POWER" · "1MM". */
  worldLabel: string;
  rank: number | null;
  isKing: boolean;
  rankProgress: number;
  score: number;
  scoreText: string;
  scoreProgress: number;
  gap: GapCircle;
  onOpenLeaderboard: () => void;
  /** Tutorial target on the Score circle. */
  scoreRef?: React.Ref<View>;
  onScoreLayout?: () => void;
}

// Reference row: 96 + 6 + 158 + 6 + 96 = 362 = 402 frame − 2×20 padding.
const ROW_WIDTH = 362;
// Text column width as a share of the circle. Oswald's default line height
// is ~1.5em, so every line gets an explicit tight lineHeight and the column
// is narrowed to the width the circle actually has at the top/bottom lines;
// anything longer ("PTS TO PASS", "12345.67") shrinks instead of hitting
// the ring.
const SIDE_TEXT_WIDTH = 0.68;
const CENTER_TEXT_WIDTH = 0.7;
const fit = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6 } as const;

/** Rank / Score / Gap circles + leaderboard button (handoff §0.4). */
export function DashboardRings({
  tokens: t, worldLabel, rank, isKing, rankProgress, score, scoreText, scoreProgress,
  gap, onOpenLeaderboard, scoreRef, onScoreLayout,
}: Props) {
  const { width } = useWindowDimensions();
  // Scale the whole row down on phones narrower than the 402pt reference.
  const s = Math.min(1, (width - 40) / ROW_WIDTH);
  const side = 96 * s;
  const center = 158 * s;
  const ranked = rank != null && rank > 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 * s, paddingTop: 22, paddingHorizontal: 20 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${worldLabel} rank, open leaderboard`} onPress={onOpenLeaderboard}>
        <AnimatedRing size={side} radius={45 * s} strokeWidth={3} progress={rankProgress} color={isKing ? t.gold : t.accent} trackColor={t.track} delay={250}>
          <View style={[styles.content, { width: side * SIDE_TEXT_WIDTH, gap: 3 * s }]}>
            <Text {...fit} style={[kt('medium', 9.5 * s, t.textMuted, 1.6, 12 * s), styles.center]}>{worldLabel} RANK</Text>
            <Text {...fit} style={[kt('bold', 24 * s, ranked ? (isKing ? t.gold : t.text) : t.textDisabled, 0, 27 * s), styles.center]}>{ranked ? `#${rank}` : '—'}</Text>
            <Text {...fit} style={[kt('medium', 10 * s, t.textFaint, 1.2, 12.5 * s), styles.center]}>{ranked ? 'OF WORLD' : 'UNRANKED'}</Text>
          </View>
        </AnimatedRing>
      </Pressable>

      <View ref={scoreRef} onLayout={onScoreLayout} collapsable={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${worldLabel} score ${scoreText}, open leaderboard`} onPress={onOpenLeaderboard}>
          <View style={{ position: 'absolute', top: 14 * s, left: 14 * s, right: 14 * s, bottom: 14 * s, borderRadius: center, backgroundColor: t.tintStrong }} />
          <AnimatedRing size={center} radius={75 * s} strokeWidth={6} progress={scoreProgress} color={t.accent} trackColor={t.track} delay={150}>
            <View style={[styles.content, { width: center * CENTER_TEXT_WIDTH, gap: 5 * s, paddingBottom: 16 * s }]}>
              <Text {...fit} style={[kt('semibold', 10.5 * s, t.accentText, 2, 13 * s), styles.center]}>{worldLabel} SCORE</Text>
              <Text {...fit} style={[kt('bold', 34 * s, score > 0 ? t.text : t.textDisabled, 0, 38 * s), styles.center]}>{scoreText}</Text>
              <Text {...fit} style={[kt('medium', 10 * s, t.textFaint, 1.6, 12.5 * s), styles.center]}>TOTAL PTS</Text>
            </View>
          </AnimatedRing>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${worldLabel} leaderboard`}
          onPress={onOpenLeaderboard}
          hitSlop={6}
          style={({ pressed }) => ({
            position: 'absolute', right: -2, bottom: 4,
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: pressed ? t.accentHover : t.accent,
            borderWidth: 4, borderColor: t.bg,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: t.accent, shadowOpacity: 0.35, shadowRadius: 1, shadowOffset: { width: 0, height: 0 },
          })}
        >
          <KitIcon name="podium" size={18} color="#ffffff" />
        </Pressable>
      </View>

      <AnimatedRing size={side} radius={45 * s} strokeWidth={3} progress={gap.progress} color={gap.gold ? t.gold : t.accent} trackColor={t.track} delay={350}>
        <View style={[styles.content, { width: side * SIDE_TEXT_WIDTH, gap: 3 * s }]}>
          <Text {...fit} style={[kt('medium', 9.5 * s, t.textMuted, 1.6, 12 * s), styles.center]}>{gap.label}</Text>
          <Text {...fit} style={[kt('bold', 22 * s, gap.gold ? t.gold : gap.empty ? t.textDisabled : t.text, 0, 25 * s), styles.center]}>{gap.value}</Text>
          <Text {...fit} style={[kt('medium', 10 * s, t.textFaint, 1.2, 12.5 * s), styles.center]}>{gap.sub}</Text>
        </View>
      </AnimatedRing>
    </View>
  );
}


const styles = StyleSheet.create({
  content: { alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center', alignSelf: 'stretch' },
});
