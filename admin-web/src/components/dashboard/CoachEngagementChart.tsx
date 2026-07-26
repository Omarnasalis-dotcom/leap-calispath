export interface CoachEngagementRow {
  coach_id: string;
  display_name: string | null;
  active_clients: number;
  active_clients_this_week: number;
}

export function CoachEngagementChart({ coaches }: { coaches: CoachEngagementRow[] }) {
  const rows = coaches.slice(0, 6);

  if (rows.length === 0) {
    return (
      <div className="empty">
        <span className="label">No coaches yet</span>
      </div>
    );
  }

  return (
    <div className="dv-progress-list">
      {rows.map((c) => {
        const pct =
          c.active_clients > 0
            ? Math.round((c.active_clients_this_week / c.active_clients) * 100)
            : 0;
        return (
          <div key={c.coach_id} className="dv-progress-row">
            <div className="dv-progress-row-head">
              <span className="dv-progress-name">{c.display_name ?? 'Unnamed coach'}</span>
              <span className="dv-progress-meta">
                {c.active_clients} clients · {pct}% active
              </span>
            </div>
            <div className="dv-progress-track">
              <div className="dv-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="dv-bar-tooltip">
              {c.active_clients_this_week} of {c.active_clients} clients active this week
            </span>
          </div>
        );
      })}
    </div>
  );
}
