import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchUsers } from '@/api/users';
import type { AdminUserRow } from '@/shared/types';
import { tierName, formatDate, subscriptionTierLabel, SUBSCRIPTION_TIER_COLORS } from '@/shared/constants';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ErrorNote } from '@/components/bits';

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
    header: 'Tier',
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

  const { data, isFetching, error } = useQuery({
    queryKey: ['users', query, sort, page],
    queryFn: () =>
      searchUsers({ query, sort: sort.key, desc: sort.desc, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const total = data?.[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function onSort(key: string) {
    setPage(0);
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <div className="sub num">
            {total.toLocaleString()} warrior{total === 1 ? '' : 's'}
          </div>
        </div>
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
      </div>

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
