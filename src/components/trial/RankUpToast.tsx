import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity } from 'react-native';

const ACCENT = '#FF5252';
const AUTO_DISMISS_MS = 3000;

interface RankUpToastProps {
  tierName: string;
  onDismiss: () => void;
}

// A small, non-blocking banner shown over the lane right as it reappears
// after RankUpReveal's full-screen celebration -- ties the rank just earned
// to the card that just unlocked underneath it (that unlock's own visual is
// NodeCircle's existing mount-pop/achievement-burst, this just labels it).
// Auto-dismisses; a tap dismisses early too.
export function RankUpToast({ tierName, onDismiss }: RankUpToastProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const dismissTimer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 250, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(onDismiss);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePress() {
    Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(onDismiss);
  }

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.wrap}>
      <Animated.View
        style={[
          styles.banner,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          },
        ]}
      >
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.text}>
          You're now a <Text style={styles.tierName}>{tierName}</Text>! Keep it up.
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.35)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  emoji: {
    fontSize: 18,
  },
  text: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 13,
  },
  tierName: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
});
