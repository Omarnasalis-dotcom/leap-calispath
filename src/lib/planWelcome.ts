import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../types';
import { hasActiveAccess, type SubscriptionTier } from './entitlement';

// The "Welcome to PRO / MAX" screen: shown the first time Profile opens after
// someone gets a plan (bought, restored, upgraded, or a gift claimed or given
// by the Leap team), once per plan.
//
// This phone remembers the plan it last saw for the person. The very first
// look only records it (people already on a plan when this shipped, or on a
// new phone, don't get a welcome for a plan they've had for weeks). A buy or
// a gift claim made in the app also leaves a note, so it still shows when
// that happens before Profile ever recorded anything.

export type WelcomeTier = 'pro' | 'max';
export interface PlanWelcome {
  tier: WelcomeTier;
  /** Pro → Max: the screen shows only what Max adds. */
  upgrade: boolean;
}

const RANK: Record<SubscriptionTier, number> = { free: 0, first: 1, pro: 2, max: 3 };

/** The plan the person is paying for (or was given) right now; staff aren't customers. */
export function paidTier(profile: Profile | null): SubscriptionTier {
  if (!profile || !hasActiveAccess(profile)) return 'free';
  const tier = profile.subscription_tier as SubscriptionTier | null | undefined;
  return tier && tier in RANK ? tier : 'free';
}

const seenKey = (userId: string) => `plan_welcome_seen_${userId}`;
const noteKey = (userId: string) => `plan_welcome_note_${userId}`;

async function read(key: string): Promise<SubscriptionTier | null> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v && v in RANK ? (v as SubscriptionTier) : null;
  } catch {
    return null;
  }
}

async function write(key: string, value: SubscriptionTier | null): Promise<void> {
  try {
    if (value) await AsyncStorage.setItem(key, value);
    else await AsyncStorage.removeItem(key);
  } catch {
    // Device storage is a convenience: at worst the welcome shows again or not at all.
  }
}

/** Pure rule: what to show, given the plan before and the plan now. */
export function welcomeFor(previous: SubscriptionTier, current: SubscriptionTier): PlanWelcome | null {
  if (current !== 'pro' && current !== 'max') return null;
  if (RANK[current] <= RANK[previous]) return null;
  return { tier: current, upgrade: previous === 'pro' && current === 'max' };
}

/**
 * Whether Profile should open the welcome now. Never throws. Records the
 * current plan when nothing is due (first look, a plan that ended, the same
 * plan renewed), so the next change is measured from here.
 */
export async function checkPlanWelcome(
  profile: Profile | null,
  paywallEnabled: boolean,
): Promise<PlanWelcome | null> {
  if (!profile?.id || !paywallEnabled || profile.is_admin || profile.is_coach) return null;
  const current = paidTier(profile);
  const previous = (await read(seenKey(profile.id))) ?? (await read(noteKey(profile.id)));
  if (previous === null) {
    await write(seenKey(profile.id), current);
    return null;
  }
  const due = welcomeFor(previous, current);
  if (!due) {
    await write(seenKey(profile.id), current);
    await write(noteKey(profile.id), null);
  }
  return due;
}

/** The welcome is on screen: it won't come back for this plan. */
export async function markPlanWelcomeShown(userId: string, tier: WelcomeTier): Promise<void> {
  await write(seenKey(userId), tier);
  await write(noteKey(userId), null);
}

/** Before a purchase/restore or a gift claim: remember the plan they had. */
export async function notePlanBeforeChange(profile: Profile | null): Promise<void> {
  if (!profile?.id) return;
  if ((await read(seenKey(profile.id))) !== null) return;
  await write(noteKey(profile.id), paidTier(profile));
}
