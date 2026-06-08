import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AuthContextType, Profile } from '../types';
import { User } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);

  // Handle deep link on cold start (e.g. password reset email link)
  useEffect(() => {
    async function handleInitialURL() {
      try {
        const url = await Linking.getInitialURL();
        if (url && url.includes('reset-password')) {
          const parsed = Linking.parse(url);
          const token = parsed.queryParams?.token as string;
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
        const token = parsed.queryParams?.token as string;
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
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      setProfile(data);
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
