import { tierName } from '@/shared/constants';
import type { TierDistributionRow } from '@/shared/types';

/** Reuses the same fixed-height-track vertical-bar pattern as
 * WeeklyActivityChart (see DashboardPage.css's .dv-vbar-* rules) — same
 * shape of chart, different data/labels, not worth a shared abstraction
 * for two call sites. */
export function TierDistributionChart({ rows }: { rows: TierDistributionRow[] }) {
  const maxCount = Math.max(1, ...rows.map((r) => r.warrior_count));

  return (
    <div className="dv-vbar-list">
      {rows.map((r) => {
        const pct = Math.round((r.warrior_count / maxCount) * 100);
        return (
          <div key={r.tier} className="dv-vbar-col">
            <span className="dv-vbar-value">{r.warrior_count}</span>
            <div className="dv-vbar-track">
              <div className="dv-vbar-fill" style={{ height: `${pct}%` }} />
            </div>
            <span className="dv-vbar-label">{tierName(r.tier)}</span>
            <span className="dv-bar-tooltip">
              {tierName(r.tier)}: {r.warrior_count.toLocaleString()} warriors
            </span>
          </div>
        );
      })}
    </div>
  );
}
