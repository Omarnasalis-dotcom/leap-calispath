import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ScoreBarProps {
  title: string;
  subtitle: string;
  score: number;
  rank: string;
  max: number;
  color: string;
  chips: { label: string; value: number; color: string }[];
  onPress?: () => void;
  showCrown?: boolean;
  mode: 'light' | 'dark';
  cardBackground: string;
}

export function ScoreBar({
  title, subtitle, score, rank, max, color,
  chips, onPress, showCrown, mode, cardBackground,
}: ScoreBarProps) {
  const pct = Math.min(100, (score / max) * 100);

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      style={[
        styles.scoreBarCard,
        {
          backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          borderColor: `${color}40`,
          paddingVertical: 12,
          marginBottom: 8,
        }
      ]}
    >
      <View style={styles.scoreBarHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.scoreBarTitle, { color, fontWeight: '900', fontSize: 12 }]}>{title}</Text>
          <Text style={[styles.scoreBarSubtitle, { color: 'rgba(0,0,0,0.3)', fontSize: 9, marginTop: 2 }]}>{subtitle}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.scoreBarTotal, { color, fontSize: 24 }]}>{score.toFixed(2)}</Text>
        </View>
      </View>

      {/* Track */}
      <View style={[styles.scoreBarTrack, { backgroundColor: `${color}12`, borderColor: `${color}20` }]}>
        <View style={[styles.scoreBarFill, {
          width: `${pct}%`,
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 4,
        }]} />
      </View>

      {/* Chips row */}
      <View style={styles.scoreChips}>
        {chips.map((c, idx) => (
          <View key={idx} style={styles.scoreChip}>
            <View style={[styles.scoreChipDot, { backgroundColor: c.color }]} />
            <Text style={[styles.scoreChipVal, { color: mode === 'dark' ? '#FFF' : '#000', fontSize: 10 }]}>{c.value.toFixed(2)}</Text>
            <Text style={[styles.scoreChipLbl, { color: 'rgba(0,0,0,0.25)', fontSize: 9 }]}>{c.label}</Text>
          </View>
        ))}
      </View>

      {onPress && (
        <TouchableOpacity
          style={[styles.lbCircleIndicator, { backgroundColor: cardBackground, borderColor: `${color}30` }]}
          onPress={onPress}
        >
          <MaterialCommunityIcons name="trophy" size={12} color={color} />
        </TouchableOpacity>
      )}

      {showCrown && (
        <View style={styles.crownDecoration}>
          <MaterialCommunityIcons name="crown" size={12} color={color} />
          <Text style={[styles.rankHashtag, { color }]}>#1</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scoreBarCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 10,
  },
  scoreBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  scoreBarTitle: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scoreBarSubtitle: {
    fontSize: 9,
    fontWeight: '500',
    fontFamily: 'PlusJakartaSans-Medium',
  },
  scoreBarTotal: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scoreBarTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreChipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  scoreChipVal: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scoreChipLbl: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-Medium',
  },
  lbCircleIndicator: {
    position: 'absolute',
    top: -10,
    right: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  crownDecoration: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    zIndex: 10,
  },
  rankHashtag: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
});
