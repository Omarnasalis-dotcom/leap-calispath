import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { ProgramBuilderPage } from '@/pages/coaching/ProgramBuilderPage';
import { CoachingAnalyticsPage } from '@/pages/coaching/CoachingAnalyticsPage';

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Gate />}>
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<UserListPage />} />
              <Route path="users/:id" element={<UserDetailPage />} />
              <Route path="communities" element={<CommunitiesPage />} />
              <Route path="challenges" element={<ChallengeWeekPage />} />
              <Route path="challenges/templates" element={<TemplatesPage />} />
              <Route path="challenges/analytics" element={<ChallengeAnalyticsPage />} />
              <Route path="coaching" element={<ClientsPage />} />
              <Route path="coaching/builder" element={<ProgramBuilderPage />} />
              <Route path="coaching/exercises" element={<ExerciseLibraryPage />} />
              <Route path="coaching/analytics" element={<CoachingAnalyticsPage />} />
              <Route path="leaderboards" element={<LeaderboardsPage />} />
              <Route path="waitlist" element={<WaitlistPage />} />
              <Route path="tournaments" element={<TournamentsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
