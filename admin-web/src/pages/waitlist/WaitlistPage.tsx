import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInviteRequests, setInviteRequestStatus } from '@/api/waitlist';
import type { InviteRequestRow } from '@/shared/types';
import { formatDate } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';

function statusTone(status: string | null): 'ok' | 'warn' | undefined {
  if (status === 'approved') return 'ok';
  if (status === 'pending' || status == null) return 'warn';
  return undefined;
}

export function WaitlistPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['invite-requests'],
    queryFn: fetchInviteRequests,
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      setInviteRequestStatus(vars.id, vars.status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invite-requests'] }),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Waitlist</h1>
          <div className="sub">
            Invite requests from the website — first admin surface this table has ever
            had.
          </div>
        </div>
      </div>

      {error && <ErrorNote error={error} />}
      {statusMutation.error && <ErrorNote error={statusMutation.error} />}

      {isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {data && data.length === 0 && (
        <div className="panel">
          <div className="empty">
            <span className="label">No requests</span>
            New signups from the request form will land here.
          </div>
        </div>
      )}

      {data?.map((r: InviteRequestRow) => (
        <section key={r.id} className="panel">
          <div className="panel-head">
            <div className="row">
              <span style={{ fontWeight: 700 }}>{r.name}</span>
              <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{r.email}</span>
              <Badge tone={statusTone(r.status)}>{r.status ?? 'pending'}</Badge>
            </div>
            <div className="row">
              <span className="label">{formatDate(r.created_at)}</span>
              {r.status !== 'approved' && (
                <button
                  className="btn small primary"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ id: r.id, status: 'approved' })}
                >
                  Approve
                </button>
              )}
              {/* 'declined', not 'rejected' — invite_requests_status_check
                  allows only pending/approved/declined, so the old value
                  failed the constraint on every click. */}
              {r.status !== 'declined' && (
                <button
                  className="btn small danger"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ id: r.id, status: 'declined' })}
                >
                  Reject
                </button>
              )}
            </div>
          </div>
          <div className="panel-body">
            <dl className="kv">
              {r.instagram && (
                <>
                  <dt>Instagram</dt>
                  <dd>{r.instagram}</dd>
                </>
              )}
              {r.phone && (
                <>
                  <dt>Phone</dt>
                  <dd>{r.phone}</dd>
                </>
              )}
              {r.experience && (
                <>
                  <dt>Experience</dt>
                  <dd>{r.experience}</dd>
                </>
              )}
              {r.why_join && (
                <>
                  <dt>Why join</dt>
                  <dd>{r.why_join}</dd>
                </>
              )}
            </dl>
          </div>
        </section>
      ))}
    </div>
  );
}
