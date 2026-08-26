import { ToolDefinition } from "./types.ts";

// Thin wrapper over get_warrior_progress — already patched (see
// 20260821171000_allow_warrior_self_access_progress.sql) to allow the
// warrior themselves to call it, not just their coach/an admin. Must go
// through the user-scoped client so auth.uid() inside that RPC resolves to
// the athlete, not the edge function's own identity.
//
// Real bug found live (2026-08-26): telling the model "also call
// get_program_structure and compare" did not hold up in practice — same
// class of failure as everywhere else this session, a second tool call and
// a manual cross-reference across two separate results is too easy to skip
// or get wrong. So this now computes the comparison itself: for every
// logged exercise, it joins the block's CURRENT prescribed sets/reps
// (block_exercises, via the log's own block_id) and adds `under_prescribed`
// directly onto the result. The model has nothing left to forget — the
// shortfall is just there, in the one tool it already calls every review.
// (Known limitation: this reads block_exercises as they are NOW, not as of
// when that session was logged — a mid-week adjust_program edit after some
// sessions were already logged would show the post-edit target against
// pre-edit logs. Rare edge case, not worth versioning for.)
export const getWorkoutLogs: ToolDefinition = {
  name: "get_workout_logs",
  description:
    "Get the athlete's actual logged performance (sets/reps/weight/hold completed, RPE, feel, pain notes, bodyweight trend) for their active program, block by block, week by week — each logged exercise also carries `under_prescribed: true/false`, computed against what the block actually prescribes, so a session marked 'completed' with fewer sets or lower reps than written is never mistaken for full completion. Use this before reviewing a week or deciding on an adjustment — never guess at their performance.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program" },
    },
    required: ["warrior_program_id"],
  },
  handler: async (userClient, input) => {
    const { data, error } = await userClient.rpc("get_warrior_progress", {
      p_warrior_program_id: input.warrior_program_id,
    });
    if (error) throw new Error(`get_workout_logs failed: ${error.message}`);

    const logs = (data?.logs ?? []) as Array<{ block_id: string | null; sets: Array<{ exercise_name: string | null; reps_completed: number | null }> }>;
    const blockIds = [...new Set(logs.map((l) => l.block_id).filter((id): id is string => !!id))];
    if (blockIds.length === 0) return data;

    const { data: blockExRows, error: beError } = await userClient
      .from("block_exercises")
      .select("block_id, sets, reps, exercise_library(name)")
      .in("block_id", blockIds);
    if (beError) throw new Error(`get_workout_logs failed loading prescribed sets/reps: ${beError.message}`);

    const prescribedByKey = new Map<string, { sets: number | null; reps: number | null }>();
    for (const row of (blockExRows ?? []) as any[]) {
      const name: string | undefined = row.exercise_library?.name;
      if (!name) continue;
      prescribedByKey.set(`${row.block_id}::${name.toLowerCase()}`, { sets: row.sets, reps: row.reps });
    }

    const annotatedLogs = logs.map((log) => {
      const byExercise = new Map<string, typeof log.sets>();
      for (const s of log.sets ?? []) {
        const key = (s.exercise_name ?? "").toLowerCase();
        if (!key) continue;
        if (!byExercise.has(key)) byExercise.set(key, []);
        byExercise.get(key)!.push(s);
      }
      const exercises_vs_prescribed = [...byExercise.entries()].map(([nameLower, sets]) => {
        const prescribed = log.block_id ? prescribedByKey.get(`${log.block_id}::${nameLower}`) : undefined;
        const setsLogged = sets.length;
        const repsLogged = sets.map((s) => s.reps_completed).filter((r): r is number => r !== null && r !== undefined);
        const minRepsLogged = repsLogged.length > 0 ? Math.min(...repsLogged) : null;
        const under_prescribed =
          (prescribed?.sets != null && setsLogged < prescribed.sets) ||
          (prescribed?.reps != null && minRepsLogged !== null && minRepsLogged < prescribed.reps);
        return {
          exercise_name: sets[0]?.exercise_name ?? null,
          sets_prescribed: prescribed?.sets ?? null,
          sets_logged: setsLogged,
          reps_prescribed: prescribed?.reps ?? null,
          reps_logged: repsLogged,
          under_prescribed,
        };
      });
      return { ...log, exercises_vs_prescribed };
    });

    return { ...data, logs: annotatedLogs };
  },
};
