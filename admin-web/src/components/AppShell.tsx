import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';

const NAV: Array<
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
  { to: '/coaching/builder', label: 'Program builder' },
  { to: '/coaching/exercises', label: 'Exercise library' },
  { to: '/coaching/analytics', label: 'Analytics' },
  { section: 'Arena' },
  { to: '/communities', label: 'Communities' },
  { to: '/waitlist', label: 'Waitlist' },
  { to: '/tournaments', label: 'Tournaments' },
];

export function AppShell() {
  const { profile, signOut } = useAuth();

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar-brand">
          <span className="mark">LEAP</span>
          <span className="scope">Admin</span>
        </div>
        {NAV.map((item) =>
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
          <button className="btn small" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
