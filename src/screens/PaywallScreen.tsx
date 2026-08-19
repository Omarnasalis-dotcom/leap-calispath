import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Purchases from 'react-native-purchases';
import { LeapLogo } from '../components/LeapLogo';
import { Button } from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { hasActiveAccess } from '../lib/entitlement';
import { supabase } from '../lib/supabase';

type Step = 'presenting' | 'confirming' | 'fallback';

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
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>('presenting');

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
        router.replace('/');
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
      router.replace('/');
    } else {
      setStep('fallback');
    }
  }, [refreshProfile, router]);

  const present = useCallback(async () => {
    setStep('presenting');
    try {
      const result = await RevenueCatUI.presentPaywall();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await pollForAccess();
      } else {
        // CANCELLED / ERROR / NOT_PRESENTED — user backed out or the paywall
        // couldn't render; give them a manual retry instead of a dead end.
        setStep('fallback');
      }
    } catch (err) {
      console.error('[Paywall] presentPaywall failed:', err);
      setStep('fallback');
    }
  }, [pollForAccess]);

  useEffect(() => {
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
        <Text style={styles.title}>Unlock Full Access</Text>
        <Text style={styles.message}>
          Your trial has ended. Subscribe to keep training with full access to every world, tier, and feature.
        </Text>
        <Button title="View Plans" onPress={present} />
        <Button title="Restore Purchases" variant="secondary" onPress={handleRestore} />
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
