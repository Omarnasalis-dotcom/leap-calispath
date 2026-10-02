import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAssignment,
  fetchClientAdherence,
  fetchCoachingAnalytics,
  type ClientAdherenceRow,
  type CoachSource,
} from '@/api/coaching';
import { formatDate } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';
import { ProgressDrawer } from './ProgressDrawer';
import { PerformancePanel } from '@/components/performance/PerformancePanel';

function KvList({ entries }: { entries: Array<[string, number]> }) {
  return (
    <dl className="kv" style={{ gridTemplateColumns: '160px 1fr' }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd className="num">{v.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

function CompletionBadge({ row }: { row: ClientAdherenceRow }) {
  if (row.total_logs === 0) return <Badge>No logs yet</Badge>;
  const pct = Math.round((row.completed_logs / row.total_logs) * 100);
  const tone = pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : undefined;
  return <Badge tone={tone}>{pct}%</Badge>;
}

/** Opens directly under the clicked client row (not at the bottom of the
 * page): their week-by-week logs, or their Performance charts.
 * ClientAdherenceRow is a summary projection (no template_id), so the logs
 * tab fetches the complete assignment ProgressDrawer needs. */
function InlineClient({ row, onClose }: { row: ClientAdherenceRow; onClose: () => void }) {
  const [tab, setTab] = useState<'logs' | 'performance'>('logs');
  const assignmentQ = useQuery({
    queryKey: ['assignment', row.assignment_id],
    queryFn: () => fetchAssignment(row.assignment_id),
    enabled: tab === 'logs',
  });
  const name = row.warrior_name ?? 'warrior';

  // The table can be wider than the page (it scrolls sideways), and this
  // sits inside one of its cells — so size it to the scroll area's visible
  // width and pin it to the left edge, keeping it fully on screen.
  const ref = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  useEffect(() => {
    const wrap = ref.current?.closest('.table-wrap');
    if (!wrap) return;
    const measure = () => setFitWidth(wrap.clientWidth - 24); // minus the cell's side padding
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="inline-client"
      style={fitWidth ? { width: fitWidth, position: 'sticky', left: 12 } : undefined}
    >
      <div className="inline-client-head">
        <div className="seg" role="group" aria-label="Client view">
          <button type="button" className="seg-item" aria-pressed={tab === 'logs'} onClick={() => setTab('logs')}>
            Week logs
          </button>
          <button
            type="button"
            className="seg-item"
            aria-pressed={tab === 'performance'}
            onClick={() => setTab('performance')}
          >
            Performance
          </button>
        </div>
        <button className="btn small" onClick={onClose}>
          Close
        </button>
      </div>
      {tab === 'logs' && (
        <section className="panel">
          <div className="panel-head">
            <h2>Week logs — {name}</h2>
          </div>
          {assignmentQ.error && <ErrorNote error={assignmentQ.error} />}
          {assignmentQ.isLoading && <div className="skeleton" style={{ height: 120 }} />}
          {assignmentQ.data && <ProgressDrawer assignment={assignmentQ.data} />}
        </section>
      )}
      {tab === 'performance' && <PerformancePanel userId={row.warrior_id} athleteName={name} />}
    </div>
  );
}

// Coach ids: …0001 = self-selected library programs, …0002 = AI Coach.
const SOURCE_OPTIONS: Array<{ value: CoachSource; label: string }> = [
  { value: null, label: 'All' },
  { value: 'self', label: 'Self selected' },
  { value: 'ai', label: 'AI Coach' },
  { value: 'coach', label: 'Coach assigned' },
];

export function CoachingAnalyticsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [source, setSource] = useState<CoachSource>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['coaching-analytics', source],
    queryFn: () => fetchCoachingAnalytics(source),
  });
  const adherenceQ = useQuery({
    queryKey: ['client-adherence', source],
    queryFn: () => fetchClientAdherence(source),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Coaching analytics</h1>
          <div className="sub">Templates, assignments and adherence across every coach.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="label">Source</span>
          <div className="seg" role="group" aria-label="Source">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="seg-item"
                aria-pressed={source === opt.value}
                onClick={() => {
                  setSource(opt.value);
                  setExpandedId(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <ErrorNote error={error} />}
      {isLoading && <div className="skeleton" style={{ height: 200 }} />}

      {data && (
        <>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Templates</h2>
              </div>
              <div className="panel-body">
                <KvList
                  entries={[
                    ['Total', data.templates.total],
                    ['In library', data.templates.library_count],
                    ...Object.entries(data.templates.by_status).map(
                      ([k, v]) => [`Status: ${k}`, v] as [string, number],
                    ),
                  ]}
                />
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Assignments</h2>
              </div>
              <div className="panel-body">
                <KvList
                  entries={[
                    ['Total', data.assignments.total],
                    ...Object.entries(data.assignments.by_status).map(
                      ([k, v]) => [`Status: ${k}`, v] as [string, number],
                    ),
                  ]}
                />
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Workout logs</h2>
              </div>
              <div className="panel-body">
                <KvList
                  entries={[
                    ['All time', data.workout_logs.total],
                    ['Last 7 days', data.workout_logs.last_7_days],
                    ['Last 28 days', data.workout_logs.last_28_days],
                    ['Active warriors (7d)', data.workout_logs.active_warriors_last_7_days],
                  ]}
                />
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>Coaches</h2>
              <span className="label">by active clients</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Coach</th>
                    <th style={{ textAlign: 'right' }}>Active clients</th>
                    <th style={{ textAlign: 'right' }}>Templates</th>
                    <th style={{ textAlign: 'right' }}>Published</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coach_leaderboard.map((c) => (
                    <tr key={c.coach_id}>
                      <td style={{ fontWeight: 600 }}>{c.display_name ?? '—'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{c.active_clients}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{c.templates}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{c.published_templates}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.coach_leaderboard.length === 0 && (
                <div className="empty">
                  <span className="label">No coaches</span>
                  Grant coach access from a user's profile page.
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Client adherence</h2>
              <span className="label">by most recently logged</span>
            </div>
            {adherenceQ.error && <ErrorNote error={adherenceQ.error} />}
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Warrior</th>
                    <th>Coach</th>
                    <th>Program</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Week</th>
                    <th style={{ textAlign: 'right' }}>Completion</th>
                    <th style={{ textAlign: 'right' }}>Missed</th>
                    <th>Last workout</th>
                  </tr>
                </thead>
                <tbody>
                  {adherenceQ.isLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={8}>
                          <div className="skeleton" style={{ height: 14 }} />
                        </td>
                      </tr>
                    ))}
                  {adherenceQ.data?.map((row) => (
                    <Fragment key={row.assignment_id}>
                    <tr
                      className={`clickable${expandedId === row.assignment_id ? ' row-open' : ''}`}
                      aria-expanded={expandedId === row.assignment_id}
                      onClick={() => setExpandedId((id) => (id === row.assignment_id ? null : row.assignment_id))}
                    >
                      <td style={{ fontWeight: 600 }}>{row.warrior_name ?? row.warrior_id.slice(0, 8)}</td>
                      <td className="dim">{row.coach_name ?? '—'}</td>
                      <td className="dim">{row.template_name}</td>
                      <td>
                        <Badge tone={row.status === 'active' ? 'ok' : row.status === 'paused' ? 'warn' : undefined}>
                          {row.status ?? '—'}
                        </Badge>
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{row.current_week}</td>
                      <td style={{ textAlign: 'right' }}>
                        <CompletionBadge row={row} />
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{row.missed_logs}</td>
                      <td className="dim">{row.last_logged_at ? formatDate(row.last_logged_at) : '—'}</td>
                    </tr>
                    {expandedId === row.assignment_id && (
                      <tr className="row-expansion">
                        <td colSpan={8}>
                          <InlineClient row={row} onClose={() => setExpandedId(null)} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {!adherenceQ.isLoading && adherenceQ.data?.length === 0 && (
                <div className="empty">
                  <span className="label">No client assignments</span>
                  Assign a program to a warrior to start a coaching relationship.
                </div>
              )}
            </div>
          </section>

        </>
      )}
    </div>
  );
}
