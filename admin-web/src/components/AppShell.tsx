import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { ThemeToggle } from '@/components/bits';
import { fetchUnreadCount } from '@/api/notifications';

const ADMIN_NAV: Array<
  { section: string } | { to: string; label: string; end?: boolean }
> = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/notifications', label: 'Notifications' },
  { to: '/users', label: 'Users' },
  { to: '/leaderboards', label: 'Leaderboards' },
  { section: 'Challenges' },
  { to: '/challenges', label: 'Week editor', end: true },
  { to: '/challenges/templates', label: 'Templates' },
  { to: '/challenges/analytics', label: 'Analytics' },
  { section: 'Coaching' },
  { to: '/coaching', label: 'Clients', end: true },
  { to: '/coaching/community', label: 'Community' },
  { to: '/coaching/builder', label: 'Program builder' },
  { to: '/coaching/exercises', label: 'Exercise library' },
  { to: '/coaching/workouts', label: 'Workout content' },
  { to: '/coaching/analytics', label: 'Analytics' },
  { section: 'Arena' },
  { to: '/communities', label: 'Communities' },
  { to: '/waitlist', label: 'Waitlist' },
  { to: '/tournaments', label: 'Tournaments' },
];

// A coach's whole world is their own roster — no Dashboard/Users/Arena
// sections, and no Analytics (its RPCs are admin-only today).
const COACH_NAV: Array<{ section: string } | { to: string; label: string; end?: boolean }> = [
  { to: '/notifications', label: 'Notifications' },
  { section: 'Coaching' },
  { to: '/coaching', label: 'Clients', end: true },
  { to: '/coaching/community', label: 'Community' },
  { to: '/coaching/builder', label: 'Program builder' },
  { to: '/coaching/exercises', label: 'Exercise library' },
];

export function AppShell() {
  const { profile, isAdmin, isCoach, signOut } = useAuth();
  const nav = isAdmin ? ADMIN_NAV : COACH_NAV;

  // Polling, not Realtime: this app has no existing live-update mechanism
  // (no Supabase Realtime usage anywhere in admin-web today), and a 45s-stale
  // coaching-dashboard badge is an acceptable tradeoff against introducing
  // that infra for the first time here.
  const unreadQ = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 45_000,
  });
  const unreadCount = unreadQ.data ?? 0;

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar-brand">
          <span className="mark">LEAP</span>
          <span className="scope">{isAdmin ? 'Admin' : isCoach ? 'Coach' : 'Assistant'}</span>
        </div>
        {nav.map((item) =>
          'section' in item ? (
            <span key={item.section} className="label sidebar-section">
              {item.section}
            </span>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {item.label}
              {item.to === '/notifications' && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </NavLink>
          ),
        )}
        <div className="sidebar-foot">
          <span className="who" title={profile?.email ?? undefined}>
            {profile?.display_name || profile?.email}
          </span>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="btn small" style={{ flex: 1 }} onClick={() => void signOut()}>
              Sign out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
