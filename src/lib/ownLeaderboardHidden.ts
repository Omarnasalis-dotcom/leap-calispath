import { useSyncExternalStore } from 'react';

// Whether the signed-in athlete has hidden themselves from leaderboards, for
// UI that marks "YOU · HIDDEN". A tiny store with no imports, set by
// AuthContext whenever the profile changes, so shared UI (the worlds kit's
// YouBadge) can read it without depending on AuthContext.
let hidden = false;
const listeners = new Set<() => void>();

export function setOwnLeaderboardHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const get = () => hidden;

export function useOwnLeaderboardHidden(): boolean {
  return useSyncExternalStore(subscribe, get, get);
}
