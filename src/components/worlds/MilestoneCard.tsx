import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getWorldNeutrals, WorldTheme, worldRgba } from '../../../constants/worldThemes';
import { clamp01 } from '../../lib/worldProgress';
import { useTheme } from '../../contexts/ThemeContext';

interface MilestoneCardProps {
  world: WorldTheme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Headline stating the actual target, e.g. "42.50 Points to AMPERE". */
  headline: string;
  /** Caption, e.g. "YOUR NEXT MAJOR MILESTONE". */
  caption: string;
  /** Real ratio 0–1 — the bar must render as an empty track at 0. */
  progress: number;
  /** Right footer text, e.g. "42.50 / 100 PTS". */
  footerRight: string;
  footerLeft?: string;
  style?: ViewStyle;
}

/**
 * Next-milestone card (design handoff): 24px-radius accent-tinted card with
 * an 8px honest progress bar. The original app hard-coded this bar full at
 * 0.00 points — the width here always comes from the real ratio.
 */
export function MilestoneCard({
  world,
  icon,
  headline,
  caption,
  progress,
  footerRight,
  footerLeft = 'PROGRESS',
  style,
}: MilestoneCardProps) {
  const pct = clamp01(progress) * 100;
  const { mode } = useTheme();
  const neutrals = getWorldNeutrals(mode);

  return (
    <View style={[styles.card, { backgroundColor: world.cardFill, borderColor: world.cardBorder }, style]}>
      <View style={styles.headRow}>
        <View style={[styles.iconTile, { backgroundColor: worldRgba(world.accent, 0.16) }]}>
          <MaterialCommunityIcons name={icon} size={22} color={world.accent} />
        </View>
        <View style={styles.headText}>
          <Text style={[styles.headline, { color: neutrals.textPrimary }]} numberOfLines={2}>
            {headline}
          </Text>
          <Text style={[styles.caption, { color: neutrals.textCaption }]} numberOfLines={1}>
            {caption}
          </Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: world.trackRgba }]}>
        <View style={[styles.fill, { backgroundColor: world.accent, width: `${pct}%` }]} />
      </View>
      <View style={styles.footerRow}>
        <Text style={[styles.footerLeft, { color: neutrals.textMuted }]}>{footerLeft}</Text>
        <Text style={[styles.footerRight, { color: world.accent }]}>{footerRight}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: {
    flex: 1,
    gap: 2,
  },
  headline: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 19,
  },
  caption: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 16,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  footerLeft: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
  },
  footerRight: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
  },
});
