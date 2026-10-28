import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRTL, t } from '../i18n';

export const UNDO_WINDOW_MS = 7000;

const CORAL = '#FF5252';

/**
 * A bottom toast with an UNDO button and a bar that empties over
 * UNDO_WINDOW_MS, then hides (onExpire). Render it last inside the screen
 * root; `message` null hides it.
 */
export function UndoToast({ message, onUndo, onExpire, busy = false }: {
  message: string | null;
  onUndo: () => void;
  onExpire: () => void;
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    progress.setValue(1);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    Animated.timing(progress, { toValue: 0, duration: UNDO_WINDOW_MS, easing: Easing.linear, useNativeDriver: true }).start();
    const timer = setTimeout(onExpire, UNDO_WINDOW_MS);
    return () => {
      clearTimeout(timer);
      progress.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom: insets.bottom + 24, opacity }]}
    >
      <View style={styles.row}>
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onUndo}
          disabled={busy}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={busy ? { opacity: 0.5 } : undefined}
        >
          <Text style={styles.undo}>{t('common.undo')}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.bar, { transformOrigin: isRTL ? 'right' : 'left', transform: [{ scaleX: progress }] }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    borderRadius: 14,
    backgroundColor: '#1E1E1E',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  text: { flex: 1, color: '#FFFFFF', fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14 },
  undo: { color: CORAL, fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 14, letterSpacing: 1 },
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  bar: { height: 3, backgroundColor: CORAL },
});
