import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, ErrorNote } from '@/components/bits';
import { formatDateTime } from '@/shared/constants';
import { fetchAthleteFairPlay } from '@/api/fairPlay';
import { noteLabel } from '@/shared/fairPlayNotes';
import { ActionsBar, FlagTable, HoldRow } from './parts';

/** One athlete: strikes, holds, appeals, every flag; act on the open ones. */
export function AthleteFairPlayPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['fair-play', 'athlete', id], queryFn: () => fetchAthleteFairPlay(id), enabled: !!id });
  const open = (q.data?.flags ?? []).filter((f) => f.status === 'open');
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const sel = selected ?? new Set(open.map((f) => f.id));
  const toggle = (fid: number) => setSelected(() => {
    const next = new Set(sel);
    if (next.has(fid)) next.delete(fid); else next.add(fid);
    return next;
  });
  const strikes = (q.data?.holds ?? []).filter((h) => h.counts_as_strike && h.lifted_reason !== 'appeal_accepted').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fair Play · Athlete</h1>
          <div className="sub">
            <Link to={`/users/${id}`}>Open the user profile</Link> · <Link to="/fair-play">Back to the queue</Link>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone={strikes > 0 ? 'warn' : undefined}>{strikes} strike{strikes === 1 ? '' : 's'}</Badge>
        </div>
      </div>

      {q.error && <ErrorNote error={q.error} />}
      {q.isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {q.data && (
        <>
          {open.length > 0 && (
            <section className="panel">
              <div className="panel-head"><span style={{ fontWeight: 700 }}>Open flags ({open.length})</span></div>
              <div className="panel-body">
                <FlagTable flags={open} selected={sel} onToggle={toggle} />
                <ActionsBar userId={id} flags={open} selected={sel} />
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><span style={{ fontWeight: 700 }}>Holds ({q.data.holds.length})</span></div>
            <div className="panel-body">
              {q.data.holds.length === 0 ? <div className="label">None</div> : q.data.holds.map((h) => <HoldRow key={h.id} hold={h} />)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><span style={{ fontWeight: 700 }}>Appeals ({q.data.appeals.length})</span></div>
            <div className="panel-body">
              {q.data.appeals.length === 0 ? <div className="label">None</div> : q.data.appeals.map((a) => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={a.status === 'accepted' ? 'ok' : a.status === 'pending' ? 'warn' : undefined}>{a.status}</Badge>
                    <span className="label">{formatDateTime(a.created_at)}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>“{a.message}”</div>
                  {a.admin_reply && <div style={{ marginTop: 4, color: 'var(--ink-2)' }}>Reply: {noteLabel(a.admin_reply)}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><span style={{ fontWeight: 700 }}>All flags ({q.data.flags.length})</span></div>
            <div className="panel-body">
              {q.data.flags.length === 0 ? <div className="label">None</div> : <FlagTable flags={q.data.flags} showStatus />}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
