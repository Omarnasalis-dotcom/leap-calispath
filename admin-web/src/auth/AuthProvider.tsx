import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { MyProfile } from '@/shared/types';

// 8h without any pointer/key activity → sign out (localStorage sessions on
// shared machines). Checked once a minute.
const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000;

interface AuthState {
  session: Session | null;
  profile: MyProfile | null;
  /** true until the initial session + profile check settles */
  loading: boolean;
  /** signed in but profile.is_admin !== true */
  denied: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(s: Session | null) {
      if (!s) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      // Same own-profile read path as the mobile app; keeps working after
      // the profiles PII column re-lockdown.
      const { data, error } = await supabase.rpc('get_my_profile').single();
      if (cancelled) return;
      setProfile(error ? null : (data as MyProfile));
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      void loadProfile(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadProfile(s);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const timer = window.setInterval(() => {
      if (session && Date.now() - lastActivity.current > IDLE_LIMIT_MS) {
        void supabase.auth.signOut();
      }
    }, 60_000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      window.clearInterval(timer);
    };
  }, [session]);

  const value: AuthState = {
    session,
    profile,
    loading,
    denied: !!session && !loading && profile?.is_admin !== true,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
