import { useQuery } from '@tanstack/react-query';
import { fetchCoachingAnalytics } from '@/api/coaching';
import { ErrorNote } from '@/components/bits';

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

export function CoachingAnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['coaching-analytics'],
    queryFn: fetchCoachingAnalytics,
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
        </>
      )}
    </div>
  );
}
