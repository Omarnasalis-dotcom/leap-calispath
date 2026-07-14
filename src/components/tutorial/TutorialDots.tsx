import React from 'react';
import { View, StyleSheet } from 'react-native';

const ACCENT = '#FF5252';

interface TutorialDotsProps {
  total: number;
  activeIndex: number;
}

export function TutorialDots({ total, activeIndex }: TutorialDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === activeIndex
              ? { width: 22, backgroundColor: ACCENT }
              : { width: 8, backgroundColor: 'rgba(255,255,255,0.2)' },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
