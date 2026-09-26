import { supabase } from '../lib/supabase';
import type { WorldAbove } from '../lib/worldStanding';

export type SummaryWorld = 'static' | 'power' | 'onemm';

export interface WorldSummary {
  rankedCount: number;
  topScore: number;
  myScore: number;
  myRank: number | null;
  above: WorldAbove | null;
  /** movement_id → world-best raw value (seconds / kg / reps). */
  movementBests: Record<string, number>;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Normalises the get_world_summary jsonb payload (numerics arrive as numbers or strings). */
export function parseWorldSummary(raw: any): WorldSummary {
  const bests: Record<string, number> = {};
  Object.entries(raw?.movement_bests ?? {}).forEach(([k, v]) => { bests[k] = num(v); });
  return {
    rankedCount: num(raw?.ranked_count),
    topScore: num(raw?.top_score),
    myScore: num(raw?.my_score),
    myRank: raw?.my_rank == null ? null : num(raw.my_rank),
    above: raw?.above
      ? { rank: num(raw.above.rank), score: num(raw.above.score), name: String(raw.above.name ?? 'Warrior') }
      : null,
    movementBests: bests,
  };
}

export const WorldSummaryService = {
  /** One call per world; see supabase/migrations/20260926040000_add_get_world_summary.sql. */
  async get(world: SummaryWorld): Promise<WorldSummary> {
    const { data, error } = await supabase.rpc('get_world_summary', { p_world: world });
    if (error) throw error;
    return parseWorldSummary(data);
  },
};
