import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { TIER_NAMES, POWER_TIER_NAMES } from '../../types';

interface TierSelectorRowProps {
  category: 'strength' | 'power';
  selectedTier: number;
  activeCurrentTier: number;
  theme: any;
  tierScrollRef: React.RefObject<ScrollView>;
  onSelectTier: (tier: number) => void;
}

export function TierSelectorRow({
  category,
  selectedTier,
  activeCurrentTier,
  theme,
  tierScrollRef,
  onSelectTier,
}: TierSelectorRowProps) {
  return (
    <View style={styles.tierSelectorSection}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: theme.accent }]} />
        <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
          {category === 'power' ? 'POWER TIERS' : 'STRENGTH TIERS'}
        </Text>
      </View>
      <ScrollView
        ref={tierScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tierList}
      >
        {Object.entries(category === 'strength' ? TIER_NAMES : POWER_TIER_NAMES).map(([index, name]) => {
          const tierIndex = parseInt(index);
          const isSelected = selectedTier === tierIndex;
          const isCurrent = activeCurrentTier === tierIndex;
          const isLockedItem = tierIndex > activeCurrentTier;
          return (
            <TouchableOpacity
              key={index}
              onPress={() => onSelectTier(tierIndex)}
              style={[
                styles.tierItemContainer,
                isSelected && !isCurrent && { borderColor: theme.accent, borderWidth: 2 }
              ]}
            >
              <View style={[
                styles.tierItemContent,
                isCurrent ? { backgroundColor: theme.accent } :
                  isLockedItem ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' } :
                    { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.accent }
              ]}>
                <Text style={[
                  styles.tierItemName,
                  { color: isCurrent ? '#FFFFFF' : isLockedItem ? theme.text.tertiary : theme.accent, letterSpacing: 1 }
                ]}>
                  {name.toUpperCase()}
                </Text>
                <Text style={[
                  styles.tierItemNumber,
                  { color: isCurrent ? 'rgba(255,255,255,0.7)' : isLockedItem ? theme.text.tertiary + '80' : theme.accent + '90', letterSpacing: 1 }
                ]}>
                  Tier {index}
                </Text>
                {isLockedItem && (
                  <View style={styles.lockOverlay}>
                    <Text style={{ fontSize: 8 }}>🔒</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tierSelectorSection: {
    marginTop: 10,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  tierList: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 10,
  },
  tierItemContainer: {
    minWidth: 90,
    height: 48,
    borderRadius: 12,
    position: 'relative',
  },
  tierItemContent: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  tierItemName: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    textAlign: 'center',
  },
  tierItemNumber: {
    fontSize: 9,
    fontFamily: 'PlusJakartaSans-Bold',
    marginTop: 1,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
