import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteClientData,
  fetchAssignments,
  fetchCoaches,
  setAssignmentStatus,
  type AssignmentRow,
} from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, programSource, PROGRAM_SOURCE_LABEL, type ProgramSource } from '@/shared/constants';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { AssignForm } from './AssignForm';
import { ProgressDrawer } from './ProgressDrawer';

function statusTone(status: string | null): 'ok' | 'warn' | 'accent' | undefined {
  if (status === 'active') return 'ok';
  if (status === 'paused') return 'warn';
  if (status === 'completed') return undefined;
  return undefined;
}

export function ClientsPage() {
  const { profile, isAdmin, isCoach, isCoachPaused, assistingCoachIds, pausedAssistingCoachIds } = useAuth();
  // An assistant (not independently a coach) never deletes a client
  // relationship — coach/admin only, per the permission matrix.
  const canDeleteClient = isAdmin || isCoach;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showAssign, setShowAssign] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Admin-only slice by where the program came from: a coach, a library
  // template the athlete picked (Leap system id) or the AI Coach (its system
  // id). Meaningless for a coach session, which only sees their own rows.
  const [originFilter, setOriginFilter] = useState<'all' | ProgramSource>('all');
  const [coachFilterId, setCoachFilterId] = useState<string>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['assignments'],
    queryFn: fetchAssignments,
  });
  const coachesQ = useQuery({ queryKey: ['coaches'], queryFn: fetchCoaches, enabled: isAdmin });

  const filteredData = data?.filter((a) => {
    if (!isAdmin) {
      // warrior_programs RLS also returns rows where the viewer is merely
      // the warrior (a client of some OTHER coach) — this table is "my
      // roster," not "every assignment I can see," so exclude those.
      return a.coach_id === profile?.id || assistingCoachIds.includes(a.coach_id);
    }
    if (originFilter !== 'all' && programSource(a.coach_id) !== originFilter) return false;
    if (originFilter === 'coach' && coachFilterId && a.coach_id !== coachFilterId) return false;
    return true;
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      setAssignmentStatus(vars.id, vars.status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['assignments'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClientData,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['assignments'] }),
  });

  const columns: Column<AssignmentRow>[] = [
    {
      key: 'warrior',
      header: 'Warrior',
      render: (a) => (
        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <span style={{ fontWeight: 700 }}>{a.warrior_name ?? a.warrior_id.slice(0, 8)}</span>
          {a.community_left_at && (
            <span title={`Left the community on ${formatDate(a.community_left_at)}`}>
              <Badge tone="warn">⚠ left community</Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'template',
      header: 'Program',
      render: (a) => a.template_name ?? '—',
    },
    ...(isAdmin
      ? [
          {
            key: 'coach',
            header: 'Source',
            render: (a: AssignmentRow) => {
              const source = programSource(a.coach_id);
              return source === 'coach' ? (
                <span className="dim">{a.coach_name ?? '—'}</span>
              ) : (
                <Badge tone={source === 'ai' ? 'accent' : undefined}>{PROGRAM_SOURCE_LABEL[source]}</Badge>
              );
            },
          } satisfies Column<AssignmentRow>,
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge tone={statusTone(a.status)}>{a.status ?? '—'}</Badge>,
    },
    {
      key: 'current_week',
      header: 'Week',
      align: 'right',
      render: (a) => <span className="num">{a.current_week ?? '—'}</span>,
    },
    {
      key: 'assigned_at',
      header: 'Assigned',
      render: (a) => <span className="dim">{formatDate(a.assigned_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => {
        // isCoachPaused only ever applies to a real coach's own account —
        // an assistant needs to check the specific coach this row belongs
        // to instead (they might assist several, only some of which are
        // paused).
        const rowPaused = isCoachPaused || pausedAssistingCoachIds.includes(a.coach_id);
        return (
          <span
            className="row"
            style={{ justifyContent: 'flex-end', gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            {a.status === 'active' ? (
              <button
                className="btn small"
                disabled={rowPaused}
                onClick={() => statusMutation.mutate({ id: a.id, status: 'paused' })}
              >
                Pause
              </button>
            ) : (
              <button
                className="btn small"
                disabled={rowPaused}
                onClick={() => statusMutation.mutate({ id: a.id, status: 'active' })}
              >
                Activate
              </button>
            )}
            <button
              className="btn small"
              disabled={rowPaused}
              onClick={() => statusMutation.mutate({ id: a.id, status: 'completed' })}
            >
              Complete
            </button>
            <button className="btn small" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
              Progress
            </button>
            <ConfirmButton
              label="Delete"
              danger
              disabled={rowPaused || !canDeleteClient}
              title={`Delete ${a.warrior_name ?? 'this warrior'}'s program data?`}
              body={`Removes ${programSource(a.coach_id) === 'coach' ? 'the assignment, its program copy' : `the athlete's own ${PROGRAM_SOURCE_LABEL[programSource(a.coach_id)].toLowerCase()} program`} and every workout they logged on it. This cannot be undone.`}
              confirmLabel="Delete"
              onConfirm={() => deleteMutation.mutateAsync(a.id)}
            />
          </span>
        );
      },
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <div className="sub">
            {isAdmin ? "Every coach's assignments, arena-wide." : 'Your assigned clients.'}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" disabled={isCoachPaused} onClick={() => setShowAssign((s) => !s)}>
            {showAssign ? 'Close' : '+ Assign program'}
          </button>
        </div>
      </div>

      {isCoachPaused && (
        <div className="notice">
          Your coaching access is paused by an admin. You can still view your roster, but assigning,
          updating, or removing programs is disabled until it's resumed.
        </div>
      )}

      {error && <ErrorNote error={error} />}
      {statusMutation.error && <ErrorNote error={statusMutation.error} />}
      {deleteMutation.error && <ErrorNote error={deleteMutation.error} />}

      {showAssign && (
        <AssignForm
          onDone={() => {
            setShowAssign(false);
            void queryClient.invalidateQueries({ queryKey: ['assignments'] });
          }}
        />
      )}

      {isAdmin && (
        <div className="row" style={{ gap: 6 }}>
          {(['all', 'coach', 'library', 'ai'] as const).map((o) => (
            <button
              key={o}
              className={`btn small${originFilter === o ? ' primary' : ''}`}
              aria-pressed={originFilter === o}
              onClick={() => setOriginFilter(o)}
            >
              {o === 'all' ? 'All' : PROGRAM_SOURCE_LABEL[o]}
              {data ? ` (${o === 'all' ? data.length : data.filter((a) => programSource(a.coach_id) === o).length})` : ''}
            </button>
          ))}
          {originFilter === 'coach' && (
            <select
              className="field"
              style={{ minWidth: 160 }}
              value={coachFilterId}
              onChange={(e) => setCoachFilterId(e.target.value)}
              aria-label="Filter by coach"
            >
              <option value="">All coaches</option>
              {coachesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="panel">
        <DataTable
          columns={columns}
          rows={filteredData}
          rowKey={(a) => a.id}
          loading={isLoading}
          emptyLabel="No client programs"
          emptyHint="Assign a template to a warrior to start a coaching relationship."
          onRowClick={(a) => navigate(`/coaching/clients/${a.id}`)}
        />
      </div>

      {expanded && data && (
        <section className="panel">
          <div className="panel-head">
            <h2>
              Progress — {data.find((a) => a.id === expanded)?.warrior_name ?? 'warrior'}
            </h2>
            <button className="btn small" onClick={() => setExpanded(null)}>
              Close
            </button>
          </div>
          <ProgressDrawer assignment={data.find((a) => a.id === expanded)!} />
        </section>
      )}
    </div>
  );
}
