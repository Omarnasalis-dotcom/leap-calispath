import { createClient } from '@supabase/supabase-js';

// Anon key only — same key the mobile binaries ship. All admin capability
// is enforced server-side (RLS is_admin policies + admin RPC guards); this
// client holds no privilege the app doesn't already expose.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Mirrors the mobile client: no magic-link/url session handling here.
    detectSessionInUrl: false,
  },
});
