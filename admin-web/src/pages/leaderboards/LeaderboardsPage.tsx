import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchGlobalWellRounded,
  fetchOneMMWellRounded,
  fetchPowerLeaderboard,
  fetchStaticWellRounded,
  fetchTierLeaderboard,
} from '@/api/leaderboards';
import { TIER_NAMES } from '@/shared/constants';
import { ErrorNote } from '@/components/bits';

// Glory is left out: it ships with the V2 features (Tournament/Clash) and
// isn't live in the app.
type BoardKey = 'strength' | 'power' | 'static' | 'onemm' | 'wra';

// Mirrors the app's POWER_LEVELS (src/lib/powerLogic.ts).
const POWER_LEVEL_NAMES: Record<number, string> = { 1: 'Voltaic', 2: 'Ampere', 3: 'Tesla' };

const BOARDS: { key: BoardKey; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'power', label: 'Power' },
  { key: 'static', label: 'Static' },
  { key: 'onemm', label: '1-Min-Max' },
  { key: 'wra', label: 'Well-Rounded' },
];

/** Pick the first present key — the RPCs name their columns differently. */
function val(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] != null) return row[k];
  }
  return null;
}

function fmtTime(seconds: unknown): string {
  if (typeof seconds !== 'number') return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LeaderboardsPage() {
  const [board, setBoard] = useState<BoardKey>('strength');
  const [tier, setTier] = useState(1);
  // 0 = all three levels in one list.
  const [powerLevel, setPowerLevel] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard', board, board === 'strength' ? tier : board === 'power' ? powerLevel : null],
    queryFn: () => {
      switch (board) {
        case 'strength':
          return fetchTierLeaderboard(tier);
        case 'power':
          return fetchPowerLeaderboard(powerLevel);
        case 'static':
          return fetchStaticWellRounded();
        case 'onemm':
          return fetchOneMMWellRounded();
        case 'wra':
          return fetchGlobalWellRounded();
      }
    },
  });

  const scoreHeader = board === 'strength' ? 'Best time' : 'Points';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Leaderboards</h1>
          <div className="sub">The same boards athletes see in the app (hidden athletes left out).</div>
        </div>
        <div className="row">
          <select
            className="field"
            value={board}
            onChange={(e) => setBoard(e.target.value as BoardKey)}
            aria-label="Leaderboard type"
          >
            {BOARDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          {board === 'power' && (
            <select
              className="field"
              value={powerLevel}
              onChange={(e) => setPowerLevel(Number(e.target.value))}
              aria-label="Power level"
            >
              <option value={0}>All levels</option>
              {[1, 2, 3].map((l) => (
                <option key={l} value={l}>
                  {POWER_LEVEL_NAMES[l]}
                </option>
              ))}
            </select>
          )}
          {board === 'strength' && (
            <select
              className="field"
              value={tier}
              onChange={(e) => setTier(Number(e.target.value))}
              aria-label="Tier"
            >
              {TIER_NAMES.map((name, i) =>
                i === 0 ? null : (
                  <option key={i} value={i}>
                    Tier {i} — {name}
                  </option>
                ),
              )}
            </select>
          )}
        </div>
      </div>

      {error && <ErrorNote error={error} />}

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 56 }}>#</th>
                <th>Warrior</th>
                <th style={{ textAlign: 'right' }}>{scoreHeader}</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={4}>
                      <div className="skeleton" style={{ height: 14 }} />
                    </td>
                  </tr>
                ))}
              {!isLoading &&
                data?.map((row, i) => {
                  // Column names vary per RPC: tier board uses display_name/
                  // best_time, WRA uses display_name/total_score, static+1MM
                  // use abbreviated d_name/t_score/u_id (see 20260710180000).
                  const name = val(row, ['display_name', 'd_name', 'name']) as
                    | string
                    | null;
                  const score =
                    board === 'strength'
                      ? fmtTime(val(row, ['best_time', 'time_seconds']))
                      : Math.round(
                          Number(
                            val(row, [
                              'total_score',
                              't_score',
                              'total_points',
                              'power_points',
                              'points',
                              'score',
                            ]) ?? 0,
                          ),
                        ).toLocaleString();
                  const level = val(row, ['power_level']) as number | null;
                  const country = (val(row, ['country', 'gender']) as string | null) ?? '';
                  const detail = level ? [POWER_LEVEL_NAMES[level], country].filter(Boolean).join(' · ') : country;
                  return (
                    <tr key={(val(row, ['user_id', 'u_id', 'id']) as string) ?? i}>
                      <td className="num dim">{(val(row, ['rank']) as number | null) ?? i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{name || '—'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {score}
                      </td>
                      <td className="dim">{detail}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!isLoading && data && data.length === 0 && (
            <div className="empty">
              <span className="label">No entries</span>
              Nobody is on this board yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
