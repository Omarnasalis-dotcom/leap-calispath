import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorNote } from '@/components/bits';
import { fetchActiveHolds, fetchLiftedOutOfQueue, fetchOpenFlags, type FairPlayFlag } from '@/api/fairPlay';
import { searchUsers } from '@/api/users';
import { ActionsBar, FlagTable, HoldRow } from './parts';

/** The review queue: open flags grouped by athlete, newest first. */
export function FlagsPage() {
  const flagsQ = useQuery({ queryKey: ['fair-play', 'open-flags'], queryFn: fetchOpenFlags });
  const holdsQ = useQuery({ queryKey: ['fair-play', 'active-holds'], queryFn: fetchActiveHolds });
  const liftedQ = useQuery({ queryKey: ['fair-play', 'lifted-out-of-queue'], queryFn: fetchLiftedOutOfQueue });

  const groups = useMemo(() => {
    const m = new Map<string, FairPlayFlag[]>();
    for (const f of flagsQ.data ?? []) m.set(f.user_id, [...(m.get(f.user_id) ?? []), f]);
    // Athletes with a strong flag first, then by most recent flag.
    return Array.from(m.entries()).sort(([, a], [, b]) => {
      const sa = a.some((f) => f.severity === 'strong') ? 1 : 0;
      const sb = b.some((f) => f.severity === 'strong') ? 1 : 0;
      return sb - sa || b[0].created_at.localeCompare(a[0].created_at);
    });
  }, [flagsQ.data]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fair Play · Flags</h1>
          <div className="sub">
            Results that look unusual against the limits. Nothing changes for an athlete until you act: dismiss, hide from one area, hide
            everywhere, or ban permanently.
          </div>
        </div>
      </div>

      <FindAthlete />

      {(flagsQ.error || holdsQ.error) && <ErrorNote error={flagsQ.error ?? holdsQ.error} />}
      {flagsQ.isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {flagsQ.data && groups.length === 0 && (
        <div className="panel">
          <div className="empty">
            <span className="label">Queue is clear</span>
            New flags appear here as results come in.
          </div>
        </div>
      )}

      {groups.map(([userId, flags]) => (
        <AthleteGroup key={userId} userId={userId} flags={flags} />
      ))}

      {holdsQ.data && holdsQ.data.length > 0 && (
        <section className="panel">
          <div className="panel-head"><span style={{ fontWeight: 700 }}>Active holds ({holdsQ.data.length})</span></div>
          <div className="panel-body">
            {holdsQ.data.map((h) => <HoldRow key={h.id} hold={h} showName />)}
          </div>
        </section>
      )}

      {liftedQ.error && <ErrorNote error={liftedQ.error} />}
      {liftedQ.data && liftedQ.data.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span style={{ fontWeight: 700 }}>Lifted, not in the queue ({liftedQ.data.length})</span>
            <span className="label">Lifted by you or by an accepted appeal. Send the flags back to decide again.</span>
          </div>
          <div className="panel-body">
            {liftedQ.data.map((h) => <HoldRow key={h.id} hold={h} showName backToFlags={h.waiting} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function AthleteGroup({ userId, flags }: { userId: string; flags: FairPlayFlag[] }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(flags.map((f) => f.id)));
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const name = flags[0].profiles?.display_name ?? userId;
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontWeight: 700 }}>{name}</span>
          <span className="label">{flags.length} open</span>
        </div>
        <Link className="btn small ghost" to={`/fair-play/athlete/${userId}`}>Athlete history</Link>
      </div>
      <div className="panel-body">
        <FlagTable flags={flags} selected={selected} onToggle={toggle} />
        <ActionsBar userId={userId} flags={flags} selected={selected} />
      </div>
    </section>
  );
}

/** Any athlete's Fair Play history (flags, holds, appeals), flagged or not. */
function FindAthlete() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const q = useQuery({
    queryKey: ['fair-play', 'find', query],
    queryFn: () => searchUsers({ query, sort: 'created_at', desc: true, page: 0, pageSize: 8 }),
    enabled: query.length >= 2,
  });
  return (
    <section className="panel">
      <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
        <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
          <input className="field" style={{ flex: 1 }} placeholder="Find an athlete by name or email" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn small" type="submit" disabled={input.trim().length < 2}>Search</button>
        </form>
        {q.error && <ErrorNote error={q.error} />}
        {q.data && q.data.length === 0 && <div className="label">No athlete found</div>}
        {q.data && q.data.length > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {q.data.map((u) => (
              <Link key={u.id} className="btn small ghost" to={`/fair-play/athlete/${u.id}`}>
                {u.display_name ?? u.email ?? u.id}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
