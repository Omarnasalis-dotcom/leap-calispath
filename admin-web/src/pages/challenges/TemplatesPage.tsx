import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteTemplate,
  fetchTemplates,
  type ChallengeTemplate,
} from '@/api/challenges';
import { CHALLENGE_GROUPS, formatDate } from '@/shared/constants';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['challenge-templates'],
    queryFn: fetchTemplates,
  });

  const removeMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['challenge-templates'] }),
  });

  const columns: Column<ChallengeTemplate>[] = [
    {
      key: 'name',
      header: 'Template',
      render: (t) => <span style={{ fontWeight: 700 }}>{t.name}</span>,
    },
    {
      key: 'group',
      header: 'Group',
      render: (t) => {
        const g = CHALLENGE_GROUPS.find((x) => x.id === t.group_id);
        return g ? <Badge>{g.name}</Badge> : <Badge tone="ok">any group</Badge>;
      },
    },
    { key: 'title', header: 'Title', render: (t) => t.title },
    {
      key: 'scoring',
      header: 'Scoring',
      render: (t) => <span className="dim">{t.scoring_type}</span>,
    },
    {
      key: 'movements',
      header: 'Movements',
      align: 'right',
      render: (t) => <span className="num">{t.movements?.length ?? 0}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (t) => <span className="dim">{formatDate(t.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) => (
        <ConfirmButton
          label="Delete"
          danger
          title={`Delete template “${t.name}”?`}
          body="Challenges already created from it are unaffected."
          confirmLabel="Delete"
          onConfirm={() => removeMutation.mutateAsync(t.id)}
        />
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Challenge templates</h1>
          <div className="sub">
            Saved from the week editor — “Save as template” on any group.
          </div>
        </div>
      </div>
      {error && <ErrorNote error={error} />}
      {removeMutation.error && <ErrorNote error={removeMutation.error} />}
      <div className="panel">
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(t) => t.id}
          loading={isLoading}
          emptyLabel="No templates yet"
          emptyHint="Build a challenge in the week editor and save it as a template."
        />
      </div>
    </div>
  );
}
