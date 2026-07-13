import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AuthContextType, Profile } from '../types';
import { User } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

let googleSigninConfigured = false;
function ensureGoogleSigninConfigured() {
  if (googleSigninConfigured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  googleSigninConfigured = true;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  // onAuthStateChange below is registered once (mount-only effect) and would
  // otherwise close over a stale `needsPasswordReset` value forever; track
  // the live value in a ref so that closure can read current state.
  const needsPasswordResetRef = useRef(false);
  useEffect(() => {
    needsPasswordResetRef.current = needsPasswordReset;
  }, [needsPasswordReset]);

  // Handle deep link on cold start (e.g. password reset email link).
  // Native only: on web this raced with ResetPasswordScreen's own gated
  // verifyOtp call for the same single-use recovery token — whichever of
  // the two fired second always failed with "invalid or expired", and a
  // silent failure here (no error surfaced) could leave a stale existing
  // session in place, letting the user fall through into the main app
  // instead of the reset flow. Web owns this entirely in ResetPasswordScreen.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    async function handleInitialURL() {
      try {
        const url = await Linking.getInitialURL();
        if (url && url.includes('reset-password')) {
          const parsed = Linking.parse(url);
          const token = (parsed.queryParams?.token_hash || parsed.queryParams?.token) as string;
          const type = parsed.queryParams?.type as string;
          if (token && type === 'recovery') {
            const { error } = await supabase.auth.verifyOtp({
              token_hash: token,
              type: 'recovery',
            });
            if (!error) {
              setNeedsPasswordReset(true);
              setUser(null);
            }
          }
        }
      } catch (err) {
        // Silent — cold start URL parsing is best-effort
      }
    }

    // Also listen for URLs when app is already open
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (url && url.includes('reset-password')) {
        const parsed = Linking.parse(url);
        const token = (parsed.queryParams?.token_hash || parsed.queryParams?.token) as string;
        const type = parsed.queryParams?.type as string;
        if (token && type === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery',
          });
          if (!error) {
            setNeedsPasswordReset(true);
            setUser(null);
          }
        }
      }
    });

    handleInitialURL();
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Timeout safety - never stay loading forever
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // Check for existing session
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        clearTimeout(timeoutId);
        if (error) {
          console.error('Session error:', error);
          setUser(null);
        } else {
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchProfile(session.user.id);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error('Failed to get session:', err);
        setUser(null);
        setLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User tapped the reset link. Set the session silently but route them
        // to the reset password screen instead of the main app.
        setNeedsPasswordReset(true);
        setUser(null); // keep them out of the main app
        return;
      }

      if (needsPasswordResetRef.current) {
        // Still mid-reset: updateUser({password}) fires USER_UPDATED on the
        // same recovery session. Letting that fall through to setUser/
        // fetchProfile below flips profileLoading on while profile is still
        // null, which trips AuthGuard's loading-spinner check and unmounts
        // the reset screen mid-flow — losing its pending exit timer and
        // bouncing back into a fresh, re-triggered verification attempt.
        return;
      }

      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function registerPushToken(userId: string) {
    if (Platform.OS === 'web') return;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);
    } catch (error) {
      console.error('[Push] Token registration failed:', error);
    }
  }

  async function fetchProfile(userId: string) {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_my_profile')
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Error fetching profile:', error);
        }
        return;
      }

      setProfile(data as Profile);
      registerPushToken(userId);
    } finally {
      setProfileLoading(false);
    }
  }

  async function signUp(email: string, password: string, metadata?: { firstName: string, lastName: string, gender: string, country: string, displayName: string }) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { 
          timezone,
          first_name: metadata?.firstName,
          last_name: metadata?.lastName,
          gender: metadata?.gender,
          country: metadata?.country,
          display_name: metadata?.displayName
        },
      },
    });

    if (error) throw error;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  }

  function mapSocialAuthError(err: any): Error {
    // Supabase's typed auth error codes for the "this identity/email is
    // already tied to a different sign-in method" family of failures.
    if (err?.code === 'identity_already_exists') {
      return new Error('This account is already linked to another Leap Arena profile.');
    }
    if (['email_exists', 'user_already_exists', 'manual_linking_disabled'].includes(err?.code)) {
      return new Error('An account already exists with this email using a different sign-in method. Try signing in with your email and password instead.');
    }
    if (err instanceof TypeError || /network/i.test(err?.message ?? '')) {
      return new Error('Network error. Please check your connection and try again.');
    }
    return err instanceof Error ? err : new Error('Sign-in failed. Please try again.');
  }

  async function signInWithGoogle() {
    if (Platform.OS === 'web') {
      throw new Error('Google sign-in is not yet available on web.');
    }

    ensureGoogleSigninConfigured();

    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        return; // user cancelled — not an error, nothing to surface
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        throw new Error('Google did not return an ID token. Please try again.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
    } catch (err: any) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) {
          return;
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          throw new Error('Google Play Services is not available or out of date on this device.');
        }
      }
      throw mapSocialAuthError(err);
    }
  }

  async function signInWithApple() {
    if (Platform.OS !== 'ios') {
      throw new Error('Sign in with Apple is only available on iOS.');
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token. Please try again.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;

      // Apple only ever returns the user's name on the very first authorization
      // for this app — capture it now into the profile row the DB trigger just
      // created, since it can never be retrieved again on later sign-ins.
      const firstName = credential.fullName?.givenName ?? undefined;
      const lastName = credential.fullName?.familyName ?? undefined;
      if (firstName || lastName) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id) {
          await supabase
            .from('profiles')
            .update({ first_name: firstName, last_name: lastName })
            .eq('id', authData.user.id);
        }
      }
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      throw mapSocialAuthError(err);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function refreshProfile() {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }

  /**
   * Called after the user successfully updates their password.
   * Signs them out so they land on the login screen with a clean session.
   */
  async function clearPasswordReset() {
    setNeedsPasswordReset(false);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }
    setUser(null);
    setProfile(null);
  }

  async function completeOnboarding() {
    // Deprecated in V1. Unused.
  }

  const value: AuthContextType = {
    user,
    profile,
    loading,
    profileLoading,
    needsPasswordReset,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signOut,
    refreshProfile,
    clearPasswordReset,
  };


  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
