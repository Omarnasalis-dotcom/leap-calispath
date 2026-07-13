import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Pressable,
  Modal,
  SafeAreaView,
  Linking,
  ActivityIndicator,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { supabase } from '../lib/supabase';
import { getFriendlyErrorMessage } from '../lib/asyncErrorHandler';
import * as AppleAuthentication from 'expo-apple-authentication';

// This screen is a deliberate fixed-dark "glass card" exception to the
// app's normal light/dark theme (see constants/Theme.ts) — not theme-
// reactive, so colors are pulled from the dark palette directly rather
// than via useTheme(). ACCENT matches theme.accent exactly (same value
// in both light and dark), everything else mirrors StealthTheme.dark.
const ACCENT = '#FF5252';
const ACCENT_PRESSED = '#E04545';
const INK_PRIMARY = 'rgba(255,255,255,0.85)';
const INK_SECONDARY = 'rgba(255,255,255,0.45)';
const INK_TERTIARY = 'rgba(255,255,255,0.3)';

// Google's brand guidelines require using their exact "G" mark colors and
// don't provide a themeable/native component that matches our button frame
// (GoogleSigninButton has no border-radius/shadow control), so this renders
// the mark ourselves inside an app-styled button instead.
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
      <Path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
      <Path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
      <Path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </Svg>
  );
}

function SocialButton({
  icon,
  label,
  onPress,
  loading,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[styles.socialButton, (disabled || loading) && styles.socialButtonDisabled]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#1F1F1F" />
      ) : (
        <>
          {icon}
          <Text style={styles.socialButtonText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// Animated ENTER/JOIN segmented toggle — replaces the old underlined tab
// bar. The pill's travel distance is measured from the track's own layout
// rather than hardcoded, since card width varies by device/viewport.
function SegmentedToggle({ isSignUp, onChange }: { isSignUp: boolean; onChange: (signUp: boolean) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const slide = useRef(new Animated.Value(isSignUp ? 1 : 0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: isSignUp ? 1 : 0,
      duration: reduceMotion ? 0 : 200,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [isSignUp, reduceMotion, slide]);

  const segmentWidth = trackWidth > 0 ? (trackWidth - 8) / 2 : 0;

  return (
    <View style={styles.segmentTrack} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            styles.segmentPill,
            {
              width: segmentWidth,
              transform: [{
                translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, segmentWidth] }),
              }],
            },
          ]}
        />
      )}
      <Pressable style={styles.segment} onPress={() => onChange(false)} hitSlop={8}>
        <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>ENTER</Text>
      </Pressable>
      <Pressable style={styles.segment} onPress={() => onChange(true)} hitSlop={8}>
        <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>JOIN</Text>
      </Pressable>
    </View>
  );
}

// Local, focus-aware input matching the glass card material — the shared
// Input component (src/components/Input.tsx) has no focus state and is
// used by other screens with a different visual language, so this stays
// scoped to AuthScreen rather than changing that component's defaults.
function GlassInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'characters';
  accessibilityLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={INK_TERTIARY}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      accessibilityLabel={accessibilityLabel}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.glassInput, focused && styles.glassInputFocused]}
    />
  );
}

// Local CTA matching the glass card material — same reasoning as
// GlassInput above; the shared Button component (src/components/Button.tsx)
// is used elsewhere with a different radius/shadow language.
function GlassButton({ title, onPress, loading, disabled }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}>
      {({ pressed }) => (
        <View style={[
          styles.ctaButton,
          pressed && styles.ctaButtonPressed,
          (disabled || loading) && styles.ctaButtonDisabled,
        ]}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaButtonText}>{title}</Text>}
        </View>
      )}
    </Pressable>
  );
}

// Flip to true to require an invite code at signup again. The
// reserve/redeem/release RPC flow further down is untouched either
// way — this only controls whether providing a code is mandatory
// before submitting. A code is still honored (grants its trial/
// membership window) whenever one is entered, required or not.
const INVITE_CODE_REQUIRED = false;

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [signupStep, setSignupStep] = useState<'choose' | 'email'>('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetModalVisible, setIsResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);
  const { signUp, signIn, signInWithGoogle, signInWithApple } = useAuth();

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setIsAppleAuthAvailable);
  }, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  function startResendCooldown() {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleResetPassword() {
    if (!resetEmail) {
      const msg = 'Please enter your email to reset your password.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Missing Field', msg);
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: 'https://leap-arena.com/reset-password'
      });

      if (error) throw error;

      setResetSent(true);
      startResendCooldown();
    } catch (error: any) {
      const message = getFriendlyErrorMessage(error);
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Arena Error', message);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSubmit() {
    if (!email || !password || (isSignUp && INVITE_CODE_REQUIRED && !inviteCode)) {
      Alert.alert('Missing Fields', `Please fill in all fields${INVITE_CODE_REQUIRED ? ' (including Invite Code)' : ''} to continue.`);
      return;
    }

    setLoading(true);
    let inviteCodeReserved = false;
    const trimmedCode = inviteCode.trim();
    try {
      if (isSignUp) {
        // 1. Atomically reserve the invite code (if one was provided) to
        // prevent race conditions — codes are optional (INVITE_CODE_REQUIRED),
        // but still honored, and still grant their trial/membership window,
        // whenever someone enters one.
        if (trimmedCode) {
          const { data: reserveData, error: reserveError } = await supabase.rpc('reserve_invite_code', {
            p_code: trimmedCode
          });

          if (reserveError) {
            console.error('Reserve RPC Error:', reserveError);
            throw new Error(`Database Error: ${reserveError.message}`);
          }

          if (!reserveData || reserveData.success === false) {
            throw new Error(`Reservation Failed: ${reserveData?.error || 'Unknown error'}`);
          }
          inviteCodeReserved = true;
        }

        // 2. Create the user. Name/username/gender/country are collected
        // afterward in CompleteProfileScreen — same path Google/Apple
        // sign-in already uses — not here.
        await signUp(email, password);

        // 3. Redeem and finalize the reserved code, if one was provided
        if (trimmedCode) {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id) {
            const { data: redeemData, error: redeemError } = await supabase.rpc('redeem_invite_code', {
              p_code: trimmedCode,
              p_user_id: authData.user.id
            });

            if (redeemError || !redeemData || redeemData.success === false) {
              console.error('Redeem Error:', redeemError || redeemData.error);
              const msg = 'Failed to finalize invite code redemption. Please contact support.';
              if (Platform.OS === 'web') window.alert(msg);
              else Alert.alert('Arena Error', msg);
              setLoading(false);
              return;
            }

            inviteCodeReserved = false; // Successfully redeemed, no need to release
          }
        }

        const msg = 'Welcome to the Arena! You can now sign in.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Warrior Registered', msg);
        setIsSignUp(false);
        setSignupStep('choose');
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      // If signup failed but we reserved a code, release it back to the pool
      if (isSignUp && inviteCodeReserved) {
        await supabase.rpc('release_invite_code', { p_code: trimmedCode });
      }
      const message = getFriendlyErrorMessage(error);
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Arena Error', message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (googleLoading || appleLoading) return;
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      const message = getFriendlyErrorMessage(error);
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Arena Error', message);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleAppleSignIn() {
    if (googleLoading || appleLoading) return;
    setAppleLoading(true);
    try {
      await signInWithApple();
    } catch (error: any) {
      const message = getFriendlyErrorMessage(error);
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Arena Error', message);
    } finally {
      setAppleLoading(false);
    }
  }

  // Shared between the sign-up "choose a method" step and the sign-in tab,
  // which shows the same two buttons below its email/password form instead.
  const renderSocialButtons = () => (
    <View style={styles.socialRow}>
      <SocialButton
        icon={<GoogleLogo />}
        label="Continue with Google"
        onPress={handleGoogleSignIn}
        loading={googleLoading}
        disabled={appleLoading}
      />
      {isAppleAuthAvailable && (
        <SocialButton
          icon={<MaterialCommunityIcons name="apple" size={22} color="#1F1F1F" />}
          label="Continue with Apple"
          onPress={handleAppleSignIn}
          loading={appleLoading}
          disabled={googleLoading}
        />
      )}
    </View>
  );

  const renderDivider = () => (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>OR</Text>
      <View style={styles.dividerLine} />
    </View>
  );

  // Shared between the sign-in tab and the sign-up "email" step.
  const renderEmailPasswordFields = () => (
    <View style={styles.fieldGroup}>
      <GlassInput
        placeholder="warrior@email.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel="Email"
      />
      <GlassInput
        placeholder="Min 6 characters"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Password"
      />
    </View>
  );

  return (
    <GlobalErrorBoundary>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient
          colors={['#1a0f0d', '#050505']}
          locations={[0, 0.6]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.centerWrap}>
              <View style={styles.header}>
                <Text style={styles.brandName}>
                  LEAP <Text style={{ color: ACCENT }}>ARENA</Text>
                </Text>
                <Text style={styles.brandTagline}>CALISTHENICS</Text>
              </View>

              <BlurView intensity={50} tint="dark" style={styles.glassCard}>
                <View style={styles.glassCardContent}>
                  <SegmentedToggle
                    isSignUp={isSignUp}
                    onChange={(signUp) => { setIsSignUp(signUp); setSignupStep('choose'); }}
                  />

                  <Text style={styles.heading}>
                    {isSignUp ? 'Claim your ' : 'Welcome back, '}
                    <Text style={{ color: ACCENT }}>{isSignUp ? 'destiny' : 'Warrior'}</Text>
                  </Text>
                  <Text style={styles.subheading}>
                    {isSignUp ? 'Begin your calisthenics journey' : 'Return to your training grounds'}
                  </Text>

                  {isSignUp && signupStep === 'choose' && (
                    <>
                      {renderSocialButtons()}
                      {renderDivider()}
                      <SocialButton
                        icon={<MaterialCommunityIcons name="email-outline" size={20} color="#1F1F1F" />}
                        label="Continue with Email"
                        onPress={() => setSignupStep('email')}
                      />
                    </>
                  )}

                  {isSignUp && signupStep === 'email' && (
                    <>
                      <TouchableOpacity style={styles.backButton} onPress={() => setSignupStep('choose')} hitSlop={8}>
                        <Text style={styles.backText}>← Back</Text>
                      </TouchableOpacity>

                      {renderEmailPasswordFields()}

                      <View style={styles.inviteCodeGroup}>
                        <GlassInput
                          placeholder={INVITE_CODE_REQUIRED ? 'Invite Code' : 'Invite Code (Optional)'}
                          value={inviteCode}
                          onChangeText={setInviteCode}
                          autoCapitalize="characters"
                          accessibilityLabel="Invite code"
                        />
                        {INVITE_CODE_REQUIRED ? (
                          <TouchableOpacity
                            onPress={() => Linking.openURL('https://leap-arena.com/request')}
                            style={{ marginTop: 6, alignSelf: 'flex-start' }}
                          >
                            <Text style={styles.linkText}>Don't have an invite code? Request one here</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.hintText}>Have one? Add it for trial/membership perks. Not required to join.</Text>
                        )}
                      </View>

                      <GlassButton title="CLAIM YOUR DESTINY" onPress={handleSubmit} loading={loading} />

                      <TouchableOpacity onPress={() => Linking.openURL('https://leap-arena.com/privacy')}>
                        <Text style={styles.privacyText}>
                          By signing up, you agree to our{' '}
                          <Text style={styles.privacyLink}>Privacy Policy</Text>
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {!isSignUp && (
                    <>
                      {renderEmailPasswordFields()}

                      <TouchableOpacity style={styles.forgotButton} onPress={() => setIsResetModalVisible(true)} hitSlop={8}>
                        <Text style={styles.forgotText}>Forgot password?</Text>
                      </TouchableOpacity>

                      <GlassButton title="ENTER THE ARENA" onPress={handleSubmit} loading={loading} />

                      {renderDivider()}
                      {renderSocialButtons()}
                    </>
                  )}
                </View>
              </BlurView>

              <TouchableOpacity
                style={styles.switchLink}
                onPress={() => { setIsSignUp(!isSignUp); setSignupStep('choose'); }}
                hitSlop={8}
              >
                <Text style={styles.switchText}>
                  {isSignUp ? 'Already a warrior? ' : 'New here? '}
                  <Text style={styles.switchLinkAccent}>
                    {isSignUp ? 'Return to battle →' : 'Begin your journey →'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* PASSWORD RESET MODAL */}
        <Modal
          visible={isResetModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => { setIsResetModalVisible(false); setResetSent(false); }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <BlurView intensity={50} tint="dark" style={styles.modalGlassCard}>
              <View style={styles.modalGlassCardContent}>
                <Text style={styles.modalHeading}>
                  Reset <Text style={{ color: ACCENT }}>Password</Text>
                </Text>

                {resetSent ? (
                  <View style={{ alignItems: 'center' }}>
                    <View style={styles.resetSentIcon}>
                      <Text style={{ color: ACCENT, fontSize: 28 }}>✓</Text>
                    </View>

                    <Text style={styles.resetSentTitle}>CHECK YOUR EMAIL</Text>
                    <Text style={styles.resetSentSubtext}>
                      We sent a password reset link to
                    </Text>
                    <Text style={styles.resetSentEmail}>{resetEmail}</Text>
                    <Text style={[styles.resetSentSubtext, { marginTop: 8, color: INK_TERTIARY }]}>
                      If you don't see it, check your spam folder.
                    </Text>

                    {/* Resend button with cooldown */}
                    <TouchableOpacity
                      style={[styles.resendButton, resendCooldown > 0 && styles.resendButtonDisabled]}
                      onPress={handleResetPassword}
                      disabled={resendCooldown > 0 || resetLoading}
                    >
                      <Text style={[styles.resendButtonText, resendCooldown > 0 && { color: INK_TERTIARY }]}>
                        {resetLoading
                          ? 'SENDING...'
                          : resendCooldown > 0
                            ? `RESEND IN ${resendCooldown}S`
                            : 'RESEND EMAIL'}
                      </Text>
                    </TouchableOpacity>

                    {/* Use a different email */}
                    <TouchableOpacity
                      style={{ marginTop: 12, padding: 8 }}
                      onPress={() => setResetSent(false)}
                    >
                      <Text style={styles.modalLinkText}>USE A DIFFERENT EMAIL</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ marginTop: 16, alignItems: 'center', padding: 8 }}
                      onPress={() => { setIsResetModalVisible(false); setResetSent(false); setResetEmail(''); }}
                    >
                      <Text style={styles.modalLinkText}>CLOSE</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <GlassInput
                      placeholder="warrior@email.com"
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      accessibilityLabel="Email"
                    />

                    <View style={{ marginTop: 12 }}>
                      <GlassButton title="SEND RESET LINK" onPress={handleResetPassword} loading={resetLoading} />
                    </View>

                    <TouchableOpacity
                      style={{ marginTop: 16, alignItems: 'center', padding: 8 }}
                      onPress={() => { setIsResetModalVisible(false); setResetEmail(''); }}
                    >
                      <Text style={styles.modalLinkText}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
  },
  centerWrap: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 18,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandName: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontWeight: 'bold',
    fontSize: 34,
    letterSpacing: 1,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  brandTagline: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 4,
    color: 'rgba(255,82,82,0.85)',
    marginTop: 6,
  },
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  glassCardContent: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 26,
    paddingHorizontal: 22,
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  segmentPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: ACCENT,
    borderRadius: 9,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  segmentText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: INK_SECONDARY,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  heading: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: INK_PRIMARY,
    marginBottom: 4,
  },
  subheading: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 13,
    color: INK_SECONDARY,
    marginBottom: 20,
  },
  fieldGroup: {
    gap: 12,
  },
  glassInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
    color: 'rgba(255,255,255,0.9)',
    minHeight: 44,
  },
  glassInputFocused: {
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  inviteCodeGroup: {
    marginTop: 12,
    marginBottom: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    color: INK_SECONDARY,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: 9,
    marginBottom: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 11,
    color: INK_SECONDARY,
  },
  ctaButton: {
    width: '100%',
    minHeight: 44,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonPressed: {
    backgroundColor: ACCENT_PRESSED,
    transform: [{ scale: 0.98 }],
  },
  ctaButtonDisabled: {
    opacity: 0.5,
  },
  ctaButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.6,
    color: '#FFFFFF',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: INK_TERTIARY,
    marginHorizontal: 12,
  },
  socialRow: {
    gap: 12,
  },
  socialButton: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  socialButtonDisabled: {
    opacity: 0.5,
  },
  socialButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#1F1F1F',
  },
  linkText: {
    color: ACCENT,
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
    textDecorationLine: 'underline',
  },
  hintText: {
    color: INK_TERTIARY,
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
    marginTop: 6,
  },
  privacyText: {
    color: INK_TERTIARY,
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Regular',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: 0.3,
  },
  privacyLink: {
    color: ACCENT,
    textDecorationLine: 'underline',
  },
  switchLink: {
    marginTop: 20,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  switchText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 13,
    color: INK_TERTIARY,
  },
  switchLinkAccent: {
    color: ACCENT,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalGlassCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modalGlassCardContent: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 24,
  },
  modalHeading: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 22,
    color: INK_PRIMARY,
    marginBottom: 16,
  },
  modalLinkText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12,
    letterSpacing: 1,
    color: INK_SECONDARY,
  },
  resetSentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  resetSentTitle: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 18,
    letterSpacing: 1,
    color: INK_PRIMARY,
    marginBottom: 8,
  },
  resetSentSubtext: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 13,
    color: INK_SECONDARY,
    textAlign: 'center',
  },
  resetSentEmail: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: ACCENT,
    marginTop: 4,
  },
  resendButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  resendButtonDisabled: {
    opacity: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resendButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
    letterSpacing: 1,
    color: ACCENT,
  },
});
