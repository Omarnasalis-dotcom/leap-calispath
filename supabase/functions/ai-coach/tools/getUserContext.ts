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
    "Get the athlete's current profile: strength tier, the raw onboarding movement-test numbers behind that tier (assessment_raw: pull-up/dip/push-up/muscle-up variant + reps, from their latest assessment — use this to see their actual weak point, not just the tier number), the exact real movements for the trial they're currently working toward (next_trial — quote this exactly, never guess or assume generic calisthenics trial content applies), power/static PBs (static_pbs: real recorded Static World hold times in seconds, keyed by movement id — e.g. wall_handstand), total points per world (power_points, one_mm_points, glory_score — real stored totals, not something to compute yourself), assessment dates, trial history recency, and their active training program (if any), including whether that program is AI Coach-owned (only AI-owned programs can be adjusted/extended by append_week or adjust_program).",
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

    // Static World's real recorded hold PBs — "Anyone can read holds" is a
    // public SELECT policy (leaderboard data), so this is filtered to the
    // athlete's own id explicitly rather than relying on RLS to self-scope
    // it. Best hold_seconds per movement_id, same reduction StaticService.ts
    // does client-side. Static World unlocks at tier 1 (§4), not tier 6.
    const { data: staticHolds } = await userClient
      .from("static_holds")
      .select("movement_id, hold_seconds")
      .eq("user_id", profile?.id);
    const staticPbs: Record<string, number> = {};
    for (const h of staticHolds ?? []) {
      if ((h.hold_seconds ?? 0) > (staticPbs[h.movement_id] ?? 0)) {
        staticPbs[h.movement_id] = h.hold_seconds;
      }
    }

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
        // Total points per world — real stored values (glory_score is a
        // computed/stored leaderboard total), not something to add up
        // from PBs yourself. power_points only exists meaningfully at
        // tier 6+ (§4, Power World's real gate); one_mm_points and
        // glory_score are not tier-gated.
        power_points: profile?.power_points ?? 0,
        one_mm_points: profile?.one_mm_points ?? 0,
        glory_score: profile?.glory_score ?? 0,
        // Real recorded Static World hold times, seconds, best per
        // movement — e.g. { wall_handstand: 30 }. Static World's own
        // 3-level scale (wall/freestanding/one-arm handstand, tuck/
        // straddle/full front lever, etc. — see STATIC_MOVEMENTS in
        // src/lib/staticLogic.ts) is coarser than §8's skill-line ladder;
        // treat a hold time here as a strong signal for the checkpoint
        // question, not an exact match to one specific ladder step.
        static_pbs: staticPbs,
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
