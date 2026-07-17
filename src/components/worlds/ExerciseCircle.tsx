import React, { forwardRef, useEffect, useRef } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WorldRing } from './WorldRing';
import { ExerciseIcon } from './ExerciseIcon';
import { WORLD_NEUTRALS, WorldTheme } from '../../../constants/worldThemes';

interface ExerciseCircleProps {
  world: WorldTheme;
  /** Real ratio 0–1 for the ring. */
  progress: number;
  /** Glyph key for ExerciseIcon. */
  icon: string;
  /** Exercise name under the circle, e.g. "PULL-UP". */
  name: string;
  /** Logged value shown in the circle (e.g. "120" or "35"). Omit when nothing logged. */
  value?: string;
  /**
   * Caption under the name. Empty state: "TAP TO LOG" / "TAP TO TIME"
   * (muted); logged state: e.g. "120 KG" / "PB 35s" (accent).
   */
  caption: string;
  hasLogged: boolean;
  /** Corner badge glyph — decorative only; the whole circle is the tap target. */
  badge?: 'plus' | 'stopwatch';
  /** Circle diameter: 80 (Power ×4), 88 (1MM grid), 100 (Static ×3). */
  size?: number;
  locked?: boolean;
  onPress: () => void;
  style?: ViewStyle;
  /** Forwarded for tutorial highlight targets. */
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * Whole-circle tappable exercise circle (design handoff): honest ring, one
 * distinct icon, one value — never stacked placeholders — with a decorative
 * corner badge and a friendly empty-state caption.
 */
export const ExerciseCircle = forwardRef<View, ExerciseCircleProps>(function ExerciseCircle(
  { world, progress, icon, name, value, caption, hasLogged, badge = 'plus', size = 80, locked = false, onPress, style, onLayout },
  ref
) {
  const scale = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);

  // Pulse when the logged value changes (i.e. after a save lands) — the
  // handoff's tap-pulse, tied to real data instead of the demo increment.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.1, duration: 125, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 125, useNativeDriver: true }),
    ]).start();
  }, [value, scale]);

  const badgeSize = 34;

  return (
    <View ref={ref} onLayout={onLayout} style={[styles.wrap, style, locked && styles.locked]}>
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} hitSlop={4}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <WorldRing size={size} strokeWidth={5} progress={progress} accent={world.accent} trackColor={world.trackRgba}>
            <View style={styles.center}>
              <ExerciseIcon name={icon} size={18} color={hasLogged ? world.accent : WORLD_NEUTRALS.textSecondary} />
              {value !== undefined && (
                <Text style={styles.value} numberOfLines={1}>
                  {value}
                </Text>
              )}
            </View>
          </WorldRing>
          <View
            pointerEvents="none"
            style={[
              styles.badge,
              {
                width: badgeSize,
                height: badgeSize,
                borderRadius: badgeSize / 2,
                backgroundColor: world.accent,
                borderColor: world.pageBg,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={badge === 'plus' ? 'plus' : 'timer-outline'}
              size={16}
              color={world.ctaText}
            />
          </View>
        </Animated.View>
      </TouchableOpacity>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.caption, hasLogged ? { color: world.accent } : styles.captionEmpty]} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 3,
  },
  locked: {
    opacity: 0.45,
  },
  center: {
    alignItems: 'center',
    gap: 2,
  },
  value: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    color: WORLD_NEUTRALS.textPrimary,
  },
  badge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 5,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    color: WORLD_NEUTRALS.textPrimary,
    maxWidth: 110,
    textAlign: 'center',
  },
  caption: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  captionEmpty: {
    fontFamily: 'BarlowCondensed-SemiBold',
    color: WORLD_NEUTRALS.textMuted,
  },
});
