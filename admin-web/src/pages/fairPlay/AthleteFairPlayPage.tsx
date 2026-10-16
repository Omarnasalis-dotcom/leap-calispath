import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, ErrorNote } from '@/components/bits';
import { formatDateTime } from '@/shared/constants';
import {
  AREA_LABEL, fetchAthleteFairPlay, fetchAthleteResults, flagResults, formatFlagValue, formatMovement, reopenFlags,
  type AthleteResult, type FairPlayArea, type FairPlayFlag,
} from '@/api/fairPlay';
import { noteLabel } from '@/shared/fairPlayNotes';
import { ActionsBar, FlagTable, HoldRow, useFairPlayInvalidate } from './parts';

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
  const invalidate = useFairPlayInvalidate();
  const reopen = useMutation({ mutationFn: (fid: number) => reopenFlags([fid]), onSuccess: invalidate });
  // A flag can go back to the queue once no hold in force covers it (a reset flag is restored from its hold instead).
  const inForce = new Set((q.data?.holds ?? []).filter((h) => h.status !== 'lifted').flatMap((h) => h.flag_ids));
  const canReopen = (f: FairPlayFlag) => f.status === 'dismissed' || (f.status === 'actioned' && !inForce.has(f.id));
  const actioned = new Set((q.data?.flags ?? []).filter((f) => f.status === 'actioned' && !inForce.has(f.id)).map((f) => f.id));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fair Play · Athlete</h1>
          <div className="sub">
            <Link to={`/users/${id}`}>Open the user profile</Link> · <Link to="/fair-play">Back to the queue</Link>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            Wrong call? Lift a hold (looks real, or decide again), restore results after a reset, or reopen a flag below.
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
              {q.data.holds.length === 0 ? <div className="label">None</div> : q.data.holds.map((h) => (
                <HoldRow
                  key={h.id}
                  hold={h}
                  canRestore={q.data.restorableHoldIds.has(h.id)}
                  backToFlags={h.reason === 'fair_play' ? h.flag_ids.filter((fid) => actioned.has(fid)) : undefined}
                />
              ))}
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

          <AllResults userId={id} />

          <section className="panel">
            <div className="panel-head"><span style={{ fontWeight: 700 }}>All flags ({q.data.flags.length})</span></div>
            <div className="panel-body">
              {reopen.error && <ErrorNote error={reopen.error} />}
              {q.data.flags.length === 0 ? <div className="label">None</div> : (
                <FlagTable flags={q.data.flags} showStatus canReopen={canReopen} onReopen={(fid) => reopen.mutate(fid)} />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const resultKey = (r: AthleteResult) => `${r.source_table}:${r.source_id}:${r.movement_id ?? ''}`;

/**
 * Every result, flagged or not. Pick any for review: they join the open
 * flags above, where you hide (with a note / strike) and the athlete can
 * accept a reset or appeal.
 */
function AllResults({ userId }: { userId: string }) {
  const invalidate = useFairPlayInvalidate();
  const q = useQuery({ queryKey: ['fair-play', 'results', userId], queryFn: () => fetchAthleteResults(userId) });
  const [area, setArea] = useState<FairPlayArea | 'any'>('any');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const send = useMutation({
    mutationFn: () => flagResults(userId, (q.data ?? []).filter((r) => picked.has(resultKey(r)))
      .map(({ source_table, source_id, movement_id }) => ({ source_table, source_id, movement_id }))),
    onSuccess: () => { setPicked(new Set()); invalidate(); },
  });
  const rows = (q.data ?? []).filter((r) => area === 'any' || r.area === area);
  // Already in the queue or under a hide, or no longer counting: nothing to pick.
  const pickable = (r: AthleteResult) => !r.removed && r.flag_status !== 'open' && r.flag_status !== 'actioned';
  const toggle = (k: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <span style={{ fontWeight: 700 }}>All results ({q.data?.length ?? 0})</span>
        <div className="row" style={{ gap: 8 }}>
          <select className="field" value={area} onChange={(e) => setArea(e.target.value as FairPlayArea | 'any')}>
            <option value="any">Every area</option>
            {(['strength', 'static', 'endurance', 'power', 'weekly'] as FairPlayArea[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select>
          <button className="btn small primary" disabled={picked.size === 0 || send.isPending} onClick={() => send.mutate()}>
            Review selected ({picked.size})
          </button>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
        <div className="label">
          Pick results that look wrong, then hide the athlete from Open flags above. If they accept a reset, a picked result is removed
          (static best deleted, power lift set to 0); you can restore it afterwards.
        </div>
        {(q.error || send.error) && <ErrorNote error={q.error ?? send.error} />}
        {q.isLoading && <div className="skeleton" style={{ height: 120 }} />}
        {q.data && rows.length === 0 && <div className="label">None</div>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th style={{ width: 28 }} /><th>Area</th><th>Result</th><th>When</th><th>Review</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const k = resultKey(r);
                  return (
                    <tr key={k}>
                      <td>
                        {pickable(r) && <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} aria-label={`Select ${k}`} />}
                      </td>
                      <td>{AREA_LABEL[r.area]}</td>
                      <td style={{ fontWeight: 600 }}>
                        {r.label ?? formatMovement(r)} <span style={{ color: 'var(--ink-2)' }}>· {formatFlagValue({ area: r.area, value: r.value, rule: 'manual' })}</span>
                      </td>
                      <td className="label">{r.at ? formatDateTime(r.at) : ''}</td>
                      <td>{r.removed ? 'removed by a reset' : r.flag_status ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
