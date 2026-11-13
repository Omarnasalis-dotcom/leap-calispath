import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAssignment } from '@/api/coaching';
import { ErrorNote } from '@/components/bits';
import { ProgressDrawer } from './ProgressDrawer';
import { PageHeader } from '@/components/layout';

/** Dedicated route for a client's log history — linked from the Client
 * Adherence analytics table, which needs a URL to point at rather than
 * ClientsPage's inline expand-in-place drawer. Reuses ProgressDrawer for
 * the actual content so there's one place that renders log history. */
export function ClientProgressPage() {
  const { assignmentId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const assignmentQ = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => fetchAssignment(assignmentId),
    enabled: !!assignmentId,
  });

  if (assignmentQ.error) {
    return (
      <div className="page">
        <ErrorNote error={assignmentQ.error} />
      </div>
    );
  }

  const a = assignmentQ.data;

  return (
    <div className="page wide">
      <PageHeader
        back={{ label: 'Clients', to: '/coaching/clients' }}
        title={a?.warrior_name ?? '…'}
        sub={<>{a?.template_name} · coach {a?.coach_name ?? '—'}</>}
        actions={
          <button className="btn" onClick={() => navigate(`/coaching/clients/${assignmentId}`)}>
            Edit program
          </button>
        }
      />

      {assignmentQ.isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {a && (
        <section className="panel">
          <div className="panel-head">
            <h2>Progress</h2>
          </div>
          <ProgressDrawer assignment={a} initialWeek={Number(searchParams.get('week')) || null} />
        </section>
      )}
    </div>
  );
}
