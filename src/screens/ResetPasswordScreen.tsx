import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { LeapLogo } from '../components/LeapLogo';


interface ResetPasswordScreenProps {
  onComplete?: () => void;
}

export function ResetPasswordScreen({ onComplete }: ResetPasswordScreenProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
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
     * On web: we additionally try to exchange a code/token from the URL hash.
     */
    async function checkSession() {
      setSessionLoading(true);
      setInlineError(null);
      try {
        // --- Web: parse tokens from URL ---
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

            // Handle token_hash flow (from email template using {{ .TokenHash }})
            if (tokenHash && type === 'recovery') {
              const { data, error } = await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type: 'recovery',
              });
              if (error) throw error;
              if (data?.session) {
                setHasSession(true);
                return;
              }
            } else if (code) {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) throw error;
              if (data?.session) {
                setHasSession(true);
                return;
              }
            } else if (accessToken && refreshToken) {
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (error) throw error;
              if (data?.session) {
                setHasSession(true);
                return;
              }
            }
          }
        }

        // --- Mobile & Web fallback: check current session ---
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setHasSession(true);
        } else {
          setInlineError(
            'NO ACTIVE RESET SESSION.\nPLEASE TAP THE RESET LINK IN YOUR EMAIL AGAIN.'
          );
        }
      } catch (err: any) {
        setInlineError(
          err.message?.toUpperCase() ?? 'FAILED TO ESTABLISH PASSWORD RESET SESSION.'
        );
      } finally {
        setSessionLoading(false);
      }
    }

    checkSession();
  }, []);

  async function handleSubmit() {
    setInlineError(null);
    setInlineSuccess(null);

    if (!newPassword || !confirmPassword) {
      setInlineError('PLEASE FILL IN ALL FIELDS.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setInlineError('PASSWORDS DO NOT MATCH.');
      return;
    }

    if (newPassword.length < 6) {
      setInlineError('PASSWORD MUST BE AT LEAST 6 CHARACTERS.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setInlineSuccess('PASSWORD UPDATED! YOU CAN NOW SIGN IN.');

      // Give the user a moment to see the success message, then clear reset state
      resetTimerRef.current = setTimeout(async () => {
        await clearPasswordReset();
        router.replace('/auth');
      }, 2500);
    } catch (error: any) {
      setInlineError(error.message?.toUpperCase() ?? 'AN UNEXPECTED ERROR OCCURRED.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background.primary }]}
    >
      <View style={[styles.panel, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <Text style={[styles.heading, { color: theme.text.primary }]}>
          RESET <Text style={{ color: theme.accent }}>PASSWORD</Text>
        </Text>

        {sessionLoading ? (
          <View style={styles.loadingContainer}>
            <LeapLogo size={40} animated />
            <Text style={[styles.statusText, { color: theme.text.secondary }]}>
              ESTABLISHING RESET SESSION...
            </Text>
          </View>
        ) : inlineSuccess ? (
          <View style={styles.feedbackContainer}>
            <Text style={[styles.successText, { color: theme.accent }]}>
              {inlineSuccess}
            </Text>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={onComplete}
            >
              <Text style={styles.actionButtonText}>CONTINUE TO LOGIN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: '100%' }}>
            <Text style={[styles.subheading, { color: theme.text.secondary }]}>
              Enter your new password below.
            </Text>

            {inlineError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{inlineError}</Text>
              </View>
            )}

            <Input
              label="NEW PASSWORD"
              placeholder="Min 6 characters"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <Input
              label="CONFIRM PASSWORD"
              placeholder="Min 6 characters"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <View style={{ marginTop: 16 }}>
              <Button
                title="UPDATE PASSWORD"
                onPress={handleSubmit}
                loading={loading}
                disabled={!hasSession || loading}
              />
            </View>

            <TouchableOpacity
              style={{ marginTop: 24, alignItems: 'center' }}
              onPress={onComplete}
            >
              <Text style={[styles.cancelText, { color: theme.text.secondary }]}>
                RETURN TO LOGIN
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
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
