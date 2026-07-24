import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAssignment, fetchClientAdherence, fetchCoachingAnalytics, type ClientAdherenceRow } from '@/api/coaching';
import { formatDate } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';
import { ProgressDrawer } from './ProgressDrawer';

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

/** Expands inline under the adherence table instead of navigating away —
 * ClientAdherenceRow is a summary projection (no template_id), so unlike
 * ClientsPage's inline expand (which already has a full AssignmentRow in
 * hand from fetchAssignments), this fetches the complete assignment
 * ProgressDrawer needs before rendering it. */
function InlineClientProgress({ assignmentId, warriorName, onClose }: { assignmentId: string; warriorName: string; onClose: () => void }) {
  const assignmentQ = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => fetchAssignment(assignmentId),
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Progress — {warriorName}</h2>
        <button className="btn small" onClick={onClose}>
          Close
        </button>
      </div>
      {assignmentQ.error && <ErrorNote error={assignmentQ.error} />}
      {assignmentQ.isLoading && <div className="skeleton" style={{ height: 120 }} />}
      {assignmentQ.data && <ProgressDrawer assignment={assignmentQ.data} />}
    </section>
  );
}

export function CoachingAnalyticsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['coaching-analytics'],
    queryFn: fetchCoachingAnalytics,
  });
  const adherenceQ = useQuery({
    queryKey: ['client-adherence'],
    queryFn: fetchClientAdherence,
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Coaching analytics</h1>
          <div className="sub">Templates, assignments and adherence across every coach.</div>
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
                    <tr
                      key={row.assignment_id}
                      className="clickable"
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

          {expandedId && (
            <InlineClientProgress
              assignmentId={expandedId}
              warriorName={
                adherenceQ.data?.find((r) => r.assignment_id === expandedId)?.warrior_name ?? 'warrior'
              }
              onClose={() => setExpandedId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
