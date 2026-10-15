import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ConfirmButton, ErrorNote } from '@/components/bits';
import { DataTable } from '@/components/DataTable';
import { formatDate } from '@/shared/constants';
import { fetchInactiveAthletes, hideInactive, type InactiveAthlete } from '@/api/fairPlay';
import { useFairPlayInvalidate } from './parts';

/** Athletes on a board with no activity for 45+ days (the setting), not already hidden. */
export function InactivePage() {
  const invalidate = useFairPlayInvalidate();
  const q = useQuery({ queryKey: ['fair-play', 'inactive'], queryFn: fetchInactiveAthletes });
  const hide = useMutation({ mutationFn: (userId: string) => hideInactive(userId), onSuccess: invalidate });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fair Play · Inactive</h1>
          <div className="sub">
            No app opens, workouts or results for 45+ days. Hiding is not a cheat action: no strike, no reset. When they come back the app offers
            one tap to show them again.
          </div>
        </div>
      </div>
      {(q.error || hide.error) && <ErrorNote error={q.error ?? hide.error} />}
      <DataTable<InactiveAthlete>
        rows={q.data ?? []}
        rowKey={(r) => r.user_id}
        loading={q.isLoading}
        emptyLabel="Nobody inactive"
        columns={[
          { key: 'name', header: 'Athlete', render: (r) => <Link to={`/fair-play/athlete/${r.user_id}`}>{r.display_name ?? r.user_id}</Link> },
          { key: 'last', header: 'Last active', render: (r) => formatDate(r.last_active) },
          { key: 'days', header: 'Days', align: 'right', render: (r) => r.days_inactive },
          {
            key: 'act', header: '', align: 'right', render: (r) => (
              <ConfirmButton
                label="Hide from leaderboards"
                title={`Hide ${r.display_name ?? 'this athlete'}?`}
                body="Others stop seeing them on every board until they come back and tap to show themselves again. Their results are untouched."
                confirmLabel="Hide"
                disabled={hide.isPending}
                onConfirm={async () => { await hide.mutateAsync(r.user_id); }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
