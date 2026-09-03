import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAiCoachReports, markAiCoachReportReviewed } from '@/api/aiCoachReports';
import type { AiCoachMessageReportRow } from '@/shared/types';
import { formatDateTime } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';

const REASON_LABEL: Record<AiCoachMessageReportRow['reason'], string> = {
  inaccurate: 'Inaccurate',
  inappropriate: 'Inappropriate',
  other: 'Other',
};

export function AiCoachReportsPage() {
  const queryClient = useQueryClient();
  const [includeReviewed, setIncludeReviewed] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-coach-reports', includeReviewed],
    queryFn: () => fetchAiCoachReports(includeReviewed),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => markAiCoachReportReviewed(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ai-coach-reports'] }),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI Coach reports</h1>
          <div className="sub">
            User-flagged AI Coach responses — App Store guideline 4.7.1 requires a way to
            report chatbot content and respond to it. Mark reviewed once you've looked into one.
          </div>
        </div>
        <label className="row" style={{ gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={includeReviewed}
            onChange={(e) => setIncludeReviewed(e.target.checked)}
          />
          Show reviewed
        </label>
      </div>

      {error && <ErrorNote error={error} />}
      {reviewMutation.error && <ErrorNote error={reviewMutation.error} />}

      {isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {data && data.length === 0 && (
        <div className="panel">
          <div className="empty">
            <span className="label">No reports</span>
            {includeReviewed ? 'Nothing has ever been reported.' : "Nothing pending review right now."}
          </div>
        </div>
      )}

      {data?.map((r) => (
        <section key={r.id} className="panel">
          <div className="panel-head">
            <div className="row">
              <Badge tone="warn">{REASON_LABEL[r.reason]}</Badge>
              <Link to={`/users/${r.user_id}`} style={{ fontSize: 13 }}>
                View user
              </Link>
              {r.reviewed_at && <Badge tone="ok">reviewed {formatDateTime(r.reviewed_at)}</Badge>}
            </div>
            <span className="label">{formatDateTime(r.created_at)}</span>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.preceding_user_message && (
              <div className="dim" style={{ fontSize: 13 }}>
                <strong>User:</strong> {r.preceding_user_message}
              </div>
            )}
            <div style={{ fontSize: 13 }}>
              <strong>Coach:</strong> {r.assistant_message}
            </div>
            {!r.reviewed_at && (
              <button
                className="btn small ghost"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate(r.id)}
              >
                Mark reviewed
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
