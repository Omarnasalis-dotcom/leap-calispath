import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Purchases from 'react-native-purchases';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { hasActiveAccess } from '../lib/entitlement';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { isValidRedeemCode, normalizeRedeemCode, parseClaimResult, playOfferTarget, MAX_REDEEM_CODE_LENGTH } from '../lib/redeemCode';
import { FLIP_X, t } from '../i18n';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

type Step = 'enter' | 'opened' | 'checking' | 'unlocked' | 'notYet';

// Same pacing as PaywallScreen.pollForAccess: the webhook usually lands
// within a few seconds; after that, confirm-entitlement asks RevenueCat
// directly.
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1500;

type Profile = ReturnType<typeof useAuth>['profile'];

// A code only counts as unlocked when it changed something: someone who
// already had a plan must not see "unlocked" just because access is active.
function gainedAccess(before: Profile, after: Profile): boolean {
  if (!hasActiveAccess(after)) return false;
  if (!hasActiveAccess(before)) return true;
  return before?.access_expires_at !== after?.access_expires_at || before?.subscription_tier !== after?.subscription_tier;
}

export function RedeemCodeScreen() {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const { profile, refreshProfile } = useAuth();
  const isMounted = useMountedRef();
  const isIOS = Platform.OS === 'ios';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('enter');
  const [busy, setBusy] = useState(false);
  const before = useRef<Profile>(profile);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setStep('checking');
    try {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (!isMounted.current) return;
        if (gainedAccess(before.current, await refreshProfile())) {
          track('redeem_code_unlocked', { platform: Platform.OS });
          if (isMounted.current) setStep('unlocked');
          return;
        }
      }
      try {
        await supabase.functions.invoke('confirm-entitlement');
      } catch (err) {
        console.error('[Redeem] confirm-entitlement fallback failed:', err);
      }
      const fresh = await refreshProfile();
      if (!isMounted.current) return;
      if (gainedAccess(before.current, fresh)) {
        track('redeem_code_unlocked', { platform: Platform.OS });
        setStep('unlocked');
      } else {
        setStep('notYet');
      }
    } finally {
      checking.current = false;
    }
  }, [refreshProfile, isMounted]);

  // iOS: Apple's code sheet is inside the app; wait for the SDK to report the
  // new transaction. Also while "not yet": a check can finish before Apple does.
  useEffect(() => {
    if (!isIOS || (step !== 'opened' && step !== 'notYet')) return;
    const listener = () => { check(); };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
  }, [step, check, isIOS]);

  // iOS: Apple's own offer-code sheet (StoreKit), shown over the app. The
  // https://apps.apple.com/redeem link opened a blank Safari page on a real
  // iPhone (2026-10-25), and the sheet can't be pre-filled, so on iOS the
  // code is typed straight into Apple's sheet.
  const handleOpenAppleSheet = async () => {
    setError(null);
    before.current = profile;
    track('redeem_code_submitted', { platform: 'ios' });
    try {
      await Purchases.presentCodeRedemptionSheet();
      setStep('opened');
    } catch (err) {
      console.error('[Redeem] presentCodeRedemptionSheet failed:', err);
      setError(t('redeem.couldNotOpen'));
    }
  };

  // Android: the server checks the code and names the Play offer; Leap then
  // buys exactly that offer through Google's own purchase sheet.
  const handleRedeem = async () => {
    const normalized = normalizeRedeemCode(code);
    if (!isValidRedeemCode(normalized)) {
      setError(t('redeem.invalid'));
      return;
    }
    if (Platform.OS !== 'android' || busy) return;
    setError(null);
    setBusy(true);
    before.current = profile;
    track('redeem_code_submitted', { platform: 'android' });
    try {
      const { data, error: rpcError } = await supabase.rpc('claim_promo_code', { p_code: normalized });
      if (rpcError) throw rpcError;
      const claim = parseClaimResult(data);
      if (!claim.ok) {
        if (isMounted.current) setError(t(`redeem.errors.${claim.error}`));
        return;
      }
      const target = playOfferTarget(claim.productId, claim.offerId);
      const products = target ? await Purchases.getProducts([target.subscriptionId]) : [];
      const option = products
        .find((p) => p.identifier === claim.productId)
        ?.subscriptionOptions?.find((o) => o.id === target?.optionId);
      if (!option) {
        console.error('[Redeem] Play offer not found:', claim.productId, claim.offerId);
        if (isMounted.current) setError(t('redeem.errors.OFFER_UNAVAILABLE'));
        return;
      }
      await Purchases.purchaseSubscriptionOption(option);
      // Stats only; access comes from the RevenueCat webhook.
      supabase.rpc('mark_promo_code_purchased', { p_code: normalized }).then(({ error: e }) => {
        if (e) console.warn('[Redeem] mark_promo_code_purchased failed:', e);
      });
      if (isMounted.current) await check();
    } catch (err: any) {
      // Closing Google's sheet isn't an error: stay on the code box.
      if (err?.userCancelled) return;
      console.error('[Redeem] redeem failed:', err);
      if (isMounted.current) setError(t('redeem.errors.UNKNOWN'));
    } finally {
      if (isMounted.current) setBusy(false);
    }
  };

  const reset = () => {
    setStep('enter');
    setError(null);
  };

  const goToProfile = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace('/profile');
  };

  // "the App Store" in English, plain "App Store" in Arabic.
  const storeName = isIOS ? t('redeem.storeIos') : 'Google Play';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('redeem.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={c.textPrimary} style={FLIP_X} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('redeem.title')}</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWell}>
          <MaterialCommunityIcons name="ticket-percent-outline" size={30} color={c.coral} />
        </View>

        {step === 'enter' && isIOS && (
          <>
            <Text style={styles.body}>{t('redeem.bodyIos')}</Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={handleOpenAppleSheet}>
              <Text style={styles.primaryBtnText}>{t('redeem.enterCode')}</Text>
            </TouchableOpacity>
            <Text style={styles.note}>{t('redeem.note')}</Text>
          </>
        )}

        {step === 'enter' && !isIOS && (
          <>
            <Text style={styles.body}>{t('redeem.body', { store: storeName })}</Text>
            <TextInput
              style={[styles.input, error ? { borderColor: c.coral } : null]}
              value={code}
              onChangeText={(v) => { setCode(v); if (error) setError(null); }}
              placeholder={t('redeem.placeholder')}
              placeholderTextColor={c.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={MAX_REDEEM_CODE_LENGTH + 8}
              returnKeyType="go"
              onSubmitEditing={handleRedeem}
              accessibilityLabel={t('redeem.placeholder')}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.primaryBtn, (!code.trim() || busy) && styles.disabled]}
              disabled={!code.trim() || busy}
              onPress={handleRedeem}
            >
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>{t('redeem.redeem')}</Text>}
            </TouchableOpacity>
            <Text style={styles.note}>{t('redeem.note')}</Text>
          </>
        )}

        {step === 'opened' && (
          <>
            <Text style={styles.body}>{t('redeem.openedIos')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={check}>
              <Text style={styles.primaryBtnText}>{t('redeem.checkNow')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={reset}>
              <Text style={styles.secondaryBtnText}>{t('redeem.otherCode')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'checking' && (
          <>
            <ActivityIndicator color={c.coral} />
            <Text style={styles.body}>{t('redeem.checking')}</Text>
          </>
        )}

        {step === 'unlocked' && (
          <>
            <Text style={styles.title}>{t('redeem.unlockedTitle')}</Text>
            <Text style={styles.body}>{t('redeem.unlockedBody')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={goToProfile}>
              <Text style={styles.primaryBtnText}>{t('redeem.done')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'notYet' && (
          <>
            <Text style={styles.title}>{t('redeem.notYetTitle')}</Text>
            <Text style={styles.body}>{t('redeem.notYetBody', { store: storeName })}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={check}>
              <Text style={styles.primaryBtnText}>{t('redeem.checkAgain')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={reset}>
              <Text style={styles.secondaryBtnText}>{t('redeem.otherCode')}</Text>
            </TouchableOpacity>
          </>
        )}
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
      paddingBottom: 10,
    },
    headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19, letterSpacing: 1.9 },
    content: { padding: TC_LAYOUT.screenPadding, paddingTop: 28, paddingBottom: 48, gap: 16, alignItems: 'stretch' },
    iconWell: {
      alignSelf: 'center',
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    title: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 22, letterSpacing: 1, textAlign: 'center' },
    body: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 15, lineHeight: 22, textAlign: 'center' },
    note: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    input: {
      backgroundColor: c.inputBg,
      borderColor: c.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: c.textPrimary,
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 18,
      letterSpacing: 2,
      textAlign: 'center',
    },
    error: { color: c.coralText, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13, textAlign: 'center' },
    primaryBtn: { backgroundColor: c.coral, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
    primaryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 1.6 },
    secondaryBtn: { borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    secondaryBtnText: { color: c.textSecondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1.4 },
    disabled: { opacity: 0.4 },
  });
}
