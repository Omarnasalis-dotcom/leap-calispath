import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import { KIT_EASE } from './kit/AnimatedRing';

interface Props {
  count: number;
  index: number;
  onIndexChange: (i: number) => void;
  /** Renders card `i`; `active` is true for the centred card. */
  renderCard: (i: number, active: boolean) => React.ReactNode;
  cardHeight?: number;
  /** Tutorial target wrapper. */
  containerRef?: React.Ref<View>;
  onContainerLayout?: () => void;
}

const MAX_CARD_WIDTH = 326;
const GAP = 12;
const SWIPE_THRESHOLD = 40;

/**
 * Static skill carousel (handoff §1.2): centred card at scale 1, neighbours
 * at .92 / 42% opacity; a >40px swipe moves one card, tapping a neighbour
 * selects it, and `index` stays in sync with the skill switch.
 *
 * One Animated.Value (`pos`, native driver) drives translateX and every
 * card's scale/opacity — never mixed with a JS-driven animation.
 */
export function SkillCarousel({
  count, index, onIndexChange, renderCard, cardHeight = 306, containerRef, onContainerLayout,
}: Props) {
  const { width } = useWindowDimensions();
  const cardW = Math.min(MAX_CARD_WIDTH, width - 76);
  const step = cardW + GAP;
  const offset = (width - cardW) / 2;

  const pos = useRef(new Animated.Value(-index * step)).current;
  const indexRef = useRef(index);
  indexRef.current = index;
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    Animated.timing(pos, { toValue: -index * step, duration: 450, easing: KIT_EASE, useNativeDriver: true }).start();
  }, [index, step, pos]);

  const responder = useMemo(() => PanResponder.create({
    // Only claim clearly-horizontal drags so the page still scrolls vertically.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderMove: (_, g) => {
      pos.setValue(-indexRef.current * stepRef.current + g.dx);
    },
    onPanResponderRelease: (_, g) => {
      const i = indexRef.current;
      let next = i;
      if (Math.abs(g.dx) > SWIPE_THRESHOLD) next = Math.max(0, Math.min(count - 1, i + (g.dx < 0 ? 1 : -1)));
      if (next !== i) onIndexChange(next);
      else Animated.timing(pos, { toValue: -i * stepRef.current, duration: 300, easing: KIT_EASE, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => {
      Animated.timing(pos, { toValue: -indexRef.current * stepRef.current, duration: 300, easing: KIT_EASE, useNativeDriver: true }).start();
    },
  }), [count, onIndexChange, pos]);

  return (
    <View ref={containerRef} onLayout={onContainerLayout} collapsable={false} style={{ height: cardHeight + 12, overflow: 'hidden' }} {...responder.panHandlers}>
      <Animated.View style={{ position: 'absolute', top: 6, left: offset, flexDirection: 'row', gap: GAP, transform: [{ translateX: pos }] }}>
        {Array.from({ length: count }).map((_, i) => {
          const range = [-(i + 1) * step, -i * step, -(i - 1) * step];
          const scale = pos.interpolate({ inputRange: range, outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' });
          const opacity = pos.interpolate({ inputRange: range, outputRange: [0.42, 1, 0.42], extrapolate: 'clamp' });
          const active = i === index;
          return (
            <Animated.View key={i} style={{ width: cardW, height: cardHeight, transform: [{ scale }], opacity }}>
              {active ? renderCard(i, true) : (
                <Pressable accessibilityRole="button" style={{ flex: 1 }} onPress={() => onIndexChange(i)}>
                  <View pointerEvents="none" style={{ flex: 1 }}>{renderCard(i, false)}</View>
                </Pressable>
              )}
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}
