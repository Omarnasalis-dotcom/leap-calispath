import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getWorldNeutrals, WorldTheme, worldRgba } from '../../../constants/worldThemes';
import { useTheme } from '../../contexts/ThemeContext';

interface WorldHeaderPillProps {
  world: WorldTheme;
  /** e.g. "POWER WORLD". */
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Top pill header of every world screen (design handoff: full-width 50px
 * pill, 1.5px accent border @ 55%, translucent accent fill).
 */
export function WorldHeaderPill({ world, title, icon, onPress, style }: WorldHeaderPillProps) {
  const { mode } = useTheme();
  const neutrals = getWorldNeutrals(mode);

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.8 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.pill,
        {
          borderColor: worldRgba(world.accent, 0.55),
          backgroundColor: worldRgba(world.accent, 0.1),
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={15} color={world.accent} style={{ marginRight: 7 }} />
      <Text style={[styles.title, { color: neutrals.textPrimary }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 50,
    marginHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 3,
  },
});
