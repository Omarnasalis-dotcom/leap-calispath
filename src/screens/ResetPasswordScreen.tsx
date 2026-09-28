import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { supabase } from '../lib/supabase';
import { Input } from '../components/Input';
import { t, isArabic as isArabicUI } from '../i18n';
import { getTranslatedAuthError } from '../lib/asyncErrorHandler';
import { Button } from '../components/Button';
import { LeapLogo } from '../components/LeapLogo';

// English shows the raw error in capitals (unchanged); Arabic shows a
// translated message for known errors, else the fallback.
function resetErrorText(err: any, fallback: string): string {
  const translated = getTranslatedAuthError(err);
  if (translated) return translated;
  if (isArabicUI) return fallback;
  return err?.message?.toUpperCase() ?? fallback;
}

interface ResetPasswordScreenProps {
  onComplete?: () => void;
}

// Keep in sync with AuthScreen and the Supabase Auth minimum (audit M10).
const MIN_NEW_PASSWORD_LENGTH = 8;

export function ResetPasswordScreen({ onComplete }: ResetPasswordScreenProps) {
  const isMounted = useMountedRef();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [pendingVerify, setPendingVerify] = useState<
    | { kind: 'token_hash'; value: string }
    | { kind: 'code'; value: string }
    | { kind: 'session'; accessToken: string; refreshToken: string }
    | null
  >(null);
  const [verifying, setVerifying] = useState(false);
  const verifyInFlightRef = useRef(false);
  const { theme } = useTheme();
  const { clearPasswordReset } = useAuth();
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    /**
     * On mobile: Supabase has already established a temporary PASSWORD_RECOVERY
     * session before AuthContext surfaced this screen, so we just verify it exists.
     *
     * On web: the recovery token is single-use, and email link scanners (Outlook
     * Safe Links, mail-client link previews, etc.) will fetch/render this page
     * before the human clicks anything. So on web we only *parse* the token here
     * and defer the actual verifyOtp/exchangeCodeForSession call until the user
     * explicitly taps a button — bots don't do that.
     */
    async function detectSession() {
      setSessionLoading(true);
      setInlineError(null);
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hash = window?.location?.hash ?? '';
          const search = window?.location?.search ?? '';
          const paramsStr = hash.replace('#', '?') || search;
          if (paramsStr) {
            const params = new URLSearchParams(paramsStr);
            const code = params.get('code');
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            const tokenHash = params.get('token_hash');
            const type = params.get('type');

            if (tokenHash && type === 'recovery') {
              if (isMounted.current) setPendingVerify({ kind: 'token_hash', value: tokenHash });
              return;
            } else if (code) {
              if (isMounted.current) setPendingVerify({ kind: 'code', value: code });
              return;
            } else if (accessToken && refreshToken) {
              if (isMounted.current) {
                setPendingVerify({ kind: 'session', accessToken, refreshToken });
              }
              return;
            }
          }
        }

        // Native, or web with no verification params in the URL: check for an
        // already-established session (native's deep link handler verifies
        // up front in AuthContext before this screen ever mounts).
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (isMounted.current) setHasSession(true);
        } else {
          if (isMounted.current) {
            setInlineError(
              t('resetPassword.noSession')
            );
          }
        }
      } catch (err: any) {
        if (isMounted.current) {
          setInlineError(
            resetErrorText(err, t('resetPassword.sessionFailed'))
          );
        }
      } finally {
        if (isMounted.current) {
          setSessionLoading(false);
        }
      }
    }

    detectSession();
  }, []);

  async function handleConfirmResetLink() {
    // Guard with a ref, not just `verifying` state — state updates aren't
    // synchronous, so a fast double-tap can fire this twice before the
    // disabled prop re-renders. The recovery token is single-use: a second
    // in-flight call would consume nothing but still land in the catch
    // block and stomp the first call's success with an "expired" error.
    if (verifyInFlightRef.current || !pendingVerify) return;
    verifyInFlightRef.current = true;
    setVerifying(true);
    setInlineError(null);
    try {
      let result;
      if (pendingVerify.kind === 'token_hash') {
        result = await supabase.auth.verifyOtp({
          token_hash: pendingVerify.value,
          type: 'recovery',
        });
      } else if (pendingVerify.kind === 'code') {
        result = await supabase.auth.exchangeCodeForSession(pendingVerify.value);
      } else {
        result = await supabase.auth.setSession({
          access_token: pendingVerify.accessToken,
          refresh_token: pendingVerify.refreshToken,
        });
      }
      if (result.error) throw result.error;
      if (result.data?.session) {
        if (isMounted.current) {
          setHasSession(true);
          setPendingVerify(null);
        }
      } else {
        throw new Error('Could not establish a reset session.');
      }
    } catch (err: any) {
      if (isMounted.current) {
        setInlineError(
          resetErrorText(err, t('resetPassword.linkInvalid'))
        );
        setPendingVerify(null);
      }
    } finally {
      verifyInFlightRef.current = false;
      if (isMounted.current) setVerifying(false);
    }
  }

  function exitToLogin() {
    // Web must never soft-navigate into the in-app sign-in screen — the whole
    // Expo Router bundle is already loaded once /reset-password renders, so a
    // client-side router.replace('/auth') would expose the full app. A hard
    // navigation re-triggers Vercel's rewrite and lands on the download page.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
      return;
    }
    onComplete?.();
  }

  async function handleSubmit() {
    setInlineError(null);
    setInlineSuccess(null);

    if (!newPassword || !confirmPassword) {
      setInlineError(t('resetPassword.fillAll'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setInlineError(t('resetPassword.mismatch'));
      return;
    }

    if (newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
      setInlineError(t('resetPassword.tooShort', { count: MIN_NEW_PASSWORD_LENGTH }));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      if (isMounted.current) {
        setInlineSuccess(t('resetPassword.updated'));
      }

      // Give the user a moment to see the success message, then clear reset state
      resetTimerRef.current = setTimeout(async () => {
        await clearPasswordReset();
        exitToLogin();
      }, 2500);
    } catch (error: any) {
      if (isMounted.current) {
        setInlineError(resetErrorText(error, t('resetPassword.unexpected')));
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  return (
    <GlobalErrorBoundary>
      <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background.primary }]}
    >
      <View style={[styles.panel, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <Text style={[styles.heading, { color: theme.text.primary }]}>
          {t('resetPassword.headingLead')}<Text style={{ color: theme.accent }}>{t('resetPassword.headingAccent')}</Text>
        </Text>

        {sessionLoading ? (
          <View style={styles.loadingContainer}>
            <LeapLogo size={40} animated />
            <Text style={[styles.statusText, { color: theme.text.secondary }]}>
              {t('resetPassword.establishing')}
            </Text>
          </View>
        ) : inlineSuccess ? (
          <View style={styles.feedbackContainer}>
            <Text style={[styles.successText, { color: theme.accent }]}>
              {inlineSuccess}
            </Text>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={exitToLogin}
            >
              <Text style={styles.actionButtonText}>{t('resetPassword.continueToLogin')}</Text>
            </TouchableOpacity>
          </View>
        ) : pendingVerify ? (
          <View style={styles.feedbackContainer}>
            <Text style={[styles.subheading, { color: theme.text.secondary, textAlign: 'center', marginBottom: 24 }]}>
              {t('resetPassword.tapToContinue')}
            </Text>
            {inlineError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{inlineError}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent, opacity: verifying ? 0.6 : 1 }]}
              onPress={handleConfirmResetLink}
              disabled={verifying}
            >
              <Text style={styles.actionButtonText}>
                {verifying ? t('resetPassword.verifying') : t('resetPassword.continueReset')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: '100%' }}>
            <Text style={[styles.subheading, { color: theme.text.secondary }]}>
              {t('resetPassword.enterNew')}
            </Text>

            {inlineError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{inlineError}</Text>
              </View>
            )}

            <Input
              label={t('resetPassword.newPassword')}
              placeholder={t('resetPassword.minChars', { count: MIN_NEW_PASSWORD_LENGTH })}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />

            <Input
              label={t('resetPassword.confirmPassword')}
              placeholder={t('resetPassword.minChars', { count: MIN_NEW_PASSWORD_LENGTH })}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />

            <View style={{ marginTop: 16 }}>
              <Button
                title={t('resetPassword.update')}
                onPress={handleSubmit}
                loading={loading}
                disabled={!hasSession || loading}
              />
            </View>

            <TouchableOpacity
              style={{ marginTop: 24, alignItems: 'center' }}
              onPress={exitToLogin}
            >
              <Text style={[styles.cancelText, { color: theme.text.secondary }]}>
                RETURN TO LOGIN
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    padding: 32,
    borderWidth: 1,
  },
  heading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 28,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  subheading: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    marginBottom: 32,
  },
  cancelText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  statusText: {
    marginTop: 16,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  feedbackContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
    width: '100%',
  },
  errorText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
