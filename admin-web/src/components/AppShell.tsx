import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { ThemeToggle } from '@/components/bits';
import { fetchUnreadCount } from '@/api/notifications';
import { fetchFairPlayCounts } from '@/api/fairPlay';
import { fetchProgramReviews } from '@/api/programReviews';
import { fetchAiCoachReports } from '@/api/aiCoachReports';
import { fetchCoachFlags } from '@/api/aiCoachChats';
import { UpdateNotice } from './UpdateNotice';

type BadgeKey = 'notifications' | 'reviews' | 'appeals' | 'flags' | 'aiReports' | 'chatFlags';

interface NavLeaf {
  to: string;
  label: string;
  badge?: BadgeKey;
  /** Which paths count as this page; default: the path itself and below it. */
  activeWhen?: (path: string) => boolean;
}

interface NavGroup {
  id: string;
  /** Omitted for the short coach menu's first group. */
  label?: string;
  items: NavLeaf[];
}

const exactly = (p: string) => (path: string) => path === p;
const under = (p: string) => (path: string) => path === p || path.startsWith(`${p}/`);

// Grouped by the job at hand (design phase 1, owner's choice).
const ADMIN_NAV: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', activeWhen: exactly('/') },
      { to: '/growth', label: 'Growth' },
      { to: '/notifications', label: 'Notifications', badge: 'notifications' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { to: '/users', label: 'Users' },
      { to: '/communities', label: 'Communities' },
    ],
  },
  {
    // Everything about the AI Coach in one place (owner's choice).
    id: 'ai-coach',
    label: 'AI Coach',
    items: [
      { to: '/ai-coach-chats', label: 'AI Coach chats', activeWhen: (p) => under('/ai-coach-chats')(p) && !p.startsWith('/ai-coach-chats/flags') },
      { to: '/ai-coach-chats/flags', label: 'AI chat flags', badge: 'chatFlags' },
      { to: '/ai-coach-reports', label: 'AI Coach reports', badge: 'aiReports' },
      { to: '/program-reviews', label: 'Program reviews', badge: 'reviews' },
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    items: [
      { to: '/fair-play', label: 'Fair Play flags', badge: 'flags', activeWhen: (p) => p === '/fair-play' || p.startsWith('/fair-play/athlete') },
      { to: '/fair-play/appeals', label: 'Appeals', badge: 'appeals' },
      { to: '/fair-play/inactive', label: 'Inactive athletes' },
    ],
  },
  {
    id: 'programs',
    label: 'Programs',
    items: [
      { to: '/coaching', label: 'Clients', activeWhen: (p) => p === '/coaching' || p.startsWith('/coaching/clients') },
      { to: '/coaching/builder', label: 'Program builder' },
      { to: '/coaching/exercises', label: 'Exercise library' },
      { to: '/coaching/workouts', label: 'Workout content' },
      { to: '/coaching/community', label: 'Coach community' },
      { to: '/coaching/analytics', label: 'Program analytics' },
    ],
  },
  {
    id: 'competitions',
    label: 'Competitions',
    items: [
      { to: '/challenges', label: 'Weekly challenges', activeWhen: exactly('/challenges') },
      { to: '/challenges/teams', label: 'Team challenges' },
      { to: '/challenges/live', label: 'Live challenges' },
      { to: '/challenges/templates', label: 'Templates' },
      { to: '/leaderboards', label: 'Leaderboards' },
      { to: '/challenges/analytics', label: 'Challenge analytics' },
    ],
  },
  {
    id: 'revenue',
    label: 'Revenue & settings',
    items: [
      { to: '/promo-codes', label: 'Promo codes' },
      { to: '/fair-play/limits', label: 'Fair Play limits' },
      // Not in use: invite codes are retired and Tournament ships with V2.
      { to: '/waitlist', label: 'Archive: Waitlist' },
      { to: '/tournaments', label: 'Archive: Tournaments' },
    ],
  },
];

// A coach's whole world is their own roster; no Analytics (admin-only RPCs).
const COACH_NAV: NavGroup[] = [
  { id: 'general', items: [{ to: '/notifications', label: 'Notifications', badge: 'notifications' }] },
  {
    id: 'coaching',
    label: 'Coaching',
    items: [
      { to: '/coaching', label: 'Clients', activeWhen: (p) => p === '/coaching' || p.startsWith('/coaching/clients') },
      { to: '/coaching/community', label: 'Community' },
      { to: '/coaching/builder', label: 'Program builder' },
      { to: '/coaching/exercises', label: 'Exercise library' },
    ],
  },
];

const COLLAPSED_KEY = 'admin-nav-collapsed';

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const isActive = (item: NavLeaf, path: string) => (item.activeWhen ?? under(item.to))(path);

function useBadges(isAdmin: boolean): Record<BadgeKey, number> {
  // Polling, not Realtime: a 45s-stale badge is fine for an admin panel.
  const every = { refetchInterval: 45_000 };
  const unreadQ = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: fetchUnreadCount, ...every });
  // Fair Play pages invalidate 'fair-play' after every action.
  const fairPlayQ = useQuery({ queryKey: ['fair-play', 'counts'], queryFn: fetchFairPlayCounts, enabled: isAdmin, ...every });
  const reviewsQ = useQuery({ queryKey: ['program-reviews', 'open'], queryFn: () => fetchProgramReviews('open'), enabled: isAdmin, ...every });
  const aiReportsQ = useQuery({ queryKey: ['ai-coach-reports', false], queryFn: () => fetchAiCoachReports(false), enabled: isAdmin, ...every });
  // Chat review is owner-only server-side; another admin just gets no badge.
  const chatFlagsQ = useQuery({
    queryKey: ['coach-flags', 'open'],
    queryFn: () => fetchCoachFlags('open'),
    enabled: isAdmin,
    retry: false,
    ...every,
  });
  return {
    notifications: unreadQ.data ?? 0,
    flags: fairPlayQ.data?.flags ?? 0,
    appeals: fairPlayQ.data?.appeals ?? 0,
    reviews: reviewsQ.data?.length ?? 0,
    aiReports: aiReportsQ.data?.length ?? 0,
    chatFlags: chatFlagsQ.data?.length ?? 0,
  };
}

function Count({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="nav-badge">{n > 99 ? '99+' : n}</span>;
}

export function AppShell() {
  const { profile, isAdmin, isCoach, signOut } = useAuth();
  const { pathname } = useLocation();
  const nav = isAdmin ? ADMIN_NAV : COACH_NAV;
  const badges = useBadges(isAdmin);

  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Storage blocked: folding still works for this visit.
      }
      return next;
    });
  }

  // Phone menu: closes on navigation and Esc; focus goes into it on open
  // and back to the ☰ button on close.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  const current = nav.flatMap((g) => g.items).find((item) => isActive(item, pathname));

  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <header className="topbar">
        <button
          ref={menuButtonRef}
          type="button"
          className="btn icon ghost"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="main-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <Link to={isAdmin ? '/' : '/coaching'} className="topbar-brand" aria-label="Home">
          LEAP
        </Link>
        <span className="topbar-title">{current?.label ?? ''}</span>
      </header>

      <div className="menu-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />

      <nav className="sidebar" id="main-menu" aria-label="Main" ref={sidebarRef}>
        <div className="sidebar-brand">
          <span className="mark">LEAP</span>
          <span className="scope">{isAdmin ? 'Admin' : isCoach ? 'Coach' : 'Assistant'}</span>
        </div>

        <div className="nav-groups">
          {nav.map((group) => {
            const hasActive = group.items.some((item) => isActive(item, pathname));
            // The group of the page you're on never folds away.
            const open = !group.label || hasActive || !collapsed.has(group.id);
            const total = group.items.reduce((sum, item) => sum + (item.badge ? badges[item.badge] : 0), 0);
            return (
              <div key={group.id} className="nav-group">
                {group.label && (
                  <button
                    type="button"
                    className="nav-group-head"
                    aria-expanded={open}
                    aria-controls={`nav-${group.id}`}
                    disabled={hasActive}
                    title={hasActive ? 'The page you are on is in this group' : undefined}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span>{group.label}</span>
                    {!open && <Count n={total} />}
                    <ChevronDown className={`nav-chevron${open ? ' open' : ''}`} aria-hidden="true" />
                  </button>
                )}
                {open && (
                  <div className="nav-group-items" id={`nav-${group.id}`}>
                    {group.items.map((item) => {
                      const active = isActive(item, pathname);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={`nav-item${active ? ' active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                        >
                          <span className="nav-item-label">{item.label}</span>
                          {item.badge && <Count n={badges[item.badge]} />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
        <UpdateNotice />
        <Outlet />
      </main>
    </div>
  );
}
