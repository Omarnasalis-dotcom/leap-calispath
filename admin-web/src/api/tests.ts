import { supabase } from '@/lib/supabase';
import { BlockConceptParser } from '@/shared/BlockConceptParser';
import { isTestKind, type TestKind } from '@/shared/testItems';

// Coach Test Week (supabase/migrations/20261114190000_coach_test_week.sql):
// program_test_results is readable by the athlete's coaches (RLS), written
// only by submit_program_test_item / grade_program_test_item.

export interface TestResult {
  id: string;
  warrior_program_id: string | null;
  warrior_id: string;
  block_id: string | null;
  week_number: number;
  test_kind: TestKind;
  movement_id: string | null;
  item_name: string | null;
  status: 'done' | 'skipped';
  value: number | null;
  unit: 'reps' | 'kg' | 'seconds' | null;
  skip_reason: 'cant_do' | 'injury' | 'no_equipment' | 'no_time' | 'other' | null;
  skip_detail: string | null;
  world_status: 'saved' | 'locked' | 'no_world' | 'none';
  is_new_pb: boolean;
  coach_grade: 'pass' | 'needs_work' | null;
  coach_note: string | null;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestBlock {
  id: string;
  week_number: number;
  order_index: number;
  name: string;
  test_kind: TestKind;
  test_movement: string | null;
}

/** Every test result of this athlete (all programs), oldest first. */
export async function fetchTestResults(warriorId: string): Promise<TestResult[]> {
  const { data, error } = await supabase
    .from('program_test_results')
    .select('*')
    .eq('warrior_id', warriorId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, value: r.value == null ? null : Number(r.value) })) as TestResult[];
}

/** The test items of a program's template, in week + block order. */
export async function fetchTestBlocks(templateId: string): Promise<TestBlock[]> {
  const { data, error } = await supabase
    .from('program_blocks')
    .select('id, week_number, order_index, name, notes')
    .eq('template_id', templateId)
    .like('notes', '%"test_kind"%')
    .order('week_number', { ascending: true })
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  const out: TestBlock[] = [];
  for (const b of data ?? []) {
    const { metadata } = BlockConceptParser.parse(b.notes);
    if (!isTestKind(metadata.test_kind)) continue;
    out.push({
      id: b.id,
      week_number: b.week_number ?? 1,
      order_index: b.order_index ?? 0,
      name: b.name ?? '',
      test_kind: metadata.test_kind,
      test_movement: metadata.test_movement ?? null,
    });
  }
  return out;
}

export async function gradeTestResult(resultId: string, grade: 'pass' | 'needs_work' | null, note: string): Promise<void> {
  const { error } = await supabase.rpc('grade_program_test_item', {
    p_result_id: resultId,
    p_grade: grade,
    p_note: note || null,
  });
  if (error) throw new Error(error.message);
}

/** The signed-in coach's own WhatsApp number (digits), or null. */
export async function fetchMyWhatsApp(): Promise<string | null> {
  const { data, error } = await supabase.from('coach_contacts').select('whatsapp').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { whatsapp: string | null } | null)?.whatsapp ?? null;
}

export async function saveMyWhatsApp(number: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_my_coach_whatsapp', { p_number: number });
  if (error) {
    if (error.message.includes('BAD_NUMBER')) {
      throw new Error('Enter the full number with country code, e.g. +20 100 123 4567');
    }
    throw new Error(error.message);
  }
  return (data as string | null) ?? null;
}
