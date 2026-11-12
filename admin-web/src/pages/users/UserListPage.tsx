import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchAllUsers, searchUsers, type ActiveFilter, type PlanFilter, type RoleFilter, type UserFilters } from '@/api/users';
import type { AdminUserRow } from '@/shared/types';
import { tierName, formatDate, subscriptionTierLabel, SUBSCRIPTION_TIER_COLORS, TIER_NAMES } from '@/shared/constants';
import { downloadCsv } from '@/shared/csv';
import { useToast } from '@/components/Toast';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ErrorNote } from '@/components/bits';
import { PageHeader, Toolbar } from '@/components/layout';

const PAGE_SIZE = 50;

const COLUMNS: Column<AdminUserRow>[] = [
  {
    key: 'display_name',
    header: 'Warrior',
    sortable: true,
    render: (u) => (
      <div>
        <div style={{ fontWeight: 700 }}>{u.display_name || '—'}</div>
        <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>{u.email}</div>
      </div>
    ),
  },
  {
    key: 'strength_tier',
    header: 'Tier',
    sortable: true,
    render: (u) => (
      <span>
        <span className="num" style={{ fontWeight: 700 }}>
          {u.strength_tier ?? '—'}
        </span>{' '}
        <span style={{ color: 'var(--ink-2)' }}>{tierName(u.strength_tier)}</span>
      </span>
    ),
  },
  {
    key: 'glory_score',
    header: 'Glory',
    sortable: true,
    align: 'right',
    render: (u) => <span className="num">{u.glory_score ?? 0}</span>,
  },
  {
    key: 'power_points',
    header: 'Power',
    sortable: true,
    align: 'right',
    render: (u) => <span className="num">{Math.round(u.power_points ?? 0)}</span>,
  },
  {
    key: 'one_mm_points',
    header: '1MM',
    sortable: true,
    align: 'right',
    render: (u) => <span className="num">{Math.round(u.one_mm_points ?? 0)}</span>,
  },
  {
    key: 'streak',
    header: 'Streak',
    sortable: true,
    align: 'right',
    render: (u) => <span className="num">{u.streak ?? 0}</span>,
  },
  {
    key: 'community',
    header: 'Community',
    render: (u) => <span className="dim">{u.community_name ?? '—'}</span>,
  },
  {
    key: 'subscription_tier',
    header: 'Plan',
    render: (u) => {
      const label = subscriptionTierLabel(u.subscription_tier, u.access_expires_at);
      return <Badge color={SUBSCRIPTION_TIER_COLORS[label]}>{label}</Badge>;
    },
  },
  {
    key: 'roles',
    header: 'Roles',
    render: (u) => (
      <span className="row" style={{ gap: 4 }}>
        {u.is_admin && <Badge tone="accent">admin</Badge>}
        {u.is_coach && <Badge>coach</Badge>}
      </span>
    ),
  },
  {
    key: 'created_at',
    header: 'Joined',
    sortable: true,
    render: (u) => <span className="dim">{formatDate(u.created_at)}</span>,
  },
];

export function UserListPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({
    key: 'created_at',
    desc: true,
  });
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<UserFilters>({});
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const anyFilter = !!(filters.plan || filters.role || filters.active || filters.tier != null);

  function setFilter(patch: UserFilters) {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  }

  const { data, isFetching, error } = useQuery({
    queryKey: ['users', query, sort, page, filters],
    queryFn: () =>
      searchUsers({ query, sort: sort.key, desc: sort.desc, page, pageSize: PAGE_SIZE, ...filters }),
    placeholderData: keepPreviousData,
  });

  /** Exactly the rows matching the current search and filters. */
  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await searchAllUsers({ query, sort: sort.key, desc: sort.desc, ...filters });
      downloadCsv(
        `leap-users-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Name', 'Email', 'Plan', 'Plan ends', 'Strength tier', 'Country', 'Community', 'Admin', 'Coach', 'Joined', 'Last active'],
        rows.map((u) => [
          u.display_name ?? '',
          u.email ?? '',
          subscriptionTierLabel(u.subscription_tier, u.access_expires_at),
          u.access_expires_at ? u.access_expires_at.slice(0, 10) : '',
          u.strength_tier ?? '',
          u.country ?? '',
          u.community_name ?? '',
          u.is_admin ? 'yes' : '',
          u.is_coach ? 'yes' : '',
          u.created_at ? u.created_at.slice(0, 10) : '',
          u.last_active ? u.last_active.slice(0, 10) : '',
        ]),
      );
      toast(`Exported ${rows.length.toLocaleString()} user${rows.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }

  const total = data?.[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function onSort(key: string) {
    setPage(0);
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  }

  return (
    <div className="page">
      <PageHeader
        title="Users"
        sub={
          <span className="num">
            {total.toLocaleString()} warrior{total === 1 ? '' : 's'}
            {anyFilter || query ? ' match' : ''}
          </span>
        }
        actions={
          <>
          <button className="btn" disabled={exporting || total === 0} onClick={() => void exportCsv()} title="Download the users matching this search and these filters">
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQuery(input);
            }}
          >
            <input
              className="field"
              style={{ width: 260 }}
              placeholder="Search name or email…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Search users"
            />
            <button className="btn" type="submit">
              Search
            </button>
          </form>
          </>
        }
      />

      <Toolbar label="Filters">
        <select
          className="field"
          aria-label="Plan"
          value={filters.plan ?? ''}
          onChange={(e) => setFilter({ plan: (e.target.value || null) as PlanFilter | null })}
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="first">First</option>
          <option value="pro">Pro</option>
          <option value="max">Max</option>
        </select>
        <select
          className="field"
          aria-label="Role"
          value={filters.role ?? ''}
          onChange={(e) => setFilter({ role: (e.target.value || null) as RoleFilter | null })}
        >
          <option value="">Everyone</option>
          <option value="admin">Admins</option>
          <option value="coach">Coaches</option>
        </select>
        <select
          className="field"
          aria-label="Last active"
          value={filters.active ?? ''}
          onChange={(e) => setFilter({ active: (e.target.value || null) as ActiveFilter | null })}
        >
          <option value="">Active any time</option>
          <option value="7d">Active in the last 7 days</option>
          <option value="30d">Active in the last 30 days</option>
          <option value="inactive30">Inactive 30+ days</option>
        </select>
        <select
          className="field"
          aria-label="Strength tier"
          value={filters.tier ?? ''}
          onChange={(e) => setFilter({ tier: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">All tiers</option>
          {TIER_NAMES.map((name, i) => (
            <option key={i} value={i}>
              Tier {i} · {name}
            </option>
          ))}
        </select>
        {anyFilter && (
          <button className="btn small ghost" onClick={() => setFilter({ plan: null, role: null, active: null, tier: null })}>
            Clear filters
          </button>
        )}
      </Toolbar>

      {error && <ErrorNote error={error} />}

      <div className="panel">
        <DataTable
          columns={COLUMNS}
          rows={data}
          rowKey={(u) => u.id}
          loading={!data && isFetching}
          emptyLabel="No users found"
          emptyHint={query ? `Nothing matches “${query}”.` : undefined}
          onRowClick={(u) => navigate(`/users/${u.id}`)}
          sort={sort}
          onSort={onSort}
        />
        <div className="pagination">
          <button
            className="btn small"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span className="num">
            Page {page + 1} of {pages}
          </span>
          <button
            className="btn small"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
          {isFetching && data && <span>refreshing…</span>}
        </div>
      </div>
    </div>
  );
}
