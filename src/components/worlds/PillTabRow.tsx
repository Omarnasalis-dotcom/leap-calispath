import React, { useCallback, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WORLD_NEUTRALS, WorldTheme, worldRgba } from '../../../constants/worldThemes';

export interface PillTabItem {
  key: string;
  label: string;
  /** Optional decorative emoji prefix (handoff keeps 👑 on the "overall" tab). */
  emoji?: string;
  locked?: boolean;
}

interface PillTabRowProps {
  world: WorldTheme;
  items: PillTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /**
   * Small label above the row ("TIER" / "SKILL") — the Static screen's fix
   * for two visually-identical rows with no indication of what they control.
   */
  label?: string;
  /** 'outline': accent border + translucent fill. 'solid': accent fill + dark text. */
  activeStyle?: 'outline' | 'solid';
  style?: ViewStyle;
}

const FADE_WIDTH = 36;

/**
 * Horizontally scrollable pill-tab row with a fade + arrow scroll hint on the
 * right edge (design handoff: rows must never just crop at the screen edge).
 */
export function PillTabRow({ world, items, activeKey, onSelect, label, activeStyle = 'outline', style }: PillTabRowProps) {
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
      updateHint(0);
    },
    [updateHint]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewWidth.current = e.nativeEvent.layout.width;
      updateHint(0);
    },
    [updateHint]
  );

  return (
    <View style={style}>
      {label && <Text style={styles.rowLabel}>{label}</Text>}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onContentSizeChange={onContentSizeChange}
          onLayout={onLayout}
          contentContainerStyle={styles.content}
        >
          {items.map((item) => {
            const active = item.key === activeKey;
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.8}
                onPress={() => onSelect(item.key)}
                style={[
                  styles.pill,
                  active
                    ? activeStyle === 'solid'
                      ? { backgroundColor: world.accent, borderColor: world.accent }
                      : { backgroundColor: worldRgba(world.accent, 0.12), borderColor: world.accent }
                    : styles.pillInactive,
                  item.locked && styles.pillLocked,
                ]}
              >
                {item.locked && (
                  <MaterialCommunityIcons name="lock" size={11} color={WORLD_NEUTRALS.textMuted} style={{ marginRight: 4 }} />
                )}
                <Text
                  style={[
                    styles.pillText,
                    active
                      ? { color: activeStyle === 'solid' ? world.ctaText : world.accent }
                      : styles.pillTextInactive,
                  ]}
                >
                  {item.emoji ? `${item.emoji} ${item.label}` : item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {showHint && (
          <View pointerEvents="none" style={styles.hint}>
            <LinearGradient
              colors={[worldRgba(world.pageBg, 0), world.pageBg]}
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
  rowLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  content: {
    paddingHorizontal: 20,
    gap: 10,
    alignItems: 'center',
  },
  pill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillInactive: {
    borderColor: WORLD_NEUTRALS.borderStrong,
    backgroundColor: 'transparent',
  },
  pillLocked: {
    opacity: 0.55,
  },
  pillText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
  pillTextInactive: {
    color: WORLD_NEUTRALS.textSecondary,
  },
  hint: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: FADE_WIDTH,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
