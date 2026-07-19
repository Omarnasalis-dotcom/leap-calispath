import { supabase } from '@/lib/supabase';

// Coaching CRUD rides the existing enforcement verified in Phase 0:
// "Admin manages all ..." FOR-ALL RLS policies on program tables and
// exercise_library, plus owner-or-admin checks inside the coaching RPCs.

export interface Exercise {
  id: string;
  name: string;
  youtube_url: string | null;
  category: string | null;
  difficulty: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProgramTemplateRow {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  status: string | null;
  is_library_template: boolean;
  published_at: string | null;
  created_at: string;
  coach_name?: string | null;
}

export interface BlockExercise {
  /** block_exercises row id (existing) or local key (new) */
  id: string;
  exercise_id: string;
  exercise_name?: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  notes: string | null;
  order_index: number;
}

export interface ProgramBlock {
  /** db id when persisted; local key when new */
  id: string;
  db_id: string | null;
  name: string;
  notes: string | null;
  week_number: number;
  order_index: number;
  exercises: BlockExercise[];
}

export interface AssignmentRow {
  id: string;
  template_id: string;
  warrior_id: string;
  coach_id: string;
  status: string | null;
  current_week: number | null;
  assigned_at: string;
  warrior_name?: string | null;
  coach_name?: string | null;
  template_name?: string | null;
}

export interface CoachingAnalytics {
  templates: {
    total: number;
    library_count: number;
    by_status: Record<string, number>;
  };
  assignments: { total: number; by_status: Record<string, number> };
  workout_logs: {
    total: number;
    last_7_days: number;
    last_28_days: number;
    active_warriors_last_7_days: number;
  };
  coach_leaderboard: Array<{
    coach_id: string;
    display_name: string | null;
    active_clients: number;
    templates: number;
    published_templates: number;
  }>;
}

// ---------- exercise library ----------

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercise_library').select('*').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Exercise[];
}

export async function saveExercise(
  e: Partial<Exercise> & { name: string; id?: string },
): Promise<void> {
  const { id, ...fields } = e;
  const { error } = id
    ? await supabase.from('exercise_library').update(fields).eq('id', id)
    : await supabase.from('exercise_library').insert(fields);
  if (error) throw new Error(error.message);
}

export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercise_library').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- program templates ----------

export async function fetchProgramTemplates(): Promise<ProgramTemplateRow[]> {
  const { data, error } = await supabase
    .from('program_templates')
    .select('id, coach_id, name, description, status, is_library_template, published_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProgramTemplateRow[];
  // resolve coach names in one round trip (safe columns only)
  const coachIds = [...new Set(rows.map((r) => r.coach_id))];
  if (coachIds.length > 0) {
    const { data: coaches } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', coachIds);
    const names = new Map(
      ((coaches ?? []) as Array<{ id: string; display_name: string | null }>).map((c) => [
        c.id,
        c.display_name,
      ]),
    );
    for (const r of rows) r.coach_name = names.get(r.coach_id) ?? null;
  }
  return rows;
}

export async function fetchTemplateBlocks(templateId: string): Promise<ProgramBlock[]> {
  const { data: blocks, error } = await supabase
    .from('program_blocks')
    .select('id, name, notes, week_number, order_index')
    .eq('template_id', templateId)
    .order('week_number')
    .order('order_index');
  if (error) throw new Error(error.message);
  const blockIds = (blocks ?? []).map((b) => b.id);
  let exByBlock = new Map<string, BlockExercise[]>();
  if (blockIds.length > 0) {
    const { data: exs, error: exErr } = await supabase
      .from('block_exercises')
      .select('id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, notes, order_index, exercise_library(name)')
      .in('block_id', blockIds)
      .order('order_index');
    if (exErr) throw new Error(exErr.message);
    exByBlock = new Map();
    for (const raw of (exs ?? []) as Array<Record<string, unknown>>) {
      const blockId = raw.block_id as string;
      const list = exByBlock.get(blockId) ?? [];
      list.push({
        id: raw.id as string,
        exercise_id: raw.exercise_id as string,
        exercise_name:
          (raw.exercise_library as { name?: string } | null)?.name ?? undefined,
        sets: raw.sets as number | null,
        reps: raw.reps as number | null,
        rest_seconds: raw.rest_seconds as number | null,
        hold_seconds: raw.hold_seconds as number | null,
        notes: raw.notes as string | null,
        order_index: (raw.order_index as number) ?? 0,
      });
      exByBlock.set(blockId, list);
    }
  }
  return (blocks ?? []).map((b) => ({
    id: b.id,
    db_id: b.id,
    name: b.name,
    notes: b.notes,
    week_number: b.week_number ?? 1,
    order_index: b.order_index ?? 0,
    exercises: exByBlock.get(b.id) ?? [],
  }));
}

export async function saveProgramTemplate(params: {
  templateId: string | null;
  name: string;
  description: string | null;
  blocks: ProgramBlock[];
}): Promise<string> {
  const payload = params.blocks.map((b, bi) => ({
    db_id: b.db_id,
    name: b.name,
    notes: b.notes,
    order_index: bi,
    week_number: b.week_number,
    exercises: b.exercises.map((e, ei) => ({
      exercise_id: e.exercise_id,
      sets: e.sets,
      reps: e.reps,
      rest_seconds: e.rest_seconds,
      hold_seconds: e.hold_seconds,
      notes: e.notes,
      order_index: ei,
    })),
  }));
  const { data, error } = await supabase.rpc('save_program_template', {
    p_template_id: params.templateId,
    p_name: params.name,
    p_description: params.description,
    p_blocks: payload,
  });
  if (error) throw new Error(error.message);
  const result = data as {
    success: boolean;
    template_id?: string;
    error?: string;
    undeletable_block_ids?: string[];
  };
  if (!result?.success) throw new Error(result?.error ?? 'Save failed');
  if (result.undeletable_block_ids && result.undeletable_block_ids.length > 0) {
    throw new Error(
      'Saved, but some removed blocks were kept because warriors already logged workouts against them.',
    );
  }
  return result.template_id!;
}

export async function deleteProgramTemplate(templateId: string): Promise<void> {
  // Ordered manual cascade under the "Admin manages all" policies. A
  // workout_logs FK on a block surfaces as an error rather than a partial
  // delete — the same behavior the mobile screens accept.
  const { data: blocks } = await supabase
    .from('program_blocks')
    .select('id')
    .eq('template_id', templateId);
  const ids = (blocks ?? []).map((b) => b.id);
  if (ids.length > 0) {
    const { error: exErr } = await supabase.from('block_exercises').delete().in('block_id', ids);
    if (exErr) throw new Error(exErr.message);
    const { error: blockErr } = await supabase.from('program_blocks').delete().in('id', ids);
    if (blockErr) throw new Error(blockErr.message);
  }
  const { error } = await supabase.from('program_templates').delete().eq('id', templateId);
  if (error) throw new Error(error.message);
}

// ---------- client assignments ----------

export async function fetchAssignments(): Promise<AssignmentRow[]> {
  const { data, error } = await supabase
    .from('warrior_programs')
    .select('id, template_id, warrior_id, coach_id, status, current_week, assigned_at')
    .order('assigned_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AssignmentRow[];
  const profileIds = [...new Set(rows.flatMap((r) => [r.warrior_id, r.coach_id]))];
  const templateIds = [...new Set(rows.map((r) => r.template_id))];
  if (rows.length > 0) {
    const [{ data: profiles }, { data: templates }] = await Promise.all([
      supabase.from('profiles').select('id, display_name').in('id', profileIds),
      supabase.from('program_templates').select('id, name').in('id', templateIds),
    ]);
    const pNames = new Map(
      ((profiles ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [
        p.id,
        p.display_name,
      ]),
    );
    const tNames = new Map(
      ((templates ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]),
    );
    for (const r of rows) {
      r.warrior_name = pNames.get(r.warrior_id) ?? null;
      r.coach_name = pNames.get(r.coach_id) ?? null;
      r.template_name = tNames.get(r.template_id) ?? null;
    }
  }
  return rows;
}

export async function assignTemplate(params: {
  coachId: string;
  warriorId: string;
  templateId: string;
  customName: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('assign_program_template', {
    p_coach_id: params.coachId,
    p_warrior_id: params.warriorId,
    p_template_id: params.templateId,
    p_custom_name: params.customName,
  });
  if (error) throw new Error(error.message);
}

export async function setAssignmentStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from('warrior_programs').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteClientData(assignmentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_coach_client_data', {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchWarriorProgress(assignmentId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc('get_warrior_progress', {
    p_warrior_program_id: assignmentId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchCoaches(): Promise<Array<{ id: string; display_name: string | null }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .or('is_coach.eq.true,is_admin.eq.true')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; display_name: string | null }>;
}

// ---------- analytics ----------

export async function fetchCoachingAnalytics(): Promise<CoachingAnalytics> {
  const { data, error } = await supabase.rpc('admin_get_coaching_analytics');
  if (error) throw new Error(error.message);
  return data as CoachingAnalytics;
}
