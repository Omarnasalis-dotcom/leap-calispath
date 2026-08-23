import { ToolDefinition } from "./types.ts";
import { getNextTrial } from "./trialData.ts";

// Read-only grounding for every turn. get_my_profile() is the same
// SECURITY DEFINER RPC AuthContext.tsx already calls client-side for the
// user's own profile — self-access to entitlement/tier fields goes through
// it rather than a raw table select (see the profiles column lockdown
// migrations). trial_history recency and the active warrior_programs row
// are plain selects against the caller's own rows, relying on the same
// self-access RLS every other warrior-facing screen in the app already
// depends on (WarriorProgramScreen reads warrior_programs the same way).
export const getUserContext: ToolDefinition = {
  name: "get_user_context",
  description:
    "Get the athlete's current profile: strength tier, the raw onboarding movement-test numbers behind that tier (assessment_raw: pull-up/dip/push-up/muscle-up variant + reps, from their latest assessment — use this to see their actual weak point, not just the tier number), the exact real movements for the trial they're currently working toward (next_trial — quote this exactly, never guess or assume generic calisthenics trial content applies), power/static PBs, assessment dates, trial history recency, and their active training program (if any), including whether that program is AI Coach-owned (only AI-owned programs can be adjusted/extended by append_week or adjust_program).",
  input_schema: { type: "object", properties: {} },
  handler: async (userClient) => {
    const { data: profile, error: profileError } = await userClient.rpc("get_my_profile").single();
    if (profileError) throw new Error(`Failed to load profile: ${profileError.message}`);

    const { data: recentTrials } = await userClient
      .from("trial_history")
      .select("tier_attempted, completed, attempted_at")
      .order("attempted_at", { ascending: false })
      .limit(5);

    const { data: activeProgram } = await userClient
      .from("warrior_programs")
      .select("id, template_id, coach_id, current_week, program_templates(name)")
      .eq("status", "active")
      .maybeSingle();

    const AI_COACH_SYSTEM_PROFILE_ID = "00000000-0000-0000-0000-000000000002";

    return {
      profile: {
        strength_tier: profile?.strength_tier ?? 0,
        power_tier: profile?.power_tier ?? null,
        statics_tier: profile?.statics_tier ?? null,
        power_pbs: profile?.power_pbs ?? {},
        best_times: profile?.best_times ?? {},
        assessed_at: profile?.assessed_at ?? null,
        assessment_raw: profile?.assessment_raw ?? null,
        power_assessed_at: profile?.power_assessed_at ?? null,
        statics_assessed_at: profile?.statics_assessed_at ?? null,
        trials_attempted: profile?.trials_attempted ?? 0,
        trials_passed: profile?.trials_passed ?? 0,
      },
      next_trial: getNextTrial(profile?.strength_tier ?? 0),
      recent_trial_attempts: recentTrials ?? [],
      active_program: activeProgram
        ? {
            warrior_program_id: activeProgram.id,
            template_id: activeProgram.template_id,
            template_name: (activeProgram as unknown as { program_templates?: { name?: string } })
              .program_templates?.name ?? null,
            current_week: activeProgram.current_week,
            is_ai_coach_owned: activeProgram.coach_id === AI_COACH_SYSTEM_PROFILE_ID,
          }
        : null,
    };
  },
};
