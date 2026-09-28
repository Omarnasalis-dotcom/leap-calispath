import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import { KIT_EASE } from './kit/AnimatedRing';
import { isRTL } from '../../i18n';

interface Props {
  count: number;
  index: number;
  onIndexChange: (i: number) => void;
  /**
   * Renders card `i`; `active` is true for the centred card. Return a
   * memoized component so cards whose props didn't change skip re-rendering
   * on every swipe.
   */
  renderCard: (i: number, active: boolean) => React.ReactNode;
  cardHeight?: number;
  /** Card width cap (Static 326, Strength 318); shrinks on narrow phones. */
  maxCardWidth?: number;
  /** Opacity of the side cards (Static .42, Strength .45). */
  inactiveOpacity?: number;
  /** Tutorial target wrapper. */
  containerRef?: React.Ref<View>;
  onContainerLayout?: () => void;
}

const GAP = 12;
// The card row mirrors in right-to-left layouts (card 0 on the right), so
// the slide offset and swipe direction flip with it.
const DIR = isRTL ? 1 : -1;
const SWIPE_THRESHOLD = 40;
// Cards further than this from the centred one are off screen: they keep
// their slot but aren't drawn (Strength has ten, each with a large SVG).
const RENDER_WINDOW = 2;

/**
 * Card carousel (Static skills, Strength tiers): centred card at scale 1,
 * neighbours at .92 and reduced opacity; a >40px swipe moves one card, tapping a neighbour
 * selects it, and `index` stays in sync with the skill switch.
 *
 * One Animated.Value (`pos`, native driver) drives translateX and every
 * card's scale/opacity — never mixed with a JS-driven animation.
 *
 * Smoothness: a swipe starts its slide on release, before the parent
 * re-renders for the new index, and every card keeps the same element
 * structure whether centred or not, so changing the centred card never
 * remounts one.
 */
export function SkillCarousel({
  count, index, onIndexChange, renderCard, cardHeight = 306, maxCardWidth = 326, inactiveOpacity = 0.42,
  containerRef, onContainerLayout,
}: Props) {
  const { width } = useWindowDimensions();
  const cardW = Math.min(maxCardWidth, width - 76);
  const step = cardW + GAP;
  const offset = (width - cardW) / 2;

  const pos = useRef(new Animated.Value(DIR * index * step)).current;
  const indexRef = useRef(index);
  indexRef.current = index;
  const stepRef = useRef(step);
  stepRef.current = step;
  // Where `pos` is heading, so the index change a swipe triggers doesn't
  // restart the slide the swipe already started.
  const targetRef = useRef(DIR * index * step);

  const slideTo = (i: number, duration: number) => {
    const toValue = DIR * i * stepRef.current;
    targetRef.current = toValue;
    Animated.timing(pos, { toValue, duration, easing: KIT_EASE, useNativeDriver: true }).start();
  };

  useEffect(() => {
    if (targetRef.current === DIR * index * step) return;
    slideTo(index, 450);
    // slideTo only reads refs and `pos`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step]);

  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  const responder = useMemo(() => PanResponder.create({
    // Only claim clearly-horizontal drags so the page still scrolls vertically.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderGrant: () => {
      pos.stopAnimation();
    },
    onPanResponderMove: (_, g) => {
      pos.setValue(DIR * indexRef.current * stepRef.current + g.dx);
    },
    onPanResponderRelease: (_, g) => {
      const i = indexRef.current;
      let next = i;
      if (Math.abs(g.dx) > SWIPE_THRESHOLD) next = Math.max(0, Math.min(count - 1, i + (g.dx * DIR > 0 ? 1 : -1)));
      slideTo(next, next !== i ? 380 : 300);
      if (next !== i) onIndexChangeRef.current(next);
    },
    onPanResponderTerminate: () => {
      slideTo(indexRef.current, 300);
    },
    // slideTo only reads refs and `pos`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [count, pos]);

  return (
    <View ref={containerRef} onLayout={onContainerLayout} collapsable={false} style={{ height: cardHeight + 12, overflow: 'hidden' }} {...responder.panHandlers}>
      <Animated.View style={{ position: 'absolute', top: 6, left: offset, flexDirection: 'row', gap: GAP, transform: [{ translateX: pos }] }}>
        {Array.from({ length: count }).map((_, i) => (
          <CarouselSlot
            key={i}
            i={i}
            active={i === index}
            visible={Math.abs(i - index) <= RENDER_WINDOW}
            pos={pos}
            step={step}
            cardW={cardW}
            cardHeight={cardHeight}
            inactiveOpacity={inactiveOpacity}
            onSelect={onIndexChangeRef}
          >
            {Math.abs(i - index) <= RENDER_WINDOW ? renderCard(i, i === index) : null}
          </CarouselSlot>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * One card slot. The wrapper is identical for the centred card and its
 * neighbours (only `disabled`/`pointerEvents` change), so a card is never
 * unmounted and rebuilt when it becomes, or stops being, the centred one.
 */
function CarouselSlot({ i, active, visible, pos, step, cardW, cardHeight, inactiveOpacity, onSelect, children }: {
  i: number; active: boolean; visible: boolean; pos: Animated.Value; step: number; cardW: number; cardHeight: number;
  inactiveOpacity: number; onSelect: React.MutableRefObject<(i: number) => void>; children: React.ReactNode;
}) {
  const { scale, opacity } = useMemo(() => {
    const range = [DIR * i * step - step, DIR * i * step, DIR * i * step + step];
    return {
      scale: pos.interpolate({ inputRange: range, outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' }),
      opacity: pos.interpolate({ inputRange: range, outputRange: [inactiveOpacity, 1, inactiveOpacity], extrapolate: 'clamp' }),
    };
  }, [pos, i, step, inactiveOpacity]);

  return (
    <Animated.View
      // Android: animate a cached bitmap instead of redrawing the card (and
      // its SVGs) on every frame of the slide.
      renderToHardwareTextureAndroid
      style={{ width: cardW, height: cardHeight, transform: [{ scale }], opacity }}
    >
      {visible && (
        <Pressable
          // Centred: not a button itself, so screen readers reach the
          // card's own buttons instead of one merged element.
          accessible={!active}
          accessibilityRole={active ? undefined : 'button'}
          disabled={active}
          style={{ flex: 1 }}
          onPress={() => onSelect.current(i)}
        >
          <View pointerEvents={active ? 'auto' : 'none'} style={{ flex: 1 }}>{children}</View>
        </Pressable>
      )}
    </Animated.View>
  );
}
