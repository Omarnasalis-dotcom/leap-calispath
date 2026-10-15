import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, ErrorNote } from '@/components/bits';
import { formatDateTime } from '@/shared/constants';
import { AREA_LABEL, decideAppeal, fetchFlagsByIds, fetchPendingAppeals, type FairPlayAppeal } from '@/api/fairPlay';
import { FlagTable, useFairPlayInvalidate } from './parts';

/** Pending appeals, oldest first. Accept = unhide, no reset, strike removed. */
export function AppealsPage() {
  const q = useQuery({ queryKey: ['fair-play', 'appeals'], queryFn: fetchPendingAppeals });
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fair Play · Appeals</h1>
          <div className="sub">
            Accept: the athlete is visible again, nothing is reset, and the strike no longer counts. Reject: the hold stays and they can still
            accept the reset. The athlete sees your reply in the app.
          </div>
        </div>
      </div>
      {q.error && <ErrorNote error={q.error} />}
      {q.isLoading && <div className="skeleton" style={{ height: 160 }} />}
      {q.data && q.data.length === 0 && (
        <div className="panel"><div className="empty"><span className="label">No pending appeals</span></div></div>
      )}
      {q.data?.map((a) => <AppealCard key={a.id} appeal={a} />)}
    </div>
  );
}

function AppealCard({ appeal: a }: { appeal: FairPlayAppeal }) {
  const invalidate = useFairPlayInvalidate();
  const [reply, setReply] = useState('');
  const hold = a.leaderboard_holds;
  const flagsQ = useQuery({
    queryKey: ['fair-play', 'appeal-flags', a.id],
    queryFn: () => fetchFlagsByIds(hold?.flag_ids ?? []),
    enabled: !!hold,
  });
  const decide = useMutation({ mutationFn: (accept: boolean) => decideAppeal(a.id, accept, reply), onSuccess: invalidate });
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontWeight: 700 }}>{a.profiles?.display_name ?? a.user_id}</span>
          {hold && <Badge tone={hold.status === 'permanent' ? 'warn' : 'accent'}>{hold.status === 'permanent' ? 'Permanent ban' : AREA_LABEL[hold.scope]}</Badge>}
          {hold?.counts_as_strike && <Badge tone="warn">strike</Badge>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="label">{formatDateTime(a.created_at)}</span>
          <Link className="btn small ghost" to={`/fair-play/athlete/${a.user_id}`}>Athlete history</Link>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
        {decide.error && <ErrorNote error={decide.error} />}
        {hold?.admin_note && <div style={{ color: 'var(--ink-2)' }}>Your note: “{hold.admin_note}”</div>}
        <div style={{ fontSize: 15 }}>“{a.message}”</div>
        {flagsQ.data && flagsQ.data.length > 0 && <FlagTable flags={flagsQ.data} />}
        <textarea className="field" rows={2} placeholder="Reply to the athlete (optional)" value={reply} onChange={(e) => setReply(e.target.value)} />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn small primary" disabled={decide.isPending} onClick={() => decide.mutate(true)}>Accept · unhide</button>
          <button className="btn small danger" disabled={decide.isPending} onClick={() => decide.mutate(false)}>Reject</button>
        </div>
      </div>
    </section>
  );
}
