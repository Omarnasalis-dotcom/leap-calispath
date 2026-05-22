import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AuthContextType, Profile } from '../types';
import { User } from '@supabase/supabase-js';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    // Check onboarding
    AsyncStorage.getItem('hasSeenOnboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
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

  async function fetchProfile(userId: string) {
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
  }

  async function signUp(email: string, password: string, metadata?: { firstName: string, lastName: string, gender: string, country: string, displayName: string }) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log('Attempting signup with timezone:', timezone);
    
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

    console.log('Signup result:', { data, error });
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
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    setHasSeenOnboarding(true);
  }

  const value: AuthContextType = {
    user,
    profile,
    loading,
    needsPasswordReset,
    hasSeenOnboarding,
    completeOnboarding,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    clearPasswordReset,
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#CD7F32', fontSize: 24, fontWeight: '900', letterSpacing: 4 }}>
          LEAP CALISPATH
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
          Loading...
        </Text>
      </View>
    );
  }

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
