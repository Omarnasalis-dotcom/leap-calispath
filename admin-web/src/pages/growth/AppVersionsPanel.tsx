import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAppVersions, type AppVersionConfig, type AppVersionRow } from '@/api/growth';
import { formatDate } from '@/shared/constants';
import { ErrorNote } from '@/components/bits';

// Numeric segment compare ("1.10" > "1.9"), same rule as the app's
// compareVersions. Negative if a < b.
function cmp(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const VERSION_RE = /^[0-9]+(\.[0-9]+){0,3}$/;
const PLATFORM_LABEL = { ios: 'iOS', android: 'Android' } as const;
// The force-update screen only reaches people once they are on a build that
// hides the splash for it (the build after 1.2.18). Older apps stay on the
// splash instead, so raising the force minimum over them traps them.
const FIRST_SAFE_FORCE_BUILD = '1.2.19';

// What each version really does. Builds before FIRST_SAFE_FORCE_BUILD have
// neither the splash fix nor the soft pop-up, so their outcomes differ.
type Status = 'blocked' | 'stuck' | 'asked' | 'icon' | 'ok';

function statusOf(row: AppVersionRow, cfg: AppVersionConfig | undefined): Status {
  const modern = cmp(row.app_version, FIRST_SAFE_FORCE_BUILD) >= 0;
  if (cfg?.minimum_version && cmp(row.app_version, cfg.minimum_version) < 0) return modern ? 'blocked' : 'stuck';
  if (cfg?.soft_minimum_version && cmp(row.app_version, cfg.soft_minimum_version) < 0) return modern ? 'asked' : 'icon';
  return 'ok';
}

const STATUS_LABEL: Record<Status, { text: string; color: string }> = {
  blocked: { text: 'Forced to update', color: 'var(--danger)' },
  stuck: { text: 'Stuck on splash', color: 'var(--danger)' },
  asked: { text: 'Asked to update', color: 'var(--warn)' },
  icon: { text: 'Update icon only', color: 'var(--ink)' },
  ok: { text: 'Up to date', color: 'var(--ok)' },
};

// Owner tool (2026-11-13): watch old versions drain before raising the force
// or soft minimum. "People" = everyone whose latest app open was on that
// version; "active" = that open was in the last 7 / 30 days.
export function AppVersionsPanel() {
  const { data, error, isLoading } = useQuery({ queryKey: ['app-versions'], queryFn: fetchAppVersions });
  const [whatIf, setWhatIf] = useState('');

  if (error) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>App versions</h2></div>
        <ErrorNote error={error} />
        <div className="dim">If this says the function doesn't exist, apply migration 20261113220000_admin_get_app_versions.</div>
      </section>
    );
  }
  if (isLoading || !data) return <div className="skeleton" style={{ height: 160 }} />;

  const cfgOf = (p: string) => data.config.find((c) => c.platform === p);
  const validWhatIf = VERSION_RE.test(whatIf.trim()) ? whatIf.trim() : null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>App versions</h2>
        <span className="dim">Updated {formatDate(data.generated_at)}</span>
      </div>

      <div className="row" style={{ gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['ios', 'android'] as const).map((p) => {
          const cfg = cfgOf(p);
          const rows = data.versions.filter((v) => v.platform === p);
          const count = (s: Status) => rows.filter((r) => statusOf(r, cfg) === s).reduce((n, r) => n + r.active_30d, 0);
          const total = rows.reduce((n, r) => n + r.active_30d, 0);
          const below = validWhatIf ? rows.filter((r) => cmp(r.app_version, validWhatIf) < 0).reduce((n, r) => n + r.active_30d, 0) : null;
          return (
            <div key={p} style={{ minWidth: 240 }}>
              <div style={{ fontWeight: 700 }}>{PLATFORM_LABEL[p]}</div>
              <div className="dim">
                Force below <b>{cfg?.minimum_version ?? '—'}</b> · Ask below <b>{cfg?.soft_minimum_version ?? '—'}</b> · Store has{' '}
                <b>{cfg?.latest_version ?? '—'}</b>
              </div>
              <div>
                Active (30 days): {total} ·{' '}
                {count('stuck') > 0 && (
                  <>
                    <span style={{ color: STATUS_LABEL.stuck.color, fontWeight: 700 }}>{count('stuck')} stuck on splash</span> ·{' '}
                  </>
                )}
                <span style={{ color: STATUS_LABEL.blocked.color }}>{count('blocked')} forced</span> ·{' '}
                <span style={{ color: STATUS_LABEL.asked.color }}>{count('asked')} asked</span> ·{' '}
                <span>{count('icon')} icon only</span>
              </div>
              {below !== null && (
                <div style={{ fontWeight: 700 }}>
                  Below {validWhatIf}: {below} of {total} active
                </div>
              )}
            </div>
          );
        })}
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="dim">What if the minimum were…</span>
          <input
            className="field"
            placeholder="e.g. 1.2.19"
            value={whatIf}
            onChange={(e) => setWhatIf(e.target.value)}
            style={{ width: 140 }}
          />
        </label>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Version</th>
              <th>People</th>
              <th>Active 7 days</th>
              <th>Active 30 days</th>
              <th>Last seen</th>
              <th>Status now</th>
            </tr>
          </thead>
          <tbody>
            {data.versions.map((r) => {
              const s = STATUS_LABEL[statusOf(r, cfgOf(r.platform))];
              return (
                <tr key={`${r.platform}-${r.app_version}`}>
                  <td>{PLATFORM_LABEL[r.platform]}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{r.app_version}</td>
                  <td>{r.users}</td>
                  <td>{r.active_7d}</td>
                  <td>{r.active_30d}</td>
                  <td className="dim">{formatDate(r.last_seen_at)}</td>
                  <td style={{ color: s.color, fontWeight: 700 }}>{s.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.versions.length === 0 && (
          <div className="empty">
            <span className="label">No versions yet</span>
            Versions come from app opens (1.2.7 and newer).
          </div>
        )}
      </div>

      <div className="dim" style={{ marginTop: 8 }}>
        Each person counts once, on the version of their latest app open. 1.2.6 and older don't report a version.
        Admins and store test accounts are left out. Apps before {FIRST_SAFE_FORCE_BUILD} can't show the forced-update
        screen (they stay on the splash), so only raise the force minimum when few active people are below it.
      </div>
    </section>
  );
}
