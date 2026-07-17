import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { WORLD_NEUTRALS } from '../../../constants/worldThemes';

interface StatCircleProps {
  /** Top label, e.g. "GLOBAL RANK". */
  label: string;
  /** Big center value, e.g. "#4". Ignored when `unranked` is set. */
  value: string;
  /** Bottom caption, e.g. "OF WORLD". */
  caption: string;
  /** Honest empty state: renders "UNRANKED" instead of a placeholder value. */
  unranked?: boolean;
  size?: number;
  style?: ViewStyle;
}

/**
 * Side circle of the 3-circle world header (design handoff: 96px, hairline
 * white border, explicit "UNRANKED" copy — never "#--").
 */
export function StatCircle({ label, value, caption, unranked = false, size = 96, style }: StatCircleProps) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {unranked ? (
        <Text style={styles.unranked}>UNRANKED</Text>
      ) : (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={styles.caption} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 1.5,
    borderColor: WORLD_NEUTRALS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 1,
  },
  label: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8.5,
    letterSpacing: 1,
    color: WORLD_NEUTRALS.textCaption,
  },
  value: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 24,
    color: WORLD_NEUTRALS.textPrimary,
  },
  unranked: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 14,
    color: WORLD_NEUTRALS.textMuted,
  },
  caption: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 8,
    letterSpacing: 0.5,
    color: WORLD_NEUTRALS.textMuted,
  },
});
