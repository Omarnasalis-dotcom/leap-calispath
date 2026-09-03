import { supabase } from '@/lib/supabase';
import type { AiCoachMessageReportRow } from '@/shared/types';

export async function fetchAiCoachReports(includeReviewed: boolean): Promise<AiCoachMessageReportRow[]> {
  const { data, error } = await supabase.rpc('admin_list_ai_coach_reports', {
    p_include_reviewed: includeReviewed,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AiCoachMessageReportRow[];
}

export async function markAiCoachReportReviewed(reportId: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_mark_ai_coach_report_reviewed', {
    p_report_id: reportId,
  });
  if (error) throw new Error(error.message);
  const result = data as { success: boolean; error?: string };
  if (!result?.success) {
    throw new Error(result?.error ?? 'Failed to mark reviewed');
  }
}
