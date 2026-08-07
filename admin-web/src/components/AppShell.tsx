import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { ThemeToggle } from '@/components/bits';

const ADMIN_NAV: Array<
  { section: string } | { to: string; label: string; end?: boolean }
> = [
  { to: '/', label: 'Dashboard', end: true },
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
  { to: '/coaching/analytics', label: 'Analytics' },
  { section: 'Arena' },
  { to: '/communities', label: 'Communities' },
  { to: '/waitlist', label: 'Waitlist' },
  { to: '/tournaments', label: 'Tournaments' },
];

// A coach's whole world is their own roster — no Dashboard/Users/Arena
// sections, and no Analytics (its RPCs are admin-only today).
const COACH_NAV: Array<{ section: string } | { to: string; label: string; end?: boolean }> = [
  { section: 'Coaching' },
  { to: '/coaching', label: 'Clients', end: true },
  { to: '/coaching/community', label: 'Community' },
  { to: '/coaching/builder', label: 'Program builder' },
  { to: '/coaching/exercises', label: 'Exercise library' },
];

export function AppShell() {
  const { profile, isAdmin, isCoach, signOut } = useAuth();
  const nav = isAdmin ? ADMIN_NAV : COACH_NAV;

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
