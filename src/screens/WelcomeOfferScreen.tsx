import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { cancelAnimation, Easing, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { track } from '../lib/analytics';
import { markOfferSeen, type OfferPrice, type OfferTrigger } from '../lib/offerPrompt';
import { loadOffer } from '../lib/offerStore';
import { isRTL, t } from '../i18n';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, seg } from '../lib/fx/easing';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

type State = { phase: 'loading' } | { phase: 'ready'; price: OfferPrice };

// Dev builds only (Settings → Preview welcome offer): the screen with sample
// prices, to check the layout before the store has a live offer.
const PREVIEW_PRICE: OfferPrice = { regular: 'E£1,299.00', intro: 'E£999.99', percentOff: 23, months: 2 };

interface Props {
  trigger: OfferTrigger;
  preview?: boolean;
}

export function WelcomeOfferScreen({ trigger, preview = false }: Props) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const { profile } = useAuth();
  const isMounted = useMountedRef();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const left = useRef(false);

  // Back to wherever the screen was opened from (the Journey lane, the
  // workout runner or Profile).
  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }, []);

  useEffect(() => {
    if (preview && __DEV__) {
      setState({ phase: 'ready', price: PREVIEW_PRICE });
      return;
    }
    (async () => {
      try {
        const price = await loadOffer();
        if (!isMounted.current) return;
        if (!price) {
          // No offer for this person (or none set up): nothing to show.
          leave();
          return;
        }
        // Counts as shown once the offer is on screen: it never comes back for this moment.
        if (profile?.id && trigger !== 'banner') markOfferSeen(profile.id, trigger);
        track('offer_screen_viewed', { trigger, percent_off: price.percentOff });
        setState({ phase: 'ready', price });
      } catch (err) {
        console.warn('[WelcomeOffer] could not load the offer:', err);
        if (isMounted.current) leave();
      }
    })();
    // Runs once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    track('offer_dismissed', { trigger });
    leave();
  };

  // The paywall and the code screen take this screen's place, so closing
  // them returns to where the offer was opened from.
  const claim = () => {
    track('offer_claim_tapped', { trigger });
    left.current = true;
    router.replace(`/paywall?from=welcome_offer_${trigger}` as never);
  };

  const enterCode = () => {
    track('offer_code_tapped', { trigger });
    left.current = true;
    router.replace('/redeem-code');
  };

  const title =
    trigger === 'program_complete' ? t('offer.titleProgramDone')
    : trigger === 'banner' ? t('offer.titleBanner')
    : t('offer.titleWelcome');

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ width: 26 }} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('offer.close')}
          onPress={dismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="close" size={26} color={c.textPrimary} />
        </TouchableOpacity>
      </View>

      {state.phase === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.coral} />
        </View>
      ) : (
        <OfferContent
          price={state.price}
          title={title}
          styles={styles}
          c={c}
          onClaim={claim}
          onCode={enterCode}
          onLater={dismiss}
        />
      )}
    </View>
  );
}

// ── The reveal ────────────────────────────────────────────────────────────
// One clock (seconds) drives every beat: the gift pops, the card rises, the
// old price is struck through, the new price lands, the badge stamps in,
// then the rest follows and a shine passes over the button now and then.
const CLOCK_END = 600;
const SETTLED = 2.1;
const PRICE_AT = 1.0;
const SHINE_FROM = 2.4;
const SHINE_EVERY = 3.2;
const SHINE_DUR = 0.75;
const SHINE_W = 70;

type Styles = ReturnType<typeof getStyles>;

function useFadeUp(clock: SharedValue<number>, start: number, dy = 14, dur = 0.45) {
  return useAnimatedStyle(() => {
    const p = easeOutCubic(seg(clock.value, start, start + dur));
    return { opacity: p, transform: [{ translateY: (1 - p) * dy }] };
  });
}

interface ContentProps {
  price: OfferPrice;
  title: string;
  styles: Styles;
  c: TCPalette;
  onClaim: () => void;
  onCode: () => void;
  onLater: () => void;
}

function OfferContent({ price, title, styles, c, onClaim, onCode, onLater }: ContentProps) {
  const clock = useSharedValue(0);
  const shineOn = useSharedValue(1);
  const btnWidth = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    let haptic: ReturnType<typeof setTimeout> | undefined;
    const run = (from: number) => {
      clock.value = from;
      clock.value = withTiming(CLOCK_END, { duration: (CLOCK_END - from) * 1000, easing: Easing.linear });
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then((rm) => {
        if (!alive) return;
        if (rm) {
          shineOn.value = 0;
          run(SETTLED);
          return;
        }
        run(0);
        haptic = setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }, PRICE_AT * 1000);
      })
      .catch(() => run(0));
    return () => {
      alive = false;
      if (haptic) clearTimeout(haptic);
      cancelAnimation(clock);
    };
    // Plays once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const giftStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const p = seg(t, 0, 0.5);
    const w = seg(t, 0.5, 1.2);
    const wobble = w > 0 && w < 1 ? Math.sin(w * Math.PI * 4) * 10 * (1 - w) : 0;
    return {
      opacity: clamp01(p * 2),
      transform: [{ scale: 0.3 + 0.7 * easeOutBack(p) }, { rotate: `${wobble}deg` }],
    };
  });
  const titleStyle = useFadeUp(clock, 0.15);
  const bodyStyle = useFadeUp(clock, 0.25);
  const cardStyle = useFadeUp(clock, 0.35, 24, 0.5);
  // The line grows from where reading starts (the left in English, the right in Arabic).
  const strikeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: easeOutCubic(seg(clock.value, 0.75, 1.05)) }],
  }));
  const newPriceStyle = useAnimatedStyle(() => {
    const p = seg(clock.value, PRICE_AT, PRICE_AT + 0.35);
    return { opacity: clamp01(p * 2), transform: [{ scale: 0.7 + 0.3 * easeOutBack(p) }] };
  });
  const badgeStyle = useAnimatedStyle(() => {
    const p = seg(clock.value, 1.2, 1.5);
    const b = easeOutBack(p, 2.2);
    return { opacity: clamp01(p * 3), transform: [{ scale: b }, { rotate: `${(1 - b) * -14}deg` }] };
  });
  const thenStyle = useFadeUp(clock, 1.35, 8);
  const f1 = useFadeUp(clock, 1.45, 8);
  const f2 = useFadeUp(clock, 1.55, 8);
  const f3 = useFadeUp(clock, 1.65, 8);
  const btnStyle = useFadeUp(clock, 1.6, 16);
  const linksStyle = useFadeUp(clock, 1.75, 10);
  const noteStyle = useFadeUp(clock, 1.85, 6);
  const shineStyle = useAnimatedStyle(() => {
    const t = clock.value - SHINE_FROM;
    if (shineOn.value === 0 || t < 0 || btnWidth.value === 0) return { opacity: 0 };
    const p = (t % SHINE_EVERY) / SHINE_DUR;
    if (p >= 1) return { opacity: 0 };
    const x = -SHINE_W + easeInOutCubic(p) * (btnWidth.value + SHINE_W * 2);
    return { opacity: 1, transform: [{ translateX: isRTL ? btnWidth.value - x - SHINE_W : x }, { rotate: '18deg' }] };
  });

  const features = [t('offer.feature1'), t('offer.feature2'), t('offer.feature3')];
  const featureStyles = [f1, f2, f3];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Animated.View style={[styles.iconWell, giftStyle]}>
        <MaterialCommunityIcons name="gift-outline" size={32} color={c.coral} />
      </Animated.View>
      <Animated.Text style={[styles.title, titleStyle]}>{title}</Animated.Text>
      <Animated.Text style={[styles.body, bodyStyle]}>{t('offer.body')}</Animated.Text>

      <Animated.View style={[styles.card, cardStyle]}>
        <View style={styles.cardTop}>
          <Text style={styles.plan}>{t('offer.planPro')}</Text>
          <Animated.View style={[styles.badge, badgeStyle]}>
            <Text style={styles.badgeText}>{t('offer.percentOff', { percent: price.percentOff })}</Text>
          </Animated.View>
        </View>
        <View style={styles.priceRow}>
          <View style={styles.oldPriceWrap}>
            <Text style={styles.oldPrice}>{price.regular}</Text>
            <Animated.View
              pointerEvents="none"
              style={[styles.strike, { transformOrigin: isRTL ? 'right' : 'left' }, strikeStyle]}
            />
          </View>
          <Animated.Text style={[styles.newPrice, newPriceStyle]}>
            {t('offer.perMonth', { price: price.intro })}
          </Animated.Text>
        </View>
        <Animated.Text style={[styles.then, thenStyle]}>
          {price.months
            ? t('offer.thenMonths', { count: price.months, price: price.regular })
            : t('offer.thenGeneric', { price: price.regular })}
        </Animated.Text>
        <View style={styles.features}>
          {features.map((f, i) => (
            <Animated.View key={f} style={[styles.featureRow, featureStyles[i]]}>
              <MaterialCommunityIcons name="check" size={16} color={c.coral} />
              <Text style={styles.featureText}>{f}</Text>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={btnStyle}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.primaryBtn}
          onPress={onClaim}
          onLayout={(e) => { btnWidth.value = e.nativeEvent.layout.width; }}
        >
          <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]} />
          <Text style={styles.primaryBtnText}>{t('offer.claim')}</Text>
        </TouchableOpacity>
      </Animated.View>
      <Animated.View style={linksStyle}>
        <TouchableOpacity accessibilityRole="button" style={styles.linkBtn} onPress={onCode}>
          <Text style={styles.linkText}>{t('offer.haveCode')}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.linkBtn} onPress={onLater}>
          <Text style={styles.laterText}>{t('offer.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
      <Animated.Text style={[styles.note, noteStyle]}>{t('offer.note')}</Animated.Text>
    </ScrollView>
  );
}

function getStyles(c: TCPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.screenBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: TC_LAYOUT.screenPadding,
      paddingTop: 14,
      paddingBottom: 6,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: TC_LAYOUT.screenPadding, paddingTop: 8, paddingBottom: 40, gap: 14 },
    iconWell: {
      alignSelf: 'center',
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    title: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 28, letterSpacing: 1, textAlign: 'center' },
    body: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 15, lineHeight: 22, textAlign: 'center' },
    card: {
      backgroundColor: c.cardRaised,
      borderColor: c.heroBorderActive,
      borderWidth: 1.5,
      borderRadius: 16,
      padding: 18,
      gap: 8,
      marginTop: 4,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    plan: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 22, letterSpacing: 1.5 },
    badge: { backgroundColor: c.coral, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.8 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
    oldPriceWrap: { justifyContent: 'center' },
    oldPrice: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 15 },
    strike: { position: 'absolute', left: -2, right: -2, height: 1.5, borderRadius: 1, backgroundColor: c.textMuted },
    newPrice: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 22 },
    then: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13, lineHeight: 19 },
    features: { gap: 6, marginTop: 6 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    featureText: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, flexShrink: 1 },
    primaryBtn: { backgroundColor: c.coral, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 6, overflow: 'hidden' },
    shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: SHINE_W, backgroundColor: 'rgba(255,255,255,0.35)' },
    primaryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 1.6 },
    linkBtn: { alignItems: 'center', paddingVertical: 6 },
    linkText: { color: c.coralText, fontFamily: 'PlusJakartaSans-Bold', fontSize: 14 },
    laterText: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14 },
    note: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  });
}
