import { supabase } from '../lib/supabase';
import { withNetworkRetry } from '../lib/submitErrors';
import { invalidatePowerLeaderboardCache } from '../lib/leaderboard';
import type { SkipReason, TestCoach, TestResult } from '../lib/testItems';
import { NotificationService } from './NotificationService';
import { OneMMService } from './OneMMService';
import { PowerService } from './PowerService';

// Coach Test Week: saves one test item through submit_program_test_item,
// which also sends the result into its world and logs the block.

export interface SubmitTestItemParams {
  warriorProgramId: string;
  blockId: string;
  status: 'done' | 'skipped' | 'none';
  value?: number | null;
  /** max_hold only: the progression the athlete picked. */
  movementId?: string | null;
  skipReason?: SkipReason | null;
  skipDetail?: string | null;
}

export interface SubmitTestItemResult {
  result: TestResult | null;
  weekComplete: boolean;
}

function toResult(row: any): TestResult | null {
  if (!row) return null;
  return { ...row, value: row.value == null ? null : Number(row.value) } as TestResult;
}

export const TestItemService = {
  async submit(p: SubmitTestItemParams): Promise<SubmitTestItemResult> {
    const { data, error } = await withNetworkRetry(async () =>
      supabase.rpc('submit_program_test_item', {
        p_warrior_program_id: p.warriorProgramId,
        p_block_id: p.blockId,
        p_status: p.status,
        p_value: p.value ?? null,
        p_movement_id: p.movementId ?? null,
        p_skip_reason: p.skipReason ?? null,
        p_skip_detail: p.skipDetail ?? null,
      }),
    );
    if (error) throw error;
    const res = (data ?? {}) as any;
    const result = toResult(res.result);

    // The world screens keep short caches; a test result may have moved them.
    if (result?.world_status === 'saved') {
      if (result.test_kind === 'one_rm') {
        PowerService.invalidateCache();
        invalidatePowerLeaderboardCache();
      } else if (result.test_kind === 'max_reps') {
        OneMMService.invalidateCache();
      }
    }
    // Same follow-up the world screens do for an overtaken rival.
    if (res.overtaken_notification_id) NotificationService.sendOvertakeNotificationPush(res.overtaken_notification_id);
    if (res.wra_overtaken_notification_id) NotificationService.sendOvertakeNotificationPush(res.wra_overtaken_notification_id);

    return { result, weekComplete: !!res.week_complete };
  },

  /** Every result of this program + who receives form-check videos. */
  async getProgramTests(warriorProgramId: string): Promise<{ coach: TestCoach | null; results: TestResult[] }> {
    const { data, error } = await supabase.rpc('get_program_tests', { p_warrior_program_id: warriorProgramId });
    if (error) throw error;
    const res = (data ?? {}) as any;
    const results = Array.isArray(res.results) ? res.results.map(toResult).filter(Boolean) : [];
    return { coach: res.coach ?? null, results };
  },
};
