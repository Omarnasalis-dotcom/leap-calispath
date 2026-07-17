import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { WorldTheme } from '../../../constants/worldThemes';

interface WorldBackgroundProps {
  world: WorldTheme;
  children: React.ReactNode;
}

/**
 * World page background: near-black tinted base with a faint radial accent
 * glow at the top (design handoff: radial-gradient 120% × 60% at 50% 0%,
 * accent @ 10% → transparent).
 */
export function WorldBackground({ world, children }: WorldBackgroundProps) {
  return (
    <View style={[styles.root, { backgroundColor: world.pageBg }]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="worldGlow" cx="50%" cy="0%" rx="60%" ry="30%">
            <Stop offset="0%" stopColor={world.accent} stopOpacity={0.1} />
            <Stop offset="100%" stopColor={world.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="0%" rx="60%" ry="30%" fill="url(#worldGlow)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
