import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { track } from '../../lib/analytics';
import { isOfferDue } from '../../lib/offerPrompt';
import { loadOffer } from '../../lib/offerStore';
import { t } from '../../i18n';

const CORAL = '#FC5454';

// Profile's way back to the welcome offer, next to the plan badge: a small
// gift that wiggles now and then. Shown only while the store has an offer for
// this person, and never to anyone who ever had a plan.
export function OfferGiftChip() {
  const { profile, paywallEnabled } = useAuth();
  const [visible, setVisible] = useState(false);
  // Dev builds only: with no store offer yet, the gift still shows and opens
  // the preview, so the chip can be checked before an offer goes live.
  const [previewOnly, setPreviewOnly] = useState(false);
  const wiggle = useSharedValue(0);
  const glow = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!profile?.id) {
        setVisible(false);
        return;
      }
      (async () => {
        const due = await isOfferDue('banner', { userId: profile.id, paywallEnabled, profile });
        const price = due ? await loadOffer().catch(() => null) : null;
        if (cancelled) return;
        setVisible(!!price || (due && __DEV__));
        setPreviewOnly(!price && __DEV__);
      })();
      return () => { cancelled = true; };
    }, [profile, paywallEnabled]),
  );

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((rm) => {
        if (!alive || rm) return;
        // A quick shake, then a rest; the ring swells with each shake.
        const shake = withSequence(
          withTiming(-14, { duration: 90 }),
          withTiming(12, { duration: 110 }),
          withTiming(-8, { duration: 100 }),
          withTiming(5, { duration: 90 }),
          withTiming(0, { duration: 80 }),
        );
        wiggle.value = withRepeat(withDelay(2600, shake), -1);
        glow.value = withRepeat(
          withDelay(2600, withSequence(
            withTiming(1, { duration: 230, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 600, easing: Easing.in(Easing.cubic) }),
          )),
          -1,
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancelAnimation(wiggle);
      cancelAnimation(glow);
    };
  }, [visible, wiggle, glow]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wiggle.value}deg` }, { scale: 1 + glow.value * 0.12 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.5,
    transform: [{ scale: 1 + glow.value * 0.35 }],
  }));

  if (!visible) return null;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('offer.bannerTitle')}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => {
        track('offer_banner_tapped', {});
        router.push(previewOnly ? '/welcome-offer?trigger=banner&preview=1' : '/welcome-offer?trigger=banner');
      }}
      style={styles.chip}
    >
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <Animated.View style={iconStyle}>
        <MaterialCommunityIcons name="gift" size={11} color={CORAL} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// Same height as the Upgrade pill beside it.
const styles = StyleSheet.create({
  chip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(252,84,84,0.5)',
  },
  ring: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(252,84,84,0.35)',
  },
});
