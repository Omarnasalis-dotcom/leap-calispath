import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Purchases from 'react-native-purchases';
import { LeapLogo } from '../components/LeapLogo';
import { Button } from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { hasActiveAccess, getSubscriptionTier } from '../lib/entitlement';
import { supabase } from '../lib/supabase';

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

export function PaywallScreen() {
  const router = useRouter();
  const { profile, paywallEnabled, refreshProfile } = useAuth();
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
    try {
      const result = await RevenueCatUI.presentPaywall();
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
      setStep('fallback');
    }
  }, [pollForAccess, router]);

  useEffect(() => {
    // Already-subscribed users land on the 'context' interstitial instead
    // (see initial state above) — presenting the native paywall waits for
    // their explicit tap there, since RevenueCat's stock paywall has no
    // built-in way to show "this is your current plan" or otherwise signal
    // upgrade-vs-fresh-purchase on its own (confirmed no such option exists
    // in this project's paywall config). A Free user has nothing to be
    // confused about, so they skip straight to the paywall as before.
    if (alreadySubscribed) return;
    present();
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
      ? new Date(profile.access_expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <LeapLogo size={100} animated={false} />
          <Text style={styles.currentPlanBadge}>{currentTier.toUpperCase()}</Text>
          <Text style={styles.title}>Change Your Plan</Text>
          <Text style={styles.message}>
            You're currently on {currentTier.toUpperCase()}{expiresLabel ? ` (renews ${expiresLabel})` : ''}. Picking a plan on the next screen upgrades your existing subscription — it replaces what you have now, it doesn't stack on top of it.
          </Text>
          <Button title="Continue" onPress={present} />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'presenting' || step === 'confirming') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <LeapLogo size={100} animated />
          {step === 'confirming' && (
            <>
              <ActivityIndicator color="#FF5252" style={styles.spinner} />
              <Text style={styles.message}>Confirming your purchase...</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <LeapLogo size={100} animated={false} />
        <Text style={styles.title}>Couldn't Load Plans</Text>
        <Text style={styles.message}>
          Something went wrong loading the available plans. Check your connection and try again, or continue with free access for now.
        </Text>
        <Button title="Try Again" onPress={present} />
        <Button title="Restore Purchases" variant="secondary" onPress={handleRestore} />
        <Button
          title="Continue Free"
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
    backgroundColor: '#000000',
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
    color: '#FFFFFF',
    letterSpacing: 1,
    marginTop: 16,
  },
  currentPlanBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FF5252',
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    overflow: 'hidden',
  },
  message: {
    fontSize: 16,
    color: '#B0BEC5',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  spinner: {
    marginTop: 16,
  },
});
