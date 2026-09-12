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
import { getWorldTheme, getWorldNeutrals, worldRgba, worldLighten } from '../../../constants/worldThemes';
import { useTheme } from '../../contexts/ThemeContext';

const BADGE_SIZE = 30;

interface TierSelectorRowProps {
  scrollRef?: React.RefObject<ScrollView | null>;
  category: 'strength' | 'power';
  selectedTier: number;
  activeCurrentTier: number;
  theme: any;
  tierScrollRef: React.RefObject<ScrollView | null>;
  onSelectTier: (tier: number) => void;
}

const CHIP_WIDTH = 96;
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
  const { mode } = useTheme();
  const W = getWorldTheme('strength', mode);
  const neutrals = getWorldNeutrals(mode);
  // Matches the design handoff's documented "inactive UI border" token
  // (rgba(255,255,255,0.14–0.16)) — a lower value here previously made the
  // resting/locked chips read as barely-there and "maybe not tappable"
  // against the near-black page background.
  const lockedBorder = mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)';
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
      <Text style={[styles.sectionTitle, { color: neutrals.textSecondary }]}>
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

            // The card itself is a real tonal surface (theme.card.background,
            // the app's own "Surface" token) rather than a translucent
            // overlay on the page background -- flat alpha-blends read thin;
            // an actual elevated surface color reads considered. Border
            // color is what shifts per state.
            //
            // Badge fill is a subtle top-left highlight -> base color
            // gradient (a glossy "coin/medallion" treatment), not a flat
            // fill -- this is the one deliberately decorative gradient in
            // the system, reserved for a small functional badge rather than
            // text or a whole card (still respects the "no gradient hero
            // cards" rule). Current is the one state allowed a colored
            // background + glow on the card too, per DESIGN.md's "earn the
            // drama" rule: reserve bold color for the one moment that
            // matters (where the user actually is), not decoration on every chip.
            const badgeColors: [string, string] = isComplete
              ? [worldLighten(neutrals.complete, 0.35), neutrals.complete]
              : isCurrent
                ? [worldLighten(W.accent, 0.3), W.accent]
                : [lockedBorder, lockedBorder];
            const badgeTextColor = isComplete ? '#0A0A0A' : isCurrent ? W.ctaText : neutrals.textMuted;

            return (
              <TouchableOpacity
                key={index}
                activeOpacity={0.75}
                onPress={() => {
                  onSelectTier(tierIndex);
                  reportInteraction();
                }}
                style={[
                  styles.chip,
                  { borderColor: neutrals.border, backgroundColor: theme.card.background },
                  isComplete && [styles.chipComplete, { borderColor: worldRgba(neutrals.complete, 0.5) }],
                  isCurrent && [styles.chipCurrent, { borderColor: W.accent, backgroundColor: worldRgba(W.accent, 0.1), shadowColor: W.accent }],
                  isLockedItem && [styles.chipLocked, { borderColor: lockedBorder }],
                  isSelected && !isCurrent && { borderColor: neutrals.textPrimary },
                ]}
              >
                <LinearGradient
                  colors={badgeColors}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={[styles.badge, isLockedItem && { borderWidth: 1, borderColor: lockedBorder }]}
                >
                  <Text style={[styles.badgeNumber, { color: badgeTextColor }]}>{tierIndex}</Text>
                </LinearGradient>
                <Text
                  style={[
                    styles.chipName,
                    { color: neutrals.textPrimary },
                    isComplete && { color: neutrals.textPrimary },
                    isCurrent && { color: W.accent },
                    isLockedItem && { color: neutrals.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {name.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.chipCaption,
                    { color: neutrals.textMuted },
                    isComplete && { color: neutrals.complete },
                    isCurrent && { color: worldRgba(W.accent, 0.8) },
                  ]}
                  numberOfLines={1}
                >
                  {isComplete ? 'COMPLETE' : isCurrent ? 'CURRENT' : 'LOCKED'}
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
            <MaterialCommunityIcons name="chevron-right" size={16} color={neutrals.textSecondary} />
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
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 4,
  },
  chipComplete: {},
  chipCurrent: {
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  chipLocked: {
    opacity: 0.55,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  badgeNumber: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 15,
  },
  chipName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
  },
  chipCaption: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
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
