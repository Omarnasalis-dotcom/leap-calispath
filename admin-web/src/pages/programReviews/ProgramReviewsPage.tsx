import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProgramReviews, type ProgramReviewRow } from '@/api/programReviews';
import { formatDateTime } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';
import { PageHeader } from '@/components/layout';

const HOUR = 60 * 60 * 1000;
const PROMISED_HOURS = 48;

function DueBadge({ requestedAt }: { requestedAt: string }) {
  const hoursLeft = Math.round((new Date(requestedAt).getTime() + PROMISED_HOURS * HOUR - Date.now()) / HOUR);
  if (hoursLeft < 0) return <Badge tone="warn">{`${-hoursLeft}h over`}</Badge>;
  return <Badge tone={hoursLeft <= 12 ? 'warn' : undefined}>{`${hoursLeft}h left`}</Badge>;
}

function Row({ review }: { review: ProgramReviewRow }) {
  return (
    <tr>
      <td>
        <Link to={`/program-reviews/${review.id}`}>{review.display_name || 'Athlete'}</Link>
        <div className="dim" style={{ fontSize: 12 }}>{review.subscription_tier ?? 'no plan'} · {review.language === 'ar' ? 'Arabic' : 'English'}</div>
      </td>
      <td>
        {review.program_name}
        <div className="dim" style={{ fontSize: 12 }}>Week {review.week_number}</div>
      </td>
      <td>{review.satisfaction} / 5</td>
      <td style={{ maxWidth: 320 }}>{review.note || <span className="dim">No note</span>}</td>
      <td>
        {review.status === 'open' ? (
          <DueBadge requestedAt={review.requested_at} />
        ) : (
          <>
            <Badge tone={review.outcome === 'changed' ? 'accent' : 'ok'}>{review.outcome ?? review.status}</Badge>
            {review.reverted_at && <> <Badge tone="warn">reverted</Badge></>}
            {review.reviewer_rating != null && <span className="dim" style={{ fontSize: 12 }}> rated {review.reviewer_rating}/5</span>}
          </>
        )}
      </td>
      <td className="dim" style={{ fontSize: 12 }}>{formatDateTime(review.requested_at)}</td>
    </tr>
  );
}

export function ProgramReviewsPage() {
  const [status, setStatus] = useState<'open' | 'closed' | 'cancelled'>('open');
  const { data, isLoading, error } = useQuery({
    queryKey: ['program-reviews', status],
    queryFn: () => fetchProgramReviews(status),
  });

  return (
    <div className="page">
      <PageHeader
        title="Program reviews"
        sub="Weeks built with the AI Coach that athletes asked the team to check. Athletes are told usually within 48 hours."
        actions={
          <>
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ width: 'auto' }}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </>
        }
      />

      {error && <ErrorNote error={error} />}
      {isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {data && data.length === 0 && (
        <div className="panel">
          <div className="empty">
            <span className="label">Nothing here</span>
            {status === 'open' ? 'No reviews are waiting.' : `No ${status} reviews yet.`}
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <section className="panel">
          <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Athlete</th><th>Program</th><th>Satisfied</th><th>Note</th><th>Status</th><th>Asked</th></tr>
            </thead>
            <tbody>
              {data.map((review) => <Row key={review.id} review={review} />)}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </div>
  );
}
