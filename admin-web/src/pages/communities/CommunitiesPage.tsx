import { useQuery } from '@tanstack/react-query';
import { fetchCommunities } from '@/api/communities';
import type { CommunityRow } from '@/shared/types';
import { formatDate } from '@/shared/constants';
import { DataTable, type Column } from '@/components/DataTable';
import { CopyCode, ErrorNote } from '@/components/bits';

const COLUMNS: Column<CommunityRow>[] = [
  {
    key: 'name',
    header: 'Community',
    render: (c) => <span style={{ fontWeight: 700 }}>{c.name}</span>,
  },
  {
    key: 'member_count',
    header: 'Members',
    align: 'right',
    render: (c) => <span className="num">{c.member_count}</span>,
  },
  {
    key: 'join_code',
    header: 'Join code',
    render: (c) => <CopyCode value={c.join_code} />,
  },
  {
    key: 'created_by',
    header: 'Created by',
    render: (c) => <span className="dim">{c.created_by_name ?? '—'}</span>,
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (c) => <span className="dim">{formatDate(c.created_at)}</span>,
  },
];

export function CommunitiesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['communities'],
    queryFn: fetchCommunities,
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Communities</h1>
          <div className="sub">
            Join codes are admin-only — they never reach the app clients.
          </div>
        </div>
      </div>
      {error && <ErrorNote error={error} />}
      <div className="panel">
        <DataTable
          columns={COLUMNS}
          rows={data}
          rowKey={(c) => c.id}
          loading={isLoading}
          emptyLabel="No communities yet"
          emptyHint="Communities appear here as soon as a warrior creates one."
        />
      </div>
    </div>
  );
}
