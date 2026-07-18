import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { StatCircle } from '../worlds/StatCircle';
import { ScoreRingHero } from '../worlds/ScoreRingHero';
import { WORLD_THEMES, WORLD_NEUTRALS } from '../../../constants/worldThemes';
import { clamp01 } from '../../lib/worldProgress';

interface TierRankData {
  rank: number | null;
  total: number;
  gap: string | null;
}

interface TierRankCardProps {
  profile: any;
  category: 'strength' | 'power';
  selectedTier: number;
  isLocked: boolean;
  tierName: string;
  tierRankData: TierRankData;
  theme: any;
  onShowTierModal: (tier: number) => void;
}

const MAX_STRENGTH_TIER = 9;
const MAX_POWER_TIER = 3;

/**
 * 3-circle strength/power header (design handoff): RANK / tier ring / GAP,
 * with an honest labeled progress bar underneath. Rank and gap always agree —
 * the old version showed "#-" + "NO TIME SET YET" beside an already-filled
 * tier circle, contradicting itself.
 */
export function TierRankCard({
  profile,
  category,
  selectedTier,
  isLocked,
  tierName,
  tierRankData,
  theme,
  onShowTierModal,
}: TierRankCardProps) {
  const W = WORLD_THEMES.strength;
  const currentTier = category === 'strength' ? (profile?.strength_tier ?? 0) : (profile?.power_tier ?? 0);
  const maxTier = category === 'strength' ? MAX_STRENGTH_TIER : MAX_POWER_TIER;
  const tierProgress = clamp01(currentTier / maxTier);
  const pct = Math.round(tierProgress * 100);
  const hasEntry = tierRankData.rank !== null;

  return (
    <View style={styles.card}>
      <View style={styles.circlesRow}>
        <StatCircle
          size={HERO_SIDE_SIZE}
          label="RANK"
          value={`#${tierRankData.rank ?? 0}`}
          caption={tierRankData.total > 0 ? `OF ${tierRankData.total}` : 'NO ENTRIES YET'}
          unranked={!hasEntry}
        />

        <ScoreRingHero
          world={W}
          size={HERO_CENTER_SIZE}
          progress={isLocked ? 0 : tierProgress}
          label={`TIER ${currentTier}`}
          value={tierName.toUpperCase()}
          caption={currentTier < maxTier ? `${pct}% TO TIER ${currentTier + 1}` : 'MAX TIER'}
          onPress={() => onShowTierModal(selectedTier)}
        />

        <StatCircle
          size={HERO_SIDE_SIZE}
          label="GAP"
          value={tierRankData.rank === 1 ? 'KING' : tierRankData.gap ?? ''}
          caption={
            tierRankData.rank === 1
              ? 'AT THE TOP'
              : category === 'strength' ? 'TO #1 SPOT' : 'PTS TO #1'
          }
          unranked={!hasEntry || (tierRankData.rank !== 1 && !tierRankData.gap)}
        />
      </View>

      {/* Honest labeled tier progress bar */}
      {category === 'strength' && (
        <View style={styles.barSection}>
          <View style={styles.barLabels}>
            <Text style={styles.barLabelLeft}>TIER {currentTier} OF {MAX_STRENGTH_TIER}</Text>
            <Text style={[styles.barLabelRight, { color: W.accent }]}>{pct}% COMPLETE</Text>
          </View>
          <View style={[styles.track, { backgroundColor: W.trackRgba }]}>
            <View style={[styles.fill, { backgroundColor: W.accent, width: `${pct}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
}

const { width } = Dimensions.get('window');
const HERO_CENTER_SIZE = 134;
const HERO_SIDE_SIZE = Math.min(84, Math.floor((width - 40 - 20 - HERO_CENTER_SIZE) / 2));

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
  },
  circlesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  barSection: {
    marginTop: 18,
    paddingHorizontal: 4,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barLabelLeft: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: WORLD_NEUTRALS.textSecondary,
  },
  barLabelRight: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
