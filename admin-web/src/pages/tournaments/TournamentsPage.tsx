import { useQuery } from '@tanstack/react-query';
import {
  fetchInviteCodes,
  fetchTournamentConfigs,
  fetchTournamentSessions,
} from '@/api/tournaments';
import type {
  InviteCodeRow,
  TournamentConfigRow,
  TournamentSessionRow,
} from '@/shared/types';
import { formatDate, formatDateTime } from '@/shared/constants';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, CopyCode, ErrorNote } from '@/components/bits';

const CONFIG_COLUMNS: Column<TournamentConfigRow>[] = [
  {
    key: 'title',
    header: 'Tournament',
    render: (t) => <span style={{ fontWeight: 700 }}>{t.title}</span>,
  },
  { key: 'type', header: 'Type', render: (t) => <span className="dim">{t.type}</span> },
  {
    key: 'payout_gp',
    header: 'Payout GP',
    align: 'right',
    render: (t) => <span className="num">{t.payout_gp ?? '—'}</span>,
  },
  {
    key: 'bracket_size',
    header: 'Bracket',
    align: 'right',
    render: (t) => <span className="num">{t.bracket_size ?? '—'}</span>,
  },
  {
    key: 'allowed_tiers',
    header: 'Tiers',
    render: (t) => (
      <span className="dim num">
        {t.allowed_tiers && t.allowed_tiers.length > 0
          ? `${Math.min(...t.allowed_tiers)}–${Math.max(...t.allowed_tiers)}`
          : 'all'}
      </span>
    ),
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (t) => <span className="dim">{formatDate(t.created_at)}</span>,
  },
];

const SESSION_COLUMNS: Column<TournamentSessionRow>[] = [
  {
    key: 'status',
    header: 'Status',
    render: (s) => (
      <Badge tone={s.status === 'active' ? 'accent' : undefined}>
        {s.status ?? '—'}
      </Badge>
    ),
  },
  {
    key: 'current_round',
    header: 'Round',
    align: 'right',
    render: (s) => <span className="num">{s.current_round ?? '—'}</span>,
  },
  {
    key: 'start_time',
    header: 'Started',
    render: (s) => <span className="dim">{formatDateTime(s.start_time)}</span>,
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (s) => <span className="dim">{formatDate(s.created_at)}</span>,
  },
];

const CODE_COLUMNS: Column<InviteCodeRow>[] = [
  { key: 'code', header: 'Code', render: (c) => <CopyCode value={c.code} /> },
  { key: 'type', header: 'Type', render: (c) => <span className="dim">{c.type}</span> },
  {
    key: 'used',
    header: 'Status',
    render: (c) =>
      c.used_by ? <Badge>used {formatDate(c.used_at)}</Badge> : <Badge tone="ok">open</Badge>,
  },
  {
    key: 'expires_at',
    header: 'Expires',
    render: (c) => <span className="dim">{formatDate(c.expires_at)}</span>,
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (c) => <span className="dim">{formatDate(c.created_at)}</span>,
  },
];

export function TournamentsPage() {
  const configsQ = useQuery({
    queryKey: ['tournament-configs'],
    queryFn: fetchTournamentConfigs,
  });
  const sessionsQ = useQuery({
    queryKey: ['tournament-sessions'],
    queryFn: fetchTournamentSessions,
  });
  const codesQ = useQuery({ queryKey: ['invite-codes'], queryFn: fetchInviteCodes });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tournaments</h1>
          <div className="sub">
            Read-only for now — create, delete and code generation stay on the mobile
            admin screen.
          </div>
        </div>
      </div>

      {configsQ.error && <ErrorNote error={configsQ.error} />}

      <section className="panel">
        <div className="panel-head">
          <h2>Configs</h2>
        </div>
        <DataTable
          columns={CONFIG_COLUMNS}
          rows={configsQ.data}
          rowKey={(t) => t.id}
          loading={configsQ.isLoading}
          emptyLabel="No tournament configs"
        />
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Recent sessions</h2>
          </div>
          {sessionsQ.error && (
            <div className="panel-body">
              <ErrorNote error={sessionsQ.error} />
            </div>
          )}
          <DataTable
            columns={SESSION_COLUMNS}
            rows={sessionsQ.data}
            rowKey={(s) => s.id}
            loading={sessionsQ.isLoading}
            emptyLabel="No sessions"
          />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Invite codes</h2>
            {codesQ.data && (
              <span className="label num">
                {codesQ.data.filter((c) => !c.used_by).length} open
              </span>
            )}
          </div>
          {codesQ.error && (
            <div className="panel-body">
              <ErrorNote error={codesQ.error} />
            </div>
          )}
          <DataTable
            columns={CODE_COLUMNS}
            rows={codesQ.data}
            rowKey={(c) => c.id}
            loading={codesQ.isLoading}
            emptyLabel="No invite codes"
          />
        </section>
      </div>
    </div>
  );
}
