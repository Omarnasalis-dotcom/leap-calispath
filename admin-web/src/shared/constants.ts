// Mirrored from the mobile app (src/lib/trials.ts tier names, weekly
// challenge groups in src/lib/weeklyChallenge.ts) — keep in sync manually.

// Fixed profile id for the "Leap" house account — the content owner for
// self-service Workout Templates Library clones where no real coach is
// involved (src/constants/system.ts). A real profiles row, but must never
// appear in user-facing rosters, searches, or leaderboards.
export const LEAP_SYSTEM_PROFILE_ID = '00000000-0000-0000-0000-000000000001';

export const TIER_NAMES = [
  'Helot',
  'Neos',
  'Ephebe',
  'Hoplite',
  'Spartan',
  'Lochagos',
  'Strategos',
  'Olympian',
  'Demigod',
  'Eternity',
] as const;

export function tierName(tier: number | null | undefined): string {
  if (tier == null || tier < 0 || tier >= TIER_NAMES.length) return '—';
  return TIER_NAMES[tier];
}

export const CHALLENGE_GROUPS = [
  { id: 1, name: 'Recruits', tiers: 'Tiers 0–2' },
  { id: 2, name: 'Warriors', tiers: 'Tiers 3–5' },
  { id: 3, name: 'Legends', tiers: 'Tiers 6–8' },
] as const;

/** Most recent Saturday (UTC), yyyy-mm-dd — mirrors ChallengeService.getCurrentWeekStart(). */
export function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 Sun .. 6 Sat
  const daysBack = (day + 1) % 7;
  const sat = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack),
  );
  return sat.toISOString().slice(0, 10);
}

/** Saturday shifted by n weeks from the current one, yyyy-mm-dd. */
export function shiftWeekStart(weekStart: string, weeks: number): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSeconds(total: number | null | undefined): string {
  if (total == null) return '—';
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
