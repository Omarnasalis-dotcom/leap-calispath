import type { RecentPulse } from '@/shared/types';

const PULSE_METRICS = [
  { key: 'new_warriors', label: 'New warriors' },
  { key: 'active_warriors', label: 'Active warriors' },
  { key: 'workouts_logged', label: 'Workouts logged' },
] as const;

/** Reuses the same fixed-height-track vertical-bar pattern as
 * WeeklyActivityChart/TierDistributionChart — three unrelated metrics
 * rather than a sequence, so every bar uses the same accent color instead
 * of highlighting one as "current". */
export function RecentPulseChart({ pulse }: { pulse: RecentPulse }) {
  const maxValue = Math.max(1, ...PULSE_METRICS.map((m) => pulse[m.key]));

  return (
    <div className="dv-vbar-list dv-vbar-list-sparse">
      {PULSE_METRICS.map((m) => {
        const value = pulse[m.key];
        const pct = Math.round((value / maxValue) * 100);
        return (
          <div key={m.key} className="dv-vbar-col">
            <span className="dv-vbar-value">{value.toLocaleString()}</span>
            <div className="dv-vbar-track">
              <div className="dv-vbar-fill dv-vbar-fill-current" style={{ height: `${pct}%` }} />
            </div>
            <span className="dv-vbar-label">{m.label}</span>
            <span className="dv-bar-tooltip">{value.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}
