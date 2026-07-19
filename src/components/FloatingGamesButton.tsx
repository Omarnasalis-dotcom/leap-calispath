import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';

const SIZE = 48;
const MARGIN = 16;
// Keeps the resting/drag area clear of ProfileScreen's docked BottomTabBar,
// which isn't part of this overlay's own measured bounds.
const BOTTOM_CLEARANCE = 100;
const DRAG_THRESHOLD = 6;

const MENU_WIDTH = 190;
const MENU_ROW_HEIGHT = 48;
const MENU_GAP = 8;

// Three rings pulsing out from the button, staggered so they read as a
// continuous wave rather than one ring flashing in sync.
const WAVE_COUNT = 3;
const WAVE_DURATION = 1800;
const WAVE_GAP = 500;
const WAVE_STAGGER = 600;

const GAMES: { icon: string; label: string; route: string }[] = [
  { icon: '🪜', label: 'Beat the Plank', route: '/beat-the-plank' },
  { icon: '🧠', label: 'Guess the Skill', route: '/guess-the-skill' },
];

export function FloatingGamesButton() {
  const { theme } = useTheme();
  const router = useRouter();
  // Ref, not state: onPanResponderRelease is a closure created once via
  // useRef(PanResponder.create(...)) and never rebuilt, so reading state here
  // would always see the value from the first render. A ref stays fresh.
  const boundsRef = useRef({ width: 0, height: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const lastPosition = useRef({ x: 0, y: 0 });
  const dragDistance = useRef(0);
  const isPositioned = useRef(false);
  const waves = useRef([...Array(WAVE_COUNT)].map(() => new Animated.Value(0))).current;
  const menuAnim = useRef(new Animated.Value(0)).current;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const loops = waves.map((wave, i) =>
      Animated.sequence([
        Animated.delay(i * WAVE_STAGGER),
        Animated.loop(
          Animated.sequence([
            Animated.timing(wave, {
              toValue: 1,
              duration: WAVE_DURATION,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(wave, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.delay(WAVE_GAP),
          ])
        ),
      ])
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [waves]);

  useEffect(() => {
    if (!menuOpen) return;
    menuAnim.setValue(0);
    Animated.spring(menuAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 7 }).start();
  }, [menuOpen, menuAnim]);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    boundsRef.current = { width, height };
    if (!isPositioned.current && width > 0 && height > 0) {
      isPositioned.current = true;
      const start = { x: MARGIN, y: MARGIN };
      lastPosition.current = start;
      pan.setValue(start);
      opacity.setValue(1);
    }
  }

  function finalizeDrag(dx: number, dy: number) {
    const { width, height } = boundsRef.current;
    const maxX = Math.max(width - SIZE - MARGIN, MARGIN);
    const maxY = Math.max(height - SIZE - BOTTOM_CLEARANCE, MARGIN);
    const clampedX = Math.min(Math.max(lastPosition.current.x + dx, MARGIN), maxX);
    const clampedY = Math.min(Math.max(lastPosition.current.y + dy, MARGIN), maxY);
    lastPosition.current = { x: clampedX, y: clampedY };

    Animated.spring(pan, {
      toValue: { x: clampedX, y: clampedY },
      useNativeDriver: false,
      friction: 7,
      tension: 50,
    }).start();

    if (dragDistance.current < DRAG_THRESHOLD) {
      setMenuAnchor({ x: clampedX, y: clampedY });
      setMenuOpen((open) => !open);
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragDistance.current = 0;
        pan.setOffset(lastPosition.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        dragDistance.current += Math.abs(gesture.dx) + Math.abs(gesture.dy);
        // Dragging away while the menu is open closes it — the anchor no
        // longer matches the bubble once it moves.
        if (dragDistance.current >= DRAG_THRESHOLD) {
          setMenuOpen(false);
        }
        pan.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        pan.flattenOffset();
        finalizeDrag(gesture.dx, gesture.dy);
      },
      onPanResponderTerminate: (_, gesture) => {
        pan.flattenOffset();
        finalizeDrag(gesture.dx, gesture.dy);
      },
    })
  ).current;

  function handleSelectGame(route: string) {
    setMenuOpen(false);
    router.push(route as any);
  }

  // Flip the menu to whichever side of the bubble has room, so it never
  // clips off-screen no matter where the bubble was dragged.
  const menuHeight = GAMES.length * MENU_ROW_HEIGHT;
  const { width: boundsWidth, height: boundsHeight } = boundsRef.current;
  const menuLeft =
    menuAnchor.x + MENU_WIDTH + MARGIN <= boundsWidth
      ? menuAnchor.x
      : Math.max(menuAnchor.x + SIZE - MENU_WIDTH, MARGIN);
  const menuTop =
    menuAnchor.y + SIZE + MENU_GAP + menuHeight + BOTTOM_CLEARANCE <= boundsHeight
      ? menuAnchor.y + SIZE + MENU_GAP
      : Math.max(menuAnchor.y - MENU_GAP - menuHeight, MARGIN);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={handleLayout}>
      {menuOpen && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <Animated.View
            style={[
              styles.menu,
              {
                left: menuLeft,
                top: menuTop,
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
                opacity: menuAnim,
                transform: [{ scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              },
            ]}
          >
            {GAMES.map((game) => (
              <TouchableOpacity key={game.route} style={styles.menuRow} onPress={() => handleSelectGame(game.route)}>
                <Text style={styles.menuIcon}>{game.icon}</Text>
                <Text style={[styles.menuLabel, { color: theme.text.primary }]}>{game.label}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </>
      )}

      <Animated.View style={[styles.dragContainer, { opacity, transform: pan.getTranslateTransform() }]}>
        {waves.map((wave, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.wave,
              {
                borderColor: theme.accent,
                opacity: wave.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
              },
            ]}
          />
        ))}

        <View style={[styles.bubble, { backgroundColor: theme.accent }]} {...panResponder.panHandlers}>
          <Text style={styles.icon}>🎮</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dragContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  bubble: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    fontSize: 22,
  },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: MENU_ROW_HEIGHT,
    paddingHorizontal: 14,
  },
  menuIcon: {
    fontSize: 18,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
});
