export interface WorldParticipationBar {
  key: string;
  label: string;
  value: number;
  cssVar: string;
}

/** Fixed display order, passed in by the caller from DISCIPLINE_SERIES —
 * never re-sorted by value, so each discipline's color stays identity-stable. */
export function WorldParticipationChart({ bars }: { bars: WorldParticipationBar[] }) {
  const maxValue = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className="dv-bar-list">
      {bars.map((b) => {
        const pct = Math.max(4, Math.round((b.value / maxValue) * 100));
        return (
          <div key={b.key} className="dv-bar-row">
            <div className="dv-bar-row-head">
              <span className="dv-bar-label">{b.label}</span>
              <span className="dv-bar-value">{b.value.toLocaleString()}</span>
            </div>
            <div className="dv-bar-track">
              <div className="dv-bar-fill" style={{ background: `var(${b.cssVar})`, width: `${pct}%` }} />
            </div>
            <span className="dv-bar-tooltip">
              {b.label}: {b.value.toLocaleString()} warriors with activity
            </span>
          </div>
        );
      })}
    </div>
  );
}
