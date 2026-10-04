import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { withNetworkRetry } from './submitErrors';

// Server-side Journey lane state, per program (see migration
// 20261004100000_journey_quest_slots_and_day_choice.sql) -- the source that
// survives a reinstall or a second device. Quest slots also keep a
// per-program copy on the device: it's what the lane shows when the fetch
// fails, and anything in it the server lacks (a save that failed) is sent
// again on the next load.

export type QuestSlotStatus = 'done' | 'skipped';

export interface QuestSlotSets {
  done: Set<string>;
  skipped: Set<string>;
}

export async function fetchQuestSlots(warriorProgramId: string): Promise<QuestSlotSets> {
  const { data, error } = await supabase
    .from('journey_quest_slots')
    .select('slot_key, status')
    .eq('warrior_program_id', warriorProgramId);
  if (error) throw error;
  const sets: QuestSlotSets = { done: new Set(), skipped: new Set() };
  for (const row of data ?? []) {
    (row.status === 'done' ? sets.done : sets.skipped).add(row.slot_key);
  }
  return sets;
}

/** Idempotent: re-saving a slot that's already recorded is a no-op. */
export async function saveQuestSlots(
  userId: string,
  warriorProgramId: string,
  slotKeys: string[],
  status: QuestSlotStatus
): Promise<void> {
  if (slotKeys.length === 0) return;
  await withNetworkRetry(async () => {
    const { error } = await supabase
      .from('journey_quest_slots')
      .upsert(
        slotKeys.map((slot_key) => ({ user_id: userId, warrior_program_id: warriorProgramId, slot_key, status })),
        { onConflict: 'user_id,warrior_program_id,slot_key,status', ignoreDuplicates: true }
      );
    if (error) throw error;
  });
}

export interface DayChoice {
  weekNumber: number;
  dayIndex: number;
}

export async function fetchDayChoice(warriorProgramId: string): Promise<DayChoice | null> {
  const { data, error } = await supabase
    .from('journey_day_choices')
    .select('week_number, day_index')
    .eq('warrior_program_id', warriorProgramId)
    .maybeSingle();
  if (error) throw error;
  return data ? { weekNumber: data.week_number, dayIndex: data.day_index } : null;
}

/** The picked day for this program's given week, or null if none/stale. */
export async function fetchDayChoiceForWeek(warriorProgramId: string, weekNumber: number): Promise<number | null> {
  try {
    const choice = await fetchDayChoice(warriorProgramId);
    return choice && choice.weekNumber === weekNumber ? choice.dayIndex : null;
  } catch {
    // A missing pick only means program order is shown -- never fail a screen over it.
    return null;
  }
}

export async function saveDayChoice(userId: string, warriorProgramId: string, choice: DayChoice): Promise<void> {
  await withNetworkRetry(async () => {
    const { error } = await supabase.from('journey_day_choices').upsert(
      {
        user_id: userId,
        warrior_program_id: warriorProgramId,
        week_number: choice.weekNumber,
        day_index: choice.dayIndex,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,warrior_program_id' }
    );
    if (error) throw error;
  });
}

const slotsCacheKey = (userId: string, programId: string) => `journey_quest_slots_${userId}_${programId}`;

export async function readCachedQuestSlots(userId: string, programId: string): Promise<QuestSlotSets> {
  try {
    const raw = await AsyncStorage.getItem(slotsCacheKey(userId, programId));
    const parsed = raw ? (JSON.parse(raw) as { done?: unknown; skipped?: unknown }) : {};
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
    return { done: new Set(list(parsed.done)), skipped: new Set(list(parsed.skipped)) };
  } catch {
    return { done: new Set(), skipped: new Set() };
  }
}

export async function writeCachedQuestSlots(userId: string, programId: string, sets: QuestSlotSets): Promise<void> {
  try {
    await AsyncStorage.setItem(
      slotsCacheKey(userId, programId),
      JSON.stringify({ done: Array.from(sets.done), skipped: Array.from(sets.skipped) })
    );
  } catch {}
}

export async function addCachedQuestSlot(userId: string, programId: string, slotKey: string, status: QuestSlotStatus) {
  const sets = await readCachedQuestSlots(userId, programId);
  (status === 'done' ? sets.done : sets.skipped).add(slotKey);
  await writeCachedQuestSlots(userId, programId, sets);
}
