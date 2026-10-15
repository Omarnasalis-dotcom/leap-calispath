// Customize Program's build stashed across the paywall (see
// CustomizeProgramScreen's pendingProgramStorageKey). Audit fix 2026-10-15:
// a stash is created automatically only when fresh (straight back from a
// purchase); older it's just restored for review; after a day it's dropped.

export const PENDING_AUTO_CREATE_MS = 30 * 60 * 1000;
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PendingProgram { ids: string[]; ageMs: number }

/** The stashed build and its age (an old bare-array stash counts as stale). */
export function parsePendingProgram(raw: string, now: number = Date.now()): PendingProgram | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return { ids: parsed.filter((x): x is string => typeof x === 'string'), ageMs: Infinity };
    const obj = parsed as { ids?: unknown; at?: unknown };
    if (!Array.isArray(obj?.ids) || typeof obj.at !== 'number') return null;
    return { ids: obj.ids.filter((x): x is string => typeof x === 'string'), ageMs: Math.max(0, now - obj.at) };
  } catch {
    return null;
  }
}

/** Too old to bring back at all (an old-format stash is still restored, once, for review). */
export const pendingExpired = (p: PendingProgram) => p.ageMs !== Infinity && p.ageMs > PENDING_MAX_AGE_MS;

/** Fresh enough to create the program without a tap (just bought Pro). */
export const pendingAutoCreates = (p: PendingProgram) => p.ageMs <= PENDING_AUTO_CREATE_MS;
