import React from 'react';
import { View, StyleSheet } from 'react-native';

const ACCENT = '#FF5252';

interface TutorialDotsProps {
  total: number;
  activeIndex: number;
}

// Past this many steps the full-size dots overflow the caption card on a
// narrow phone, so long tours (the main tour) get a compact row.
const COMPACT_THRESHOLD = 12;

export function TutorialDots({ total, activeIndex }: TutorialDotsProps) {
  const compact = total > COMPACT_THRESHOLD;
  return (
    <View style={[styles.row, compact && { gap: 4 }]}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            compact && { height: 5, borderRadius: 2.5 },
            i === activeIndex
              ? { width: compact ? 14 : 22, backgroundColor: ACCENT }
              : { width: compact ? 5 : 8, backgroundColor: 'rgba(255,255,255,0.2)' },
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
