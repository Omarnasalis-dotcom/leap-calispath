import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../lib/analytics';
import { markPlanWelcomeShown, type WelcomeTier } from '../lib/planWelcome';
import { t } from '../i18n';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Props {
  tier: WelcomeTier;
  /** Pro → Max: only what Max adds. */
  upgrade: boolean;
}

interface Feature {
  icon: IconName;
  title: string;
  body: string;
}

function featuresFor(tier: WelcomeTier, upgrade: boolean): Feature[] {
  if (upgrade) {
    return [
      { icon: 'robot-outline', title: t('planWelcome.moreCoachTitle'), body: t('planWelcome.moreCoachBody') },
      { icon: 'check-decagram-outline', title: t('planWelcome.keepTitle'), body: t('planWelcome.keepBody') },
    ];
  }
  return [
    {
      icon: 'robot-outline',
      title: t('planWelcome.coachTitle'),
      body: tier === 'max' ? t('planWelcome.coachBodyMax') : t('planWelcome.coachBodyPro'),
    },
    { icon: 'dumbbell', title: t('planWelcome.libraryTitle'), body: t('planWelcome.libraryBody') },
    { icon: 'tune-variant', title: t('planWelcome.customTitle'), body: t('planWelcome.customBody') },
  ];
}

// "Welcome to PRO / MAX": opened by Profile the first time it shows after
// someone gets a plan (src/lib/planWelcome.ts). What they unlocked, then
// where to start: the AI Coach or the program library.
export function PlanWelcomeScreen({ tier, upgrade }: Props) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const { profile } = useAuth();
  const left = useRef(false);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (profile?.id) void markPlanWelcomeShown(profile.id, tier);
    track('plan_welcome_viewed', { tier, upgrade });
    let haptic: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (reduce) return;
        // One soft ring out from the badge, then still.
        ring.value = withDelay(250, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
        haptic = setTimeout(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }, 250);
      })
      .catch(() => {});
    return () => {
      if (haptic) clearTimeout(haptic);
    };
    // Once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value > 0 && ring.value < 1 ? 0.5 * (1 - ring.value) : 0,
    transform: [{ scale: 1 + ring.value * 0.7 }],
  }));

  const go = useCallback((action: 'coach' | 'programs' | 'later') => {
    if (left.current) return;
    left.current = true;
    track('plan_welcome_action', { tier, upgrade, action });
    if (action === 'later') {
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
      return;
    }
    router.replace(action === 'coach' ? '/coach' : '/program-templates');
  }, [tier, upgrade]);

  const plan = tier.toUpperCase();
  const features = featuresFor(tier, upgrade);
  const step = (i: number) => FadeInDown.delay(260 + i * 90).duration(340);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('planWelcome.close')}
          onPress={() => go('later')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="close" size={26} color={c.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeWrap}>
          <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
          <Animated.View entering={ZoomIn.duration(420)} style={styles.badge}>
            <MaterialCommunityIcons name={tier === 'max' ? 'crown-outline' : 'lightning-bolt'} size={34} color="#000" />
          </Animated.View>
        </View>

        <Animated.Text entering={step(0)} style={styles.title}>
          {upgrade ? t('planWelcome.titleUpgrade', { plan }) : t('planWelcome.title', { plan })}
        </Animated.Text>
        <Animated.Text entering={step(1)} style={styles.body}>
          {upgrade ? t('planWelcome.bodyUpgrade') : t('planWelcome.body')}
        </Animated.Text>

        <View style={styles.features}>
          {features.map((f, i) => (
            <Animated.View key={f.title} entering={step(2 + i)} style={styles.feature}>
              <View style={styles.featureIcon}>
                <MaterialCommunityIcons name={f.icon} size={20} color={c.coral} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <Animated.View entering={step(2 + features.length)} style={styles.actions}>
          <Text style={styles.startLabel}>{t('planWelcome.startLabel')}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={() => go('coach')}>
            <MaterialCommunityIcons name="robot-outline" size={18} color="#000" />
            <Text style={styles.primaryBtnText}>{t('planWelcome.coachCta')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={() => go('programs')}>
            <Text style={styles.secondaryBtnText}>{t('planWelcome.programsCta')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.linkBtn} onPress={() => go('later')}>
            <Text style={styles.laterText}>{t('planWelcome.later')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
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
    content: { padding: TC_LAYOUT.screenPadding, paddingTop: 12, paddingBottom: 40, gap: 14 },
    badgeWrap: { alignSelf: 'center', width: 76, height: 76, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    ring: { position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: c.coral },
    badge: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.coral,
    },
    title: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 30, letterSpacing: 1, textAlign: 'center' },
    body: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 15, lineHeight: 22, textAlign: 'center' },
    features: { gap: 10, marginTop: 6 },
    feature: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.cardRaised,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    featureIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    featureText: { flex: 1, gap: 2 },
    featureTitle: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, lineHeight: 21 },
    featureBody: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13, lineHeight: 19 },
    actions: { gap: 10, marginTop: 10 },
    startLabel: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.4, textAlign: 'center' },
    primaryBtn: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: c.coral,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 1.6 },
    secondaryBtn: { borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 1.4 },
    linkBtn: { alignItems: 'center', paddingVertical: 6 },
    laterText: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14 },
  });
}
