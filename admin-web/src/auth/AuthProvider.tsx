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
  /** signed in but has neither is_admin, is_coach, nor an assistant relationship — no role at all */
  denied: boolean;
  isAdmin: boolean;
  isCoach: boolean;
  /** is_coach, has a coaching_paused_at set by an admin — read-only, all writes blocked server-side */
  isCoachPaused: boolean;
  /** has delegated access to at least one coach's roster, without being a coach themselves */
  isAssistant: boolean;
  /** coach ids this user is a registered assistant for (empty if none/not applicable) */
  assistingCoachIds: string[];
  /** subset of assistingCoachIds whose coaching access is currently paused —
   * an assistant's OWN isCoachPaused is always false (that flag only exists
   * on real coach accounts), so a page acting on a specific coach's data
   * needs to check that coach's id against this set instead. */
  pausedAssistingCoachIds: string[];
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [assistingCoachIds, setAssistingCoachIds] = useState<string[]>([]);
  const [pausedAssistingCoachIds, setPausedAssistingCoachIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(s: Session | null) {
      if (!s) {
        if (!cancelled) {
          setProfile(null);
          setAssistingCoachIds([]);
          setPausedAssistingCoachIds([]);
          setLoading(false);
        }
        return;
      }
      // Same own-profile read path as the mobile app; keeps working after
      // the profiles PII column re-lockdown.
      const [{ data, error }, { data: assistantRows }] = await Promise.all([
        supabase.rpc('get_my_profile').single(),
        supabase.from('coach_assistants').select('coach_id').eq('assistant_id', s.user.id),
      ]);
      if (cancelled) return;
      setProfile(error ? null : (data as MyProfile));
      const coachIds = (assistantRows ?? []).map((r) => r.coach_id as string);
      setAssistingCoachIds(coachIds);

      if (coachIds.length > 0) {
        const { data: pausedRows } = await supabase
          .from('profiles')
          .select('id')
          .in('id', coachIds)
          .not('coaching_paused_at', 'is', null);
        if (cancelled) return;
        setPausedAssistingCoachIds((pausedRows ?? []).map((r) => r.id as string));
      } else {
        setPausedAssistingCoachIds([]);
      }

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

  const isAdmin = profile?.is_admin === true;
  const isCoach = profile?.is_coach === true;
  const isAssistant = assistingCoachIds.length > 0;

  const value: AuthState = {
    session,
    profile,
    loading,
    denied: !!session && !loading && !isAdmin && !isCoach && !isAssistant,
    isAdmin,
    isCoach,
    isCoachPaused: isCoach && !isAdmin && !!profile?.coaching_paused_at,
    isAssistant,
    assistingCoachIds,
    pausedAssistingCoachIds,
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
