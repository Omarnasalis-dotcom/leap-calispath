import React, { forwardRef } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WorldRing } from './WorldRing';
import { getWorldNeutrals, WorldTheme } from '../../../constants/worldThemes';
import { useTheme } from '../../contexts/ThemeContext';

interface ScoreRingHeroProps {
  world: WorldTheme;
  /** Real ratio 0–1 for the ring arc. */
  progress: number;
  /** Small accent label above the value, e.g. "POWER SCORE". */
  label: string;
  /** Big center value, e.g. "42.50". */
  value: string;
  /** Caption under the value, e.g. "TOTAL". */
  caption: string;
  /** Crown shown above the value (rank #1). */
  showCrown?: boolean;
  onPress?: () => void;
  /** Corner badge (44px, accent fill) — decorative/reinforcing tap. */
  badgeIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onBadgePress?: () => void;
  size?: number;
  style?: ViewStyle;
  /** Forwarded so tutorial highlight targets keep measuring this element. */
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * Center circle of the 3-circle world header: 150px honest score ring with a
 * 44px corner badge (design handoff).
 */
export const ScoreRingHero = forwardRef<View, ScoreRingHeroProps>(function ScoreRingHero(
  { world, progress, label, value, caption, showCrown = false, onPress, badgeIcon, onBadgePress, size = 150, style, onLayout },
  ref
) {
  const { mode } = useTheme();
  const neutrals = getWorldNeutrals(mode);

  return (
    <View ref={ref} onLayout={onLayout} style={[{ width: size, height: size }, style]}>
      <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} disabled={!onPress}>
        <WorldRing size={size} strokeWidth={6} progress={progress} accent={world.accent} trackColor={world.trackRgba}>
          <View style={styles.center}>
            {showCrown && (
              <MaterialCommunityIcons name="crown" size={16} color={world.accent} style={{ marginBottom: -2 }} />
            )}
            <Text style={[styles.label, { color: world.accent }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.value, { color: neutrals.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
              {value}
            </Text>
            <Text style={[styles.caption, { color: neutrals.textMuted }]} numberOfLines={1}>
              {caption}
            </Text>
          </View>
        </WorldRing>
      </TouchableOpacity>
      {badgeIcon && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onBadgePress}
          disabled={!onBadgePress}
          style={[styles.badge, { backgroundColor: world.accent, borderColor: world.pageBg }]}
        >
          <MaterialCommunityIcons name={badgeIcon} size={20} color={world.ctaText} />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 1,
  },
  label: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  value: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 33,
  },
  caption: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 9,
    letterSpacing: 1,
  },
  badge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
