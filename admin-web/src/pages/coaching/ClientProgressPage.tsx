import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAssignment } from '@/api/coaching';
import { ErrorNote } from '@/components/bits';
import { ProgressDrawer } from './ProgressDrawer';

/** Dedicated route for a client's log history — linked from the Client
 * Adherence analytics table, which needs a URL to point at rather than
 * ClientsPage's inline expand-in-place drawer. Reuses ProgressDrawer for
 * the actual content so there's one place that renders log history. */
export function ClientProgressPage() {
  const { assignmentId = '' } = useParams();
  const navigate = useNavigate();

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
      <div className="page-head">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            <button className="btn small" onClick={() => navigate('/coaching')}>
              ← Clients
            </button>
          </div>
          <h1>{a?.warrior_name ?? '…'}</h1>
          <div className="sub">
            {a?.template_name} · coach {a?.coach_name ?? '—'}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigate(`/coaching/clients/${assignmentId}`)}>
            Edit program
          </button>
        </div>
      </div>

      {assignmentQ.isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {a && (
        <section className="panel">
          <div className="panel-head">
            <h2>Progress</h2>
          </div>
          <ProgressDrawer assignment={a} />
        </section>
      )}
    </div>
  );
}
