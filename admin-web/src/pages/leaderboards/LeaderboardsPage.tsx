import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchGloryLeaderboard,
  fetchGlobalWellRounded,
  fetchOneMMWellRounded,
  fetchPowerLeaderboard,
  fetchStaticWellRounded,
  fetchTierLeaderboard,
} from '@/api/leaderboards';
import { TIER_NAMES, tierName } from '@/shared/constants';
import { ErrorNote } from '@/components/bits';

type BoardKey = 'strength' | 'power' | 'static' | 'onemm' | 'wra' | 'glory';

const BOARDS: { key: BoardKey; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'power', label: 'Power' },
  { key: 'static', label: 'Static' },
  { key: 'onemm', label: '1-Min-Max' },
  { key: 'wra', label: 'Well-Rounded' },
  { key: 'glory', label: 'Glory' },
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard', board, board === 'strength' ? tier : null],
    queryFn: () => {
      switch (board) {
        case 'strength':
          return fetchTierLeaderboard(tier);
        case 'power':
          return fetchPowerLeaderboard();
        case 'static':
          return fetchStaticWellRounded();
        case 'onemm':
          return fetchOneMMWellRounded();
        case 'wra':
          return fetchGlobalWellRounded();
        case 'glory':
          return fetchGloryLeaderboard();
      }
    },
  });

  const scoreHeader =
    board === 'strength'
      ? 'Best time'
      : board === 'glory'
        ? 'Glory'
        : 'Points';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Leaderboards</h1>
          <div className="sub">Live top-100 standings, straight from the app's RPCs.</div>
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
                              'glory_score',
                              'points',
                              'score',
                            ]) ?? 0,
                          ),
                        ).toLocaleString();
                  const detail =
                    board === 'power'
                      ? `Power tier ${val(row, ['power_tier']) ?? '—'}`
                      : board === 'glory'
                        ? tierName(val(row, ['strength_tier']) as number | null)
                        : ((val(row, ['country', 'gender']) as string | null) ?? '');
                  return (
                    <tr key={(val(row, ['user_id', 'u_id', 'id']) as string) ?? i}>
                      <td className="num dim">{i + 1}</td>
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
