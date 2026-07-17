import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TIER_NAMES, POWER_TIER_NAMES } from '../../types';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { WORLD_THEMES, WORLD_NEUTRALS, worldRgba } from '../../../constants/worldThemes';

interface TierSelectorRowProps {
  scrollRef?: React.RefObject<ScrollView | null>;
  category: 'strength' | 'power';
  selectedTier: number;
  activeCurrentTier: number;
  theme: any;
  tierScrollRef: React.RefObject<ScrollView | null>;
  onSelectTier: (tier: number) => void;
}

const CHIP_WIDTH = 92;
const CHIP_GAP = 10;
const FADE_WIDTH = 36;

/**
 * Horizontal tier chip row with three explicit states per the design
 * handoff — complete (green check), current (accent glow), locked (padlock +
 * what unlocks it) — plus a fade + arrow hint so the row never just crops at
 * the screen edge.
 */
export function TierSelectorRow({
  scrollRef,
  category,
  selectedTier,
  activeCurrentTier,
  theme,
  tierScrollRef,
  onSelectTier,
}: TierSelectorRowProps) {
  const W = WORLD_THEMES.strength;
  // Position the row at the user's current tier on first layout instead of
  // starting at tier 0 and animating over — avoids a visible flash of tier 0
  // before the (delayed, animated) scroll-to-current-tier effect fires.
  const ITEM_WIDTH = CHIP_WIDTH + CHIP_GAP;
  const initialOffset = Math.max(0, activeCurrentTier * ITEM_WIDTH);
  // useScreenMeasure=true: see useTutorialTarget's own comment.
  const { ref, onLayout, reportInteraction } = useTutorialTarget('strength.tierChips', scrollRef, true);

  const [showHint, setShowHint] = useState(false);
  const contentWidth = useRef(0);
  const viewWidth = useRef(0);

  const updateHint = useCallback((scrollX: number) => {
    const overflow = contentWidth.current - viewWidth.current;
    setShowHint(overflow > 8 && scrollX < overflow - 8);
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => updateHint(e.nativeEvent.contentOffset.x),
    [updateHint]
  );

  const onContentSizeChange = useCallback(
    (w: number) => {
      contentWidth.current = w;
      updateHint(initialOffset);
    },
    [updateHint, initialOffset]
  );

  const onRowLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewWidth.current = e.nativeEvent.layout.width;
      updateHint(initialOffset);
    },
    [updateHint, initialOffset]
  );

  return (
    <View style={styles.tierSelectorSection} ref={ref} onLayout={onLayout}>
      <Text style={styles.sectionTitle}>
        {category === 'power' ? 'POWER TIERS' : 'STRENGTH TIERS'}
      </Text>
      <View onLayout={onRowLayout}>
        <ScrollView
          ref={tierScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tierList}
          contentOffset={{ x: initialOffset, y: 0 }}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onContentSizeChange={onContentSizeChange}
        >
          {Object.entries(category === 'strength' ? TIER_NAMES : POWER_TIER_NAMES).map(([index, name]) => {
            const tierIndex = parseInt(index);
            const isSelected = selectedTier === tierIndex;
            const isCurrent = activeCurrentTier === tierIndex;
            const isComplete = tierIndex < activeCurrentTier;
            const isLockedItem = tierIndex > activeCurrentTier;

            return (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  onSelectTier(tierIndex);
                  reportInteraction();
                }}
                style={[
                  styles.chip,
                  isComplete && styles.chipComplete,
                  isCurrent && [styles.chipCurrent, { borderColor: W.accent, backgroundColor: worldRgba(W.accent, 0.16), shadowColor: W.accent }],
                  isLockedItem && styles.chipLocked,
                  isSelected && !isCurrent && { borderColor: WORLD_NEUTRALS.textPrimary },
                ]}
              >
                {isComplete && (
                  <MaterialCommunityIcons name="check" size={13} color={WORLD_NEUTRALS.complete} />
                )}
                {isLockedItem && (
                  <MaterialCommunityIcons name="lock" size={12} color={WORLD_NEUTRALS.textMuted} />
                )}
                <Text
                  style={[
                    styles.chipName,
                    isComplete && { color: WORLD_NEUTRALS.textPrimary },
                    isCurrent && { color: W.accent },
                    isLockedItem && { color: WORLD_NEUTRALS.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {name.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.chipCaption,
                    isComplete && { color: WORLD_NEUTRALS.complete },
                    isCurrent && { color: worldRgba(W.accent, 0.8) },
                  ]}
                  numberOfLines={1}
                >
                  {isComplete ? 'COMPLETE' : isCurrent ? 'CURRENT' : `AT TIER ${tierIndex}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {showHint && (
          <View pointerEvents="none" style={styles.hint}>
            <LinearGradient
              colors={[worldRgba(W.pageBg, 0), W.pageBg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <MaterialCommunityIcons name="chevron-right" size={16} color={WORLD_NEUTRALS.textSecondary} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tierSelectorSection: {
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  tierList: {
    paddingHorizontal: 20,
    gap: CHIP_GAP,
    paddingBottom: 10,
  },
  chip: {
    width: CHIP_WIDTH,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: WORLD_NEUTRALS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 2,
  },
  chipComplete: {
    borderColor: worldRgba(WORLD_NEUTRALS.complete, 0.4),
    backgroundColor: worldRgba(WORLD_NEUTRALS.complete, 0.08),
  },
  chipCurrent: {
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  chipLocked: {
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    opacity: 0.55,
  },
  chipName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: WORLD_NEUTRALS.textPrimary,
    textAlign: 'center',
  },
  chipCaption: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
    color: WORLD_NEUTRALS.textMuted,
  },
  hint: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 10,
    width: FADE_WIDTH,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
