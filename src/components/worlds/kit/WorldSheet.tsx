import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { KIT_EASE } from './AnimatedRing';
import { KitCloseButton } from './KitButton';
import { kt } from './type';

interface Props {
  tokens: WorldKitTokens;
  visible: boolean;
  /** Close request (scrim, ✕, Android back). The screen may refuse, e.g. mid-timer. */
  onClose: () => void;
  /** 'log' = auto height up to 88% · 'board' = fixed 90%, darker bg (§0.7, §0.8). */
  variant: 'log' | 'board';
  kicker: React.ReactNode;
  title: string;
  children: React.ReactNode;
  /** Pinned below the scroll area (leaderboard "you" bar). */
  footer?: React.ReactNode;
  /** Rendered last at the Modal root, above the sheet (PB-overwrite confirm, toast). */
  overlay?: React.ReactNode;
  scrollEnabled?: boolean;
}

/**
 * The world screens' ONE native Modal host. A screen renders a single
 * <WorldSheet> and swaps its content (log sheet ↔ leaderboard) instead of
 * mounting a second Modal — two Modals swapping in one commit is the
 * Android Fabric "child already has a parent" crash (e6cda92 / 4461569),
 * and two open at once can freeze iOS. Stays mounted through its own exit
 * animation, so callers should wait ~250ms before showing another Modal
 * (e.g. CelebrationBanner).
 */
export function WorldSheet({
  tokens: t, visible, onClose, variant, kicker, title, children, footer, overlay, scrollEnabled = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  // Native-driven only (opacity + translateY) — never shares a Value with a JS-driven animation.
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 280, easing: KIT_EASE, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 200, easing: KIT_EASE, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const screenH = Dimensions.get('window').height;
  const board = variant === 'board';

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, backgroundColor: t.scrim, opacity: anim }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable accessibilityLabel="Close sheet" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
          <Animated.View
            style={{
              ...(board ? { height: '90%' } : { maxHeight: '88%' }),
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: board ? t.boardBg : t.sheetBg,
              borderTopWidth: 1,
              borderColor: t.tintBorder,
              overflow: 'hidden',
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [screenH * 0.5, 0] }) }],
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.grabber, alignSelf: 'center', marginTop: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: board ? 14 : 16, paddingHorizontal: 24, gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {typeof kicker === 'string'
                  ? <Text style={kt('medium', 10.5, t.textMuted, 2)} numberOfLines={1}>{kicker}</Text>
                  : kicker}
                <Text style={[kt('bold', board ? 26 : 24, t.text, board ? 1.4 : 1.2, board ? 29 : 27), { marginTop: 3 }]} numberOfLines={2}>
                  {title}
                </Text>
              </View>
              <KitCloseButton tokens={t} onPress={onClose} />
            </View>
            <ScrollView
              style={board ? { flex: 1 } : undefined}
              contentContainerStyle={{ paddingBottom: footer ? 20 : 30 + insets.bottom }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEnabled={scrollEnabled}
            >
              {children}
            </ScrollView>
            {footer && (
              <View style={{ paddingTop: 12, paddingHorizontal: 24, paddingBottom: 14 + insets.bottom, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: board ? t.boardBg : t.sheetBg }}>
                {footer}
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
        {overlay}
      </Animated.View>
    </Modal>
  );
}
