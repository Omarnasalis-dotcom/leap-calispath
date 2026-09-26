import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { kt } from './type';

/**
 * Accent toast (handoff §0.7): shows `message`, auto-hides after `duration`
 * then calls onHide. Absolutely positioned — render it last inside the screen
 * root or inside WorldSheet's `overlay` (never as its own Modal).
 */
export function WorldToast({ tokens: t, message, onHide, duration = 2200 }: {
  tokens: WorldKitTokens; message: string | null; onHide: () => void; duration?: number;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<string | null>(message);

  useEffect(() => {
    if (!message) return;
    setShown(message);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onHide());
    }, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message && !shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute', left: 24, right: 24, top: insets.top + 16, zIndex: 20,
        height: 52, borderRadius: 16, backgroundColor: t.accent,
        alignItems: 'center', justifyContent: 'center', opacity,
        shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 12 }, elevation: 12,
      }}
    >
      <Text style={kt('semibold', 14, t.onAccent, 1.4)}>{shown}</Text>
    </Animated.View>
  );
}
