import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { WarriorCard } from '../atoms/WarriorCard';

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
  return (
    <WarriorCard
      style={styles.modernTierCard}
      variant={isLocked ? 'default' : 'accent'}
      padding={16}
    >
      <View style={styles.tierCirclesRow}>
        {/* Left Circle: Rank */}
        <View style={[styles.tierCircleSmall, { borderColor: isLocked ? theme.card.border : theme.accent + '30' }]}>
          <Text style={[styles.tierCircleLabel, { color: theme.text.tertiary }]}>RANK</Text>
          <Text style={[styles.tierCircleValue, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
            #{tierRankData.rank || '-'}
          </Text>
          <Text style={[styles.tierCircleSubValue, { color: theme.text.tertiary }]}>
            OF {tierRankData.total}
          </Text>
          {tierRankData.total === 0 && (
            <Text style={{ color: theme.text.tertiary, fontSize: 9, textAlign: 'center', marginTop: 2 }}>
              NO ENTRIES YET
            </Text>
          )}
          {tierRankData.total > 0 && tierRankData.rank === null && (
            <Text style={{ color: theme.text.tertiary, fontSize: 9, textAlign: 'center', marginTop: 2 }}>
              NO TIME SET YET
            </Text>
          )}
        </View>

        {/* Center Circle: Main Tier */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onShowTierModal(selectedTier)}
          style={[styles.tierCircleLarge, { borderColor: isLocked ? theme.card.border : theme.accent }]}
        >
          <Text style={[styles.tierLargeName, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
            {tierName.toUpperCase()}
          </Text>
        </TouchableOpacity>

        {/* Right Circle: Gap */}
        <View style={[styles.tierCircleSmall, { borderColor: isLocked ? theme.card.border : theme.accent + '30' }]}>
          <Text style={[styles.tierCircleLabel, { color: theme.text.tertiary }]}>GAP</Text>
          <Text style={[styles.tierCircleValue, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
            {tierRankData.rank === 1 ? 'KING' : (tierRankData.gap || '-')}
          </Text>
          {tierRankData.rank !== 1 && (
            <Text style={[styles.tierCircleSubValue, { color: theme.text.tertiary }]}>
              {category === 'strength' ? 'TO #1' : 'PTS'}
            </Text>
          )}
        </View>
      </View>

      {/* Progress Bar */}
      {category === 'strength' && (
        <View style={{ paddingHorizontal: 24, marginTop: 12, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: theme.text.secondary }}>
              Tier {profile?.strength_tier ?? 0} of 9
            </Text>
            <Text style={{ fontSize: 11, color: theme.text.secondary }}>
              {Math.round(((profile?.strength_tier ?? 0) / 9) * 100)}% Complete
            </Text>
          </View>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(205,127,50,0.2)', overflow: 'hidden' }}>
            <View style={{
              height: '100%',
              backgroundColor: theme.accent,
              width: `${((profile?.strength_tier ?? 0) / 9) * 100}%`
            }} />
          </View>
        </View>
      )}
    </WarriorCard>
  );
}

const styles = StyleSheet.create({
  modernTierCard: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
  },
  tierCirclesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tierCircleSmall: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierCircleLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierCircleLabel: {
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 2,
  },
  tierCircleValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierCircleSubValue: {
    fontSize: 8,
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  tierLargeName: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
