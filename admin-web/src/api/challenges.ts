import { supabase } from '@/lib/supabase';

// Weekly challenge writes are direct table ops under the "Admins manage
// challenges" RLS policies — same pattern as the mobile ChallengeService,
// except the panel writes any chosen week, not just the current one.

export interface ChallengeMovement {
  name: string;
  reps: number;
  points: number;
}

export interface WeeklyChallenge {
  id: string;
  group_id: number;
  week_start: string;
  title: string;
  description: string | null;
  scoring_type: 'reps' | 'time';
  time_limit: number | null;
  movements: ChallengeMovement[];
  is_active: boolean;
}

export interface ChallengeTemplate {
  id: string;
  name: string;
  group_id: number | null;
  title: string;
  description: string | null;
  scoring_type: 'reps' | 'time';
  movements: ChallengeMovement[];
  time_limit: number | null;
  created_at: string;
}

export interface ChallengeAnalytics {
  week_start: string;
  challenges: Array<{
    id: string;
    group_id: number;
    title: string;
    scoring_type: string;
    time_limit: number | null;
    is_active: boolean;
    entry_count: number;
    participant_count: number;
    min_score: number | null;
    max_score: number | null;
    avg_score: number | null;
    median_score: number | null;
  }>;
  trend: Array<{ week_start: string; group_id: number; entry_count: number }>;
}

export async function fetchWeekChallenges(weekStart: string): Promise<WeeklyChallenge[]> {
  const { data, error } = await supabase
    .from('weekly_challenges')
    .select('*')
    .eq('week_start', weekStart)
    .order('group_id');
  if (error) throw new Error(error.message);
  return (data ?? []) as WeeklyChallenge[];
}

export interface ChallengeUpsert {
  group_id: number;
  week_start: string;
  title: string;
  description: string | null;
  scoring_type: 'reps' | 'time';
  time_limit: number | null;
  movements: ChallengeMovement[];
  is_active: boolean;
}

export async function upsertChallenges(rows: ChallengeUpsert[]): Promise<void> {
  // Rides the unique_active_challenge_per_week (group_id, week_start) index.
  const { error } = await supabase
    .from('weekly_challenges')
    .upsert(rows, { onConflict: 'group_id,week_start' });
  if (error) throw new Error(error.message);
}

export async function deleteChallenge(id: string): Promise<void> {
  const { error } = await supabase.from('weekly_challenges').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchTemplates(): Promise<ChallengeTemplate[]> {
  const { data, error } = await supabase
    .from('challenge_templates')
    .select('*')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChallengeTemplate[];
}

export async function saveTemplate(
  t: Omit<ChallengeTemplate, 'id' | 'created_at'> & { id?: string },
): Promise<void> {
  const { id, ...fields } = t;
  const { error } = id
    ? await supabase
        .from('challenge_templates')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
    : await supabase.from('challenge_templates').insert(fields);
  if (error) throw new Error(error.message);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('challenge_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchChallengeAnalytics(
  weekStart: string | null,
): Promise<ChallengeAnalytics> {
  const { data, error } = await supabase.rpc('admin_get_challenge_analytics', {
    p_week_start: weekStart,
  });
  if (error) throw new Error(error.message);
  return data as ChallengeAnalytics;
}
