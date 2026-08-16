import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { LoginPage } from '@/auth/LoginPage';
import { AccessDenied } from '@/auth/AccessDenied';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { UserListPage } from '@/pages/users/UserListPage';
import { UserDetailPage } from '@/pages/users/UserDetailPage';
import { CommunitiesPage } from '@/pages/communities/CommunitiesPage';
import { LeaderboardsPage } from '@/pages/leaderboards/LeaderboardsPage';
import { WaitlistPage } from '@/pages/waitlist/WaitlistPage';
import { TournamentsPage } from '@/pages/tournaments/TournamentsPage';
import { ChallengeWeekPage } from '@/pages/challenges/ChallengeWeekPage';
import { TemplatesPage } from '@/pages/challenges/TemplatesPage';
import { ChallengeAnalyticsPage } from '@/pages/challenges/ChallengeAnalyticsPage';
import { ExerciseLibraryPage } from '@/pages/coaching/ExerciseLibraryPage';
import { ClientsPage } from '@/pages/coaching/ClientsPage';
import { CommunityPage } from '@/pages/coaching/CommunityPage';
import { ProgramBuilderPage } from '@/pages/coaching/ProgramBuilderPage';
import { CoachingAnalyticsPage } from '@/pages/coaching/CoachingAnalyticsPage';
import { ClientProgramGrid } from '@/pages/coaching/builder/ClientProgramGrid';
import { ClientProgressPage } from '@/pages/coaching/ClientProgressPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { BuilderClipboardProvider } from '@/contexts/BuilderClipboardContext';

function Gate() {
  const { session, loading, denied } = useAuth();

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="skeleton" style={{ width: 200, height: 32 }} />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (denied) return <AccessDenied />;
  return <AppShell />;
}

// Everything outside /coaching is admin-only. A coach (non-admin) isn't
// "denied" globally — they just get bounced to their own landing page
// instead of an error screen, same as hitting any other route that isn't
// theirs.
function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/coaching" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Gate />}>
              <Route element={<RequireAdmin />}>
                <Route index element={<DashboardPage />} />
                <Route path="users" element={<UserListPage />} />
                <Route path="users/:id" element={<UserDetailPage />} />
                <Route path="communities" element={<CommunitiesPage />} />
                <Route path="challenges" element={<ChallengeWeekPage />} />
                <Route path="challenges/templates" element={<TemplatesPage />} />
                <Route path="challenges/analytics" element={<ChallengeAnalyticsPage />} />
                <Route path="leaderboards" element={<LeaderboardsPage />} />
                <Route path="waitlist" element={<WaitlistPage />} />
                <Route path="tournaments" element={<TournamentsPage />} />
              </Route>
              {/* Reachable by admin, coach, and assistant alike — RLS scopes
                  each signed-in user to their own notification rows, so no
                  route-level gating is needed here either. */}
              <Route path="notifications" element={<NotificationsPage />} />
              {/* Reachable by admin and coach alike — each page scopes its
                  own data (community-owned roster for a coach, unrestricted
                  for admin) rather than being gated at the route level. */}
              <Route
                path="coaching"
                element={
                  <BuilderClipboardProvider>
                    <Outlet />
                  </BuilderClipboardProvider>
                }
              >
                <Route index element={<ClientsPage />} />
                <Route path="community" element={<CommunityPage />} />
                <Route path="clients/:assignmentId" element={<ClientProgramGrid />} />
                <Route path="clients/:assignmentId/progress" element={<ClientProgressPage />} />
                <Route path="builder" element={<ProgramBuilderPage />} />
                <Route path="exercises" element={<ExerciseLibraryPage />} />
                <Route element={<RequireAdmin />}>
                  <Route path="analytics" element={<CoachingAnalyticsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
