/**
 * Animation quality profile. "lite" halves particle counts and drops the
 * orbit, for old Android phones and for any phone where a celebration
 * stuttered once (remembered on the device).
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FxQuality = 'full' | 'lite';

/** Most animated views on screen at once, per profile. */
export const FX_BUDGET: Record<FxQuality, number> = { full: 30, lite: 15 };

const STORAGE_KEY = 'fx_quality_v1';
/** A run counts as janky when this share of its frames took too long. */
export const JANK_FRAME_MS = 25;
export const JANK_RATIO = 0.2;
export const JANK_MIN_FRAMES = 30;

/** Android before 10 (API 29) starts in lite. */
export function initialQuality(os: string, version: string | number): FxQuality {
  return os === 'android' && Number(version) < 29 ? 'lite' : 'full';
}

/** Particles to draw for an effect designed with `n`. */
export function particleCount(n: number, quality: FxQuality): number {
  return quality === 'lite' ? Math.ceil(n / 2) : n;
}

/** Whether a run with these frame counts should switch the device to lite. */
export function isJankyRun(frames: number, slowFrames: number): boolean {
  return frames >= JANK_MIN_FRAMES && slowFrames / frames > JANK_RATIO;
}

let cached: FxQuality | null = null;

export async function loadFxQuality(): Promise<FxQuality> {
  if (cached) return cached;
  let q = initialQuality(Platform.OS, Platform.Version);
  try {
    if ((await AsyncStorage.getItem(STORAGE_KEY)) === 'lite') q = 'lite';
  } catch {
    // Storage can fail; the platform default still applies.
  }
  cached = q;
  return q;
}

/** Called once a run stuttered: every later effect on this device runs lite. */
export function reportJank(): void {
  if (cached === 'lite') return;
  cached = 'lite';
  AsyncStorage.setItem(STORAGE_KEY, 'lite').catch(() => {});
}

/** The device's profile; starts from the platform default until storage answers. */
export function useFxQuality(): FxQuality {
  const [q, setQ] = useState<FxQuality>(() => cached ?? initialQuality(Platform.OS, Platform.Version));
  useEffect(() => {
    let alive = true;
    loadFxQuality().then(v => { if (alive) setQ(v); });
    return () => { alive = false; };
  }, []);
  return q;
}
