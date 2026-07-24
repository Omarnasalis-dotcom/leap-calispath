import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignTemplate,
  deleteClientData,
  fetchAssignments,
  fetchCoaches,
  fetchProgramTemplates,
  setAssignmentStatus,
  type AssignmentRow,
} from '@/api/coaching';
import { searchUsers } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, LEAP_SYSTEM_PROFILE_ID } from '@/shared/constants';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { ApplyTemplateForm } from './builder/ApplyTemplateForm';
import { ProgressDrawer } from './ProgressDrawer';

function statusTone(status: string | null): 'ok' | 'warn' | 'accent' | undefined {
  if (status === 'active') return 'ok';
  if (status === 'paused') return 'warn';
  if (status === 'completed') return undefined;
  return undefined;
}

function AssignForm({ onDone }: { onDone: () => void }) {
  const { profile: me } = useAuth();
  const [warriorQuery, setWarriorQuery] = useState('');
  const [warriorId, setWarriorId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [coachId, setCoachId] = useState(me?.id ?? '');
  const [customName, setCustomName] = useState('');

  const templatesQ = useQuery({
    queryKey: ['program-templates'],
    queryFn: fetchProgramTemplates,
  });
  const coachesQ = useQuery({ queryKey: ['coaches'], queryFn: fetchCoaches });
  const warriorsQ = useQuery({
    queryKey: ['warrior-search', warriorQuery],
    queryFn: () =>
      searchUsers({ query: warriorQuery, sort: 'display_name', desc: false, page: 0, pageSize: 20 }),
    enabled: warriorQuery.trim().length >= 2,
  });
  // Shares the ['assignments'] cache with the client table below — used
  // here only to check whether the selected warrior already has an active
  // program, so a re-assign doesn't silently clone-and-orphan their
  // existing weeks/history (assign_program_template auto-completes any
  // prior active assignment the instant a new one is created).
  const assignmentsQ = useQuery({ queryKey: ['assignments'], queryFn: fetchAssignments });
  const existingActiveAssignment = assignmentsQ.data?.find(
    (a) => a.warrior_id === warriorId && a.status === 'active',
  );

  const assignMutation = useMutation({
    mutationFn: () => {
      // assign_program_template clones the template under this name — the
      // column is NOT NULL, so mirror the mobile app's default naming.
      const templateName =
        templatesQ.data?.find((t) => t.id === templateId)?.name ?? 'Program';
      const warriorName =
        warriorsQ.data?.find((w) => w.id === warriorId)?.display_name ?? warriorQuery;
      return assignTemplate({
        coachId,
        warriorId,
        templateId,
        customName: customName.trim() || `${templateName} — ${warriorName}`,
      });
    },
    onSuccess: onDone,
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Assign a program</h2>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {assignMutation.error && <ErrorNote error={assignMutation.error} />}
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              className="field"
              style={{ width: '100%' }}
              placeholder="Search warrior (min 2 chars)…"
              value={warriorQuery}
              onChange={(e) => {
                setWarriorQuery(e.target.value);
                setWarriorId('');
              }}
              aria-label="Search warrior"
            />
            {warriorsQ.data && !warriorId && (
              <div className="panel" style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                {warriorsQ.data.map((w) => (
                  <button
                    key={w.id}
                    className="nav-item"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => {
                      setWarriorId(w.id);
                      setWarriorQuery(w.display_name || w.email || w.id);
                    }}
                  >
                    {w.display_name || '—'}{' '}
                    <span style={{ color: 'var(--ink-2)' }}>{w.email}</span>
                  </button>
                ))}
                {warriorsQ.data.length === 0 && <div className="empty">No matches</div>}
              </div>
            )}
          </div>
          <select
            className="field"
            style={{ flex: 1, minWidth: 180 }}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            aria-label="Template"
          >
            <option value="">Template…</option>
            {templatesQ.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_library_template ? ' (library)' : ''}
              </option>
            ))}
          </select>
          <select
            className="field"
            style={{ flex: 1, minWidth: 160 }}
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            aria-label="Coach"
          >
            {coachesQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name || c.id.slice(0, 8)}
                {c.id === me?.id ? ' (me)' : ''}
              </option>
            ))}
          </select>
          <input
            className="field"
            style={{ flex: 1, minWidth: 160 }}
            placeholder="Custom name (optional)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            aria-label="Custom program name"
          />
          <button
            className="btn primary"
            disabled={!warriorId || !templateId || !coachId || assignMutation.isPending || !!existingActiveAssignment}
            onClick={() => assignMutation.mutate()}
          >
            {assignMutation.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </div>

        {existingActiveAssignment && templateId && (
          <>
            <div className="notice">
              {warriorQuery || 'This warrior'} already has an active program. Assigning here would clone a fresh
              copy and auto-complete their current one, orphaning its weeks and history — choose how to combine
              it instead.
            </div>
            <ApplyTemplateForm
              warriorProgramId={existingActiveAssignment.id}
              initialTemplateId={templateId}
              onApplied={onDone}
            />
          </>
        )}
      </div>
    </section>
  );
}

export function ClientsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showAssign, setShowAssign] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Admin-only slice: a coach-assigned program vs. a warrior who
  // self-selected a library template (tracked under the fixed Leap system
  // coach id) — mirrors MyClientsScreen.tsx's admin filters.
  const [originFilter, setOriginFilter] = useState<'all' | 'coach' | 'library'>('all');
  const [coachFilterId, setCoachFilterId] = useState<string>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['assignments'],
    queryFn: fetchAssignments,
  });
  const coachesQ = useQuery({ queryKey: ['coaches'], queryFn: fetchCoaches });

  const filteredData = data?.filter((a) => {
    const isLibrarySelection = a.coach_id === LEAP_SYSTEM_PROFILE_ID;
    if (originFilter === 'coach' && isLibrarySelection) return false;
    if (originFilter === 'library' && !isLibrarySelection) return false;
    if (coachFilterId && a.coach_id !== coachFilterId) return false;
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
      render: (a) => <span style={{ fontWeight: 700 }}>{a.warrior_name ?? a.warrior_id.slice(0, 8)}</span>,
    },
    {
      key: 'template',
      header: 'Program',
      render: (a) => a.template_name ?? '—',
    },
    {
      key: 'coach',
      header: 'Coach',
      render: (a) => <span className="dim">{a.coach_name ?? '—'}</span>,
    },
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
      render: (a) => (
        <span
          className="row"
          style={{ justifyContent: 'flex-end', gap: 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          {a.status === 'active' ? (
            <button
              className="btn small"
              onClick={() => statusMutation.mutate({ id: a.id, status: 'paused' })}
            >
              Pause
            </button>
          ) : (
            <button
              className="btn small"
              onClick={() => statusMutation.mutate({ id: a.id, status: 'active' })}
            >
              Activate
            </button>
          )}
          <button
            className="btn small"
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
            title={`Delete ${a.warrior_name ?? 'this warrior'}'s program data?`}
            body="Removes the assignment, its cloned program and workout logs. This cannot be undone."
            confirmLabel="Delete"
            onConfirm={() => deleteMutation.mutateAsync(a.id)}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <div className="sub">Every coach's assignments, arena-wide.</div>
        </div>
        <button className="btn primary" onClick={() => setShowAssign((s) => !s)}>
          {showAssign ? 'Close' : '+ Assign program'}
        </button>
      </div>

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

      <div className="row" style={{ gap: 6 }}>
        {(['all', 'coach', 'library'] as const).map((o) => (
          <button
            key={o}
            className={`btn small${originFilter === o ? ' primary' : ''}`}
            onClick={() => setOriginFilter(o)}
          >
            {o === 'all' ? 'All' : o === 'coach' ? 'Coach-assigned' : 'Self-selected (library)'}
          </button>
        ))}
        {originFilter !== 'library' && (
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
