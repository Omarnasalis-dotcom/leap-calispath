import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUserProfile, fetchUserTrialHistory, grantRole } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import {
  tierName,
  formatDate,
  formatDateTime,
  formatSeconds,
} from '@/shared/constants';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import type { TrialHistoryRow } from '@/shared/types';

const TRIAL_COLUMNS: Column<TrialHistoryRow>[] = [
  {
    key: 'tier_attempted',
    header: 'Trial',
    render: (t) => (
      <span>
        <span className="num" style={{ fontWeight: 700 }}>
          {t.tier_attempted}
        </span>{' '}
        <span style={{ color: 'var(--ink-2)' }}>{tierName(t.tier_attempted)}</span>
      </span>
    ),
  },
  {
    key: 'completed',
    header: 'Result',
    render: (t) =>
      t.completed ? <Badge tone="ok">passed</Badge> : <Badge>abandoned</Badge>,
  },
  {
    key: 'time_seconds',
    header: 'Time',
    align: 'right',
    render: (t) => <span className="num">{formatSeconds(t.time_seconds)}</span>,
  },
  {
    key: 'attempted_at',
    header: 'When',
    render: (t) => <span className="dim">{formatDateTime(t.attempted_at)}</span>,
  },
];

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { profile: me } = useAuth();
  const queryClient = useQueryClient();

  const profileQ = useQuery({
    queryKey: ['user-profile', id],
    queryFn: () => fetchUserProfile(id),
    enabled: !!id,
  });
  const trialsQ = useQuery({
    queryKey: ['user-trials', id],
    queryFn: () => fetchUserTrialHistory(id),
    enabled: !!id,
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { role: 'admin' | 'coach'; enabled: boolean }) =>
      grantRole(id, vars.role, vars.enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-profile', id] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const u = profileQ.data;
  const isSelf = me?.id === id;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            <Link to="/users" style={{ textDecoration: 'none' }}>
              Users
            </Link>{' '}
            / profile
          </div>
          <h1>{u ? u.display_name || u.email || 'Unnamed warrior' : '…'}</h1>
          {u && (
            <div className="sub row" style={{ gap: 6 }}>
              <span className="num" style={{ fontWeight: 700, color: 'var(--ink)' }}>
                Tier {u.strength_tier ?? '—'} · {tierName(u.strength_tier)}
              </span>
              {u.is_admin && <Badge tone="accent">admin</Badge>}
              {u.is_coach && <Badge>coach</Badge>}
            </div>
          )}
        </div>
        {u && (
          <div className="row">
            <ConfirmButton
              label={u.is_coach ? 'Revoke coach' : 'Make coach'}
              title={`${u.is_coach ? 'Revoke coach from' : 'Grant coach to'} ${u.display_name || u.email}?`}
              body="Coach access opens the coaching center and client management."
              confirmLabel={u.is_coach ? 'Revoke' : 'Grant'}
              danger={u.is_coach}
              onConfirm={() =>
                roleMutation.mutateAsync({ role: 'coach', enabled: !u.is_coach })
              }
            />
            <ConfirmButton
              label={u.is_admin ? 'Revoke admin' : 'Make admin'}
              title={`${u.is_admin ? 'Revoke admin from' : 'Grant admin to'} ${u.display_name || u.email}?`}
              body={
                u.is_admin
                  ? isSelf
                    ? 'This is your own account — you will lose access to this panel.'
                    : 'They lose all admin surfaces immediately.'
                  : 'Full admin: this panel, every RLS admin path, role management.'
              }
              confirmLabel={u.is_admin ? 'Revoke' : 'Grant'}
              danger={u.is_admin}
              onConfirm={() =>
                roleMutation.mutateAsync({ role: 'admin', enabled: !u.is_admin })
              }
            />
          </div>
        )}
      </div>

      {profileQ.error && <ErrorNote error={profileQ.error} />}
      {roleMutation.error && <ErrorNote error={roleMutation.error} />}

      {!u && !profileQ.error && <div className="skeleton" style={{ height: 220 }} />}

      {u && (
        <div className="grid-2">
          <section className="panel">
            <div className="panel-head">
              <h2>Account</h2>
            </div>
            <div className="panel-body">
              <dl className="kv">
                <dt>Email</dt>
                <dd>{u.email ?? '—'}</dd>
                <dt>Name</dt>
                <dd>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</dd>
                <dt>Country</dt>
                <dd>{u.country ?? '—'}</dd>
                <dt>Gender</dt>
                <dd>{u.gender ?? '—'}</dd>
                <dt>Community</dt>
                <dd>{u.community_name ?? '—'}</dd>
                <dt>Signed up</dt>
                <dd>{formatDate(u.auth_created_at)}</dd>
                <dt>Last sign-in</dt>
                <dd>{formatDateTime(u.last_sign_in_at)}</dd>
                <dt>Last active</dt>
                <dd>{formatDateTime(u.last_active)}</dd>
                <dt>Invite code used</dt>
                <dd>{u.invite_code_used ?? '—'}</dd>
                <dt>Access expires</dt>
                <dd>{formatDate(u.access_expires_at)}</dd>
              </dl>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Progression</h2>
            </div>
            <div className="panel-body">
              <dl className="kv">
                <dt>Strength tier</dt>
                <dd className="num">
                  {u.strength_tier ?? '—'} · {tierName(u.strength_tier)}
                </dd>
                <dt>Power tier</dt>
                <dd className="num">{u.power_tier ?? '—'}</dd>
                <dt>Statics tier</dt>
                <dd className="num">{u.statics_tier ?? '—'}</dd>
                <dt>Glory score</dt>
                <dd className="num">{u.glory_score ?? 0}</dd>
                <dt>Power points</dt>
                <dd className="num">{Math.round(u.power_points ?? 0)}</dd>
                <dt>1MM points</dt>
                <dd className="num">{Math.round(u.one_mm_points ?? 0)}</dd>
                <dt>Streak</dt>
                <dd className="num">{u.streak ?? 0}</dd>
                <dt>Assessed</dt>
                <dd>{formatDate(u.assessed_at)}</dd>
                <dt>Trials</dt>
                <dd className="num">
                  {u.stats.trials_completed} passed / {u.stats.trials_total} attempted
                </dd>
                <dt>Weekly entries</dt>
                <dd className="num">{u.stats.weekly_entries}</dd>
                <dt>Workout logs</dt>
                <dd className="num">{u.stats.workout_logs}</dd>
                <dt>Static holds</dt>
                <dd className="num">{u.stats.static_holds}</dd>
                <dt>1MM logs</dt>
                <dd className="num">{u.stats.one_mm_logs}</dd>
              </dl>
            </div>
          </section>
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Trial history</h2>
          {trialsQ.data && (
            <span className="label num">{trialsQ.data.length} attempts</span>
          )}
        </div>
        {trialsQ.error && (
          <div className="panel-body">
            <ErrorNote error={trialsQ.error} />
          </div>
        )}
        <DataTable
          columns={TRIAL_COLUMNS}
          rows={trialsQ.data}
          rowKey={(t) => t.id}
          loading={trialsQ.isLoading}
          emptyLabel="No trials yet"
          emptyHint="This warrior hasn't attempted a rite of passage."
        />
      </section>
    </div>
  );
}
