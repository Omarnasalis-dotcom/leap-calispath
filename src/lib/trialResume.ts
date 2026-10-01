import AsyncStorage from '@react-native-async-storage/async-storage';

// A strength trial in progress, saved on the phone so a crash, a dead
// battery or an accidental swipe-close doesn't throw the attempt away.
// Owner decision: time the app was closed counts for up to
// CLOSED_GRACE_SECONDS, then the clock is paused. Counting some of it keeps
// "close the app to rest" from being free; capping it means a dead phone
// doesn't ruin the attempt.
export interface SavedTrial {
  tier: number;
  mode: 'progression' | 'practice' | 'eternal';
  elapsedSeconds: number; // trial clock at the last save
  savedAt: number; // epoch ms of the last save
  stepIdx: number;
  // Set once FINISH was tapped: the result is final, only the save is missing.
  finishedSeconds?: number;
}

// Same ceiling the server enforces (submit-trial-result MAX_TIME_SECONDS).
export const MAX_TRIAL_SECONDS = 3600;
export const CLOSED_GRACE_SECONDS = 60;
// A trial left closed longer than this isn't offered back.
export const RESUME_WINDOW_MS = 60 * 60 * 1000;

/** Trial clock to resume at: the saved time plus up to a minute of the gap. */
export function resumedElapsedSeconds(saved: SavedTrial, now: number = Date.now()): number {
  const closedSeconds = Math.max(0, Math.floor((now - saved.savedAt) / 1000));
  return saved.elapsedSeconds + Math.min(closedSeconds, CLOSED_GRACE_SECONDS);
}

const key = (userId: string) => `trial_in_progress_v2:${userId}`;

export async function loadSavedTrial(userId: string): Promise<SavedTrial | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedTrial;
    if (typeof saved?.tier !== 'number' || typeof saved?.elapsedSeconds !== 'number' || typeof saved?.savedAt !== 'number') return null;
    return saved;
  } catch {
    return null;
  }
}

export async function saveTrialProgress(userId: string, saved: SavedTrial): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(saved));
  } catch {
    // Non-critical — the trial itself still runs.
  }
}

export async function clearSavedTrial(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {}
}
