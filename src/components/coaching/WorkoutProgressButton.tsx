import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface WorkoutProgressButtonProps {
  theme: any;
  // Blocks actually marked completed — drives the fill % (missed blocks
  // don't visually count as progress, even though they still end the workout).
  blocksCompleted: number;
  blocksTotal: number;
  // Every block has some status (completed or missed) — flips the label to
  // "WORKOUT DONE" independent of the completed-only fill percentage.
  isAddressed: boolean;
  onPress: () => void;
}

export const WorkoutProgressButton: React.FC<WorkoutProgressButtonProps> = ({
  theme,
  blocksCompleted,
  blocksTotal,
  isAddressed,
  onPress,
}) => {
  const pct = blocksTotal > 0 ? Math.round((blocksCompleted / blocksTotal) * 100) : 0;

  return (
    <TouchableOpacity onPress={onPress}>
      <LinearGradient
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBorder}
      >
        <View style={[styles.card, { backgroundColor: theme.card.background }]}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: isAddressed ? 'rgba(76,175,80,0.18)' : 'rgba(200,160,64,0.18)' }]} />
          <Text style={[styles.label, { color: theme.text.primary }]}>
            {isAddressed ? 'WORKOUT DONE' : `WORKOUT PROGRESS — ${pct}%`}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  gradientBorder: {
    padding: 1.2,
    borderRadius: 9,
  },
  card: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  label: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
});
