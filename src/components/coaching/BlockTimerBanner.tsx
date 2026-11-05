import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { BlockTimerKind } from '../../hooks/useBlockTimer';
import { t } from '../../i18n';

export const BLOCK_TIMER_BANNER_MS = 6000;

export interface BlockTimerBannerData {
  blockId: string | number;
  blockName: string;
  kind: BlockTimerKind;
  /** Differs per ending, so a second one restarts the hide timer. */
  id: number;
}

const title = (kind: BlockTimerKind) =>
  kind === 'rest' ? t('timerAlerts.restOver')
    : kind === 'hold' ? t('timerAlerts.holdDone')
      : kind === 'amrap' ? t('timerAlerts.timeUp')
        : t('timerAlerts.capReached');

/**
 * A timer ended on a block that isn't open. Tap to open that block; hides by
 * itself. Render it last inside the screen root; `banner` null hides it.
 */
export function BlockTimerBanner({ banner, onOpen, onDismiss }: {
  banner: BlockTimerBannerData | null;
  onOpen: (blockId: string | number) => void;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const id = banner?.id;

  useEffect(() => {
    if (id == null) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(onDismiss, BLOCK_TIMER_BANNER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!banner) return null;
  return (
    <Animated.View accessibilityLiveRegion="polite" style={[styles.wrap, { top: insets.top + 8, opacity, backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${title(banner.kind)}, ${banner.blockName}`}
        activeOpacity={0.8}
        style={styles.row}
        onPress={() => {
          onOpen(banner.blockId);
          onDismiss();
        }}
      >
        <MaterialCommunityIcons name="timer-check-outline" size={22} color="#FF5252" />
        <View style={styles.texts}>
          <Text style={[styles.title, { color: theme.text.primary }]} numberOfLines={1}>{title(banner.kind)}</Text>
          <Text style={[styles.block, { color: theme.text.secondary }]} numberOfLines={1}>{banner.blockName}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  texts: { flex: 1 },
  title: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 15 },
  block: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13, marginTop: 1 },
});
