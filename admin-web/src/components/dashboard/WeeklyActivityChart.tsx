import type { DashboardTrendWeek } from '@/shared/types';

function weekLabel(indexFromEnd: number): string {
  if (indexFromEnd === 0) return 'This wk';
  if (indexFromEnd === 1) return 'Last wk';
  return `${indexFromEnd}wk ago`;
}

/** Bars sit in a fixed-pixel-height track (.dv-vbar-track, see
 * DashboardPage.css) and are sized as a percentage of THAT fixed height —
 * not a percentage height on a flex item sharing a column container with
 * sibling labels, which resolves against flex-basis instead and silently
 * breaks proportionality. This is the one CSS bug the design handoff
 * explicitly warns is easy to reintroduce. */
export function WeeklyActivityChart({ weeks }: { weeks: DashboardTrendWeek[] }) {
  const maxActive = Math.max(1, ...weeks.map((w) => w.active_warriors));

  return (
    <div className="dv-vbar-list">
      {weeks.map((w, i) => {
        const pct = Math.round((w.active_warriors / maxActive) * 100);
        const isCurrent = i === weeks.length - 1;
        return (
          <div key={w.week_start} className="dv-vbar-col">
            <span className="dv-vbar-value">{w.active_warriors}</span>
            <div className="dv-vbar-track">
              <div
                className={`dv-vbar-fill${isCurrent ? ' dv-vbar-fill-current' : ''}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="dv-vbar-label">{weekLabel(weeks.length - 1 - i)}</span>
            <span className="dv-bar-tooltip">{w.active_warriors.toLocaleString()} active warriors</span>
          </div>
        );
      })}
    </div>
  );
}
