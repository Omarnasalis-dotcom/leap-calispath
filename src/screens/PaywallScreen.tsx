import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Purchases from 'react-native-purchases';
import { LeapLogo } from '../components/LeapLogo';
import { Button } from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { hasActiveAccess, getSubscriptionTier } from '../lib/entitlement';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { t, isArabic } from '../i18n';
import { TC_COLORS } from '../../constants/trainingCenterTokens';

type Step = 'context' | 'presenting' | 'confirming' | 'fallback';

// The RevenueCat SDK's own purchase/restore callback fires the instant
// StoreKit confirms the transaction, but the actual DB grant happens
// server-side via the RevenueCat webhook, which isn't instant. This screen
// never trusts "purchase succeeded" from the client alone — it polls the
// real profile for a few seconds, and if the webhook hasn't landed yet,
// falls back to confirm-entitlement, which does a direct server-side
// RevenueCat lookup instead of just waiting longer.
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1500;

// There is deliberately NO timeout wrapping RevenueCatUI.presentPaywall()
// below. Confirmed live via a real sandbox purchase: its promise doesn't
// resolve once the native paywall renders — per RevenueCat's own docs, it
// "resolves with the result of the paywall presentation," meaning it stays
// pending for the ENTIRE flow (user browsing the plans, tapping buy,
// Face/Touch ID, StoreKit's own receipt round-trip), which is paced by the
// user, not the SDK. A 12s (previously 25s, previously 10s) timeout here
// fired WHILE a real purchase was still mid-StoreKit-confirmation — the
// user saw "Couldn't Load Plans" and a console error, then the purchase
// went on to actually succeed a few seconds later, completely independent
// of the timeout that had already given up on it. No fixed duration is
// safe to race against this specific call: any value long enough to
// survive a normal purchase is also long enough to make a genuinely-stuck
// call look identical while it's still "waiting." The earlier, separate
// bug this timeout was originally trying to paper over — the call never
// even rendering anything — was a native transition race, not slowness,
// and is fixed at its actual source by the transitionEnd gating below (see
// also CustomizeProgramScreen's requestPaywallAfterModalCloses /
// ProgramTemplatesScreen's equivalent for the Modal half of that race).
// Nothing else in this app wraps a third-party async call in an artificial
// timeout either — this was the one outlier, and it was actively harmful.

export function PaywallScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  // Where the paywall was opened from (?from=), for the purchase funnel.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const source = typeof from === 'string' && /^[a-z0-9_]{1,40}$/.test(from) ? from : 'other';
  const { profile, paywallEnabled, refreshProfile } = useAuth();
  const { theme, mode } = useTheme();
  const c = TC_COLORS[mode];
  const bg = { backgroundColor: theme.background.primary };
  const ink = { color: theme.text.primary };
  const muted = { color: theme.text.secondary };
  const alreadySubscribed = hasActiveAccess(profile);
  const currentTier = getSubscriptionTier(profile, paywallEnabled);
  const [step, setStep] = useState<Step>(alreadySubscribed ? 'context' : 'presenting');

  // router.replace('/') alone doesn't clear whatever screen the paywall was
  // opened on top of (e.g. Customize Program) — '/' is itself just a
  // <Redirect> to '/profile' (app/index.tsx), and neither that redirect nor
  // the replace() before it pops screens further down the stack. Confirmed
  // live: the screen underneath stayed mounted and visibly bled through
  // Profile after a successful purchase. dismissAll() clears the whole
  // stack back to root first, so there's nothing left underneath to bleed
  // through; replacing straight to '/profile' also skips the extra
  // index-redirect hop.
  const goToProfile = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    router.replace('/profile');
  }, [router]);

  const pollForAccess = useCallback(async () => {
    setStep('confirming');
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      // Check the freshly-fetched profile returned directly from
      // refreshProfile(), not the `profile` from this closure — reading
      // that here would still be whatever it was when pollForAccess started,
      // since React doesn't retroactively rebind a value already captured
      // inside an in-flight async function. That stale read meant this loop
      // could never actually detect newly-granted access, no matter how
      // many times it polled — the real explanation behind every earlier
      // "restore/purchase looks like it does nothing" report.
      const fresh = await refreshProfile();
      if (hasActiveAccess(fresh)) {
        goToProfile();
        return;
      }
    }

    // Webhook hasn't landed yet — ask the server to check RevenueCat directly
    // rather than trusting the client's own purchase-succeeded claim.
    try {
      await supabase.functions.invoke('confirm-entitlement');
    } catch (err) {
      console.error('[Paywall] confirm-entitlement fallback failed:', err);
    }
    const fresh = await refreshProfile();

    if (hasActiveAccess(fresh)) {
      goToProfile();
    } else {
      setStep('fallback');
    }
  }, [refreshProfile, goToProfile]);

  const present = useCallback(async () => {
    setStep('presenting');
    track('paywall_viewed', { current_tier: currentTier, source });
    try {
      const result = await RevenueCatUI.presentPaywall();
      if (result === PAYWALL_RESULT.PURCHASED) track('purchase_completed', { from_tier: currentTier, source });
      else if (result === PAYWALL_RESULT.RESTORED) track('purchase_restored', { from_tier: currentTier, source });
      else if (result === PAYWALL_RESULT.CANCELLED) track('purchase_cancelled', { current_tier: currentTier, source });
      else track('paywall_failed', { result: String(result), source });
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await pollForAccess();
      } else if (result === PAYWALL_RESULT.CANCELLED) {
        // Dismissing the paywall means choosing free tier, not a dead end —
        // there's no hard gate anymore (see canAccessPro), so just return
        // to wherever the user came from.
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } else {
        // ERROR / NOT_PRESENTED — a genuine failure to render, not a user
        // choice. Give them a manual retry instead of a silent dead end.
        setStep('fallback');
      }
    } catch (err) {
      console.error('[Paywall] presentPaywall failed:', err);
      track('paywall_failed', { result: 'exception' });
      setStep('fallback');
    }
  }, [pollForAccess, router, currentTier, source]);

  useEffect(() => {
    // Already-subscribed users land on the 'context' interstitial instead
    // (see initial state above) — presenting the native paywall waits for
    // their explicit tap there, since RevenueCat's stock paywall has no
    // built-in way to show "this is your current plan" or otherwise signal
    // upgrade-vs-fresh-purchase on its own (confirmed no such option exists
    // in this project's paywall config). A Free user has nothing to be
    // confused about, so they skip straight to the paywall as before.
    if (alreadySubscribed) return;

    // Calling presentPaywall() while THIS screen's own push-in transition
    // is still animating races react-native-screens' native transition —
    // presenting a full-screen view controller (iOS) while another one is
    // mid-transition can silently stall until it clears. This was one of
    // two separate bugs behind "Upgrade to Save doesn't reach the paywall
    // reliably" — the other was the timeout that used to wrap the call
    // below (see the comment above this effect for that one; confirmed via
    // a real purchase that it fired mid-StoreKit-confirmation, unrelated to
    // this transition race). transitionEnd fires once react-native-screens'
    // real transition has finished; a short fallback covers the rare case
    // it never fires (e.g. this being the very first screen in the stack,
    // with no transition to end) so this never waits on the event alone.
    // expo-router's useNavigation() is typed against a generic
    // NavigationProp that doesn't know about native-stack-only events —
    // the underlying navigator here is always a native-stack (Expo
    // Router's <Stack>), which does emit transitionEnd at runtime.
    let didPresent = false;
    const runPresent = () => {
      if (didPresent) return;
      didPresent = true;
      present();
    };
    const unsubscribe = (navigation as any).addListener('transitionEnd', (e: { data: { closing: boolean } }) => {
      if (!e.data.closing) runPresent();
    });
    const fallback = setTimeout(runPresent, 400);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
    // Only auto-present once on mount — re-presenting is a manual retry from
    // the fallback screen (present() below), not something to loop on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRestore() {
    setStep('confirming');
    try {
      await Purchases.restorePurchases();
    } catch (err) {
      console.error('[Paywall] restorePurchases failed:', err);
    }
    await pollForAccess();
  }

  if (step === 'context') {
    const expiresLabel = profile?.access_expires_at
      ? new Date(profile.access_expires_at).toLocaleDateString(isArabic ? 'ar' : undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
    return (
      <SafeAreaView style={[styles.container, bg]}>
        <View style={styles.planScreen}>
          <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <MaterialCommunityIcons name="close" size={26} color={c.textPrimary} />
          </TouchableOpacity>

          <Text style={[styles.eyebrow, { color: c.coralText }]}>{t('paywall.yourPlan')}</Text>
          <Text style={[styles.planTitle, { color: c.textPrimary }]}>{t('paywall.changePlan')}</Text>

          <View style={[styles.planCard, { backgroundColor: c.cardRaised, borderColor: c.border }]}>
            <View style={styles.planRow}>
              <Text style={[styles.planName, { color: c.textPrimary }]}>{currentTier.toUpperCase()}</Text>
              <View style={styles.activeChip}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>{t('paywall.active')}</Text>
              </View>
            </View>
            {expiresLabel && (
              <View style={[styles.renewRow, { borderTopColor: c.border }]}>
                <MaterialCommunityIcons name="calendar-sync-outline" size={18} color={c.textSecondary} />
                <Text style={[styles.renewText, { color: c.textBody }]}>{t('paywall.renewsOn', { date: expiresLabel })}</Text>
              </View>
            )}
          </View>

          <View style={styles.noteRow}>
            <MaterialCommunityIcons name="information-outline" size={18} color={c.textSecondary} />
            <Text style={[styles.noteText, { color: c.textSecondary }]}>{t('paywall.replaceNote')}</Text>
          </View>

          <View style={styles.planFooter}>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: c.coral }]} onPress={present} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>{t('paywall.seePlans')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.notNowBtn} onPress={close} accessibilityRole="button">
              <Text style={[styles.notNowText, { color: c.textSecondary }]}>{t('paywall.notNow')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'presenting' || step === 'confirming') {
    return (
      <SafeAreaView style={[styles.container, bg]}>
        <View style={styles.content}>
          <LeapLogo size={100} animated />
          <ActivityIndicator color="#FF5252" style={styles.spinner} />
          <Text style={[styles.message, muted]}>
            {step === 'confirming' ? t('paywall.confirming') : t('paywall.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, bg]}>
      <View style={styles.content}>
        <LeapLogo size={100} animated={false} />
        <Text style={[styles.title, ink]}>{t('paywall.loadFailedTitle')}</Text>
        <Text style={[styles.message, muted]}>
          {t('paywall.loadFailed')}
        </Text>
        <Button title={t('paywall.tryAgain')} onPress={present} />
        <Button title={t('paywall.restore')} variant="secondary" onPress={handleRestore} />
        <Button
          title={t('paywall.continueFree')}
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 16,
  },
  planScreen: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginStart: -10, marginBottom: 24 },
  eyebrow: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 2.4 },
  planTitle: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 34, letterSpacing: 0.5, marginTop: 4, marginBottom: 24 },
  planCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 18 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18 },
  planName: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 28, letterSpacing: 1.5 },
  activeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(46,125,59,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34A853' },
  activeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.2, color: '#2E7D3B' },
  renewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingVertical: 14 },
  renewText: { fontFamily: 'PlusJakartaSans-Medium', fontSize: 14 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18, paddingHorizontal: 2 },
  noteText: { flex: 1, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13.5, lineHeight: 20, textAlign: 'left' },
  planFooter: { marginTop: 'auto', paddingBottom: 12, gap: 4 },
  primaryBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 17, letterSpacing: 1.6 },
  notNowBtn: { alignItems: 'center', paddingVertical: 14 },
  notNowText: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14 },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  spinner: {
    marginTop: 16,
  },
});
