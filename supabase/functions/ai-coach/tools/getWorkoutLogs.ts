import { ToolDefinition } from "./types.ts";
import { isUuid, parseConceptNotes } from "./blockHelpers.ts";
import { athleteNoteFrom } from "./athleteNotes.ts";

type LoggedSet = { exercise_name: string | null; reps_completed: number | null; hold_seconds?: number | null };
type Prescribed = { sets: number | null; reps: number | null; hold_seconds: number | null };

// Ladder rows are rungs (1, 2, 3…) and AMRAP / For Time / Tabata rows are
// rounds or timer intervals: none of them is "a set against the written
// reps", so a per-set comparison misreads them (every ladder used to come
// out under_prescribed). Those blocks are judged by their [LOG] result.
export function judgedByBlockResult(blockNotes: string | null | undefined): boolean {
  const { metadata } = parseConceptNotes(blockNotes);
  return ["amrap", "fortime", "tabata"].includes(String(metadata.timing_system ?? "")) || metadata.structure === "ladder";
}

// One logged exercise against what its block prescribes. Holds are compared
// like reps. Facts only (2026-10-30, owner): the coach decides what they
// mean (system-prompt.ts §12). rpe is the block's logged RPE, 1–10.
export function compareToPrescription(sets: LoggedSet[], prescribed: Prescribed | undefined, rpe: number | null | undefined) {
  const repsLogged = sets.map((s) => s.reps_completed).filter((r): r is number => r !== null && r !== undefined);
  const holdsLogged = sets.map((s) => s.hold_seconds).filter((h): h is number => h !== null && h !== undefined);
  const values = holdsLogged.length > 0 ? holdsLogged : repsLogged;
  const target = holdsLogged.length > 0 ? prescribed?.hold_seconds ?? null : prescribed?.reps ?? null;
  const setsPrescribed = prescribed?.sets ?? null;
  const under_prescribed =
    (setsPrescribed != null && sets.length < setsPrescribed) ||
    (target != null && values.length > 0 && Math.min(...values) < target);
  const over_prescribed = !under_prescribed && (
    (setsPrescribed != null && sets.length > setsPrescribed) ||
    (target != null && values.length > 0 && Math.max(...values) > target)
  );
  const rpe_mismatch = rpe != null && ((over_prescribed && rpe >= 9) || (under_prescribed && rpe <= 6));
  return {
    exercise_name: sets[0]?.exercise_name ?? null,
    sets_prescribed: setsPrescribed,
    sets_logged: sets.length,
    reps_prescribed: prescribed?.reps ?? null,
    reps_logged: repsLogged,
    ...(holdsLogged.length > 0 || prescribed?.hold_seconds != null
      ? { hold_prescribed: prescribed?.hold_seconds ?? null, holds_logged: holdsLogged }
      : {}),
    under_prescribed,
    over_prescribed,
    rpe_mismatch,
  };
}

// The app's own result lines for a block ("Finished in: 12:30",
// "Completed: 5 Rounds/Reps", "Ladder Progress: …", "Weight Used: …").
function blockResultFrom(notes: string | null | undefined): string[] {
  return (notes ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("[LOG]")).map((l) => l.replace(/^\[LOG\]\s*/, ""));
}

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
    "Get the athlete's actual logged performance (sets/reps/weight/hold completed, RPE, feel, pain notes, bodyweight trend) for their active program, block by block, week by week. athlete_notes lists every note the athlete wrote, in their own words, apart from the app's [LOG] lines (also on each log as athlete_note) — each logged exercise also carries `under_prescribed`, `over_prescribed` and `rpe_mismatch`, computed against what the block actually prescribes (reps or hold seconds), so a session marked 'completed' with fewer sets or lower reps than written is never mistaken for full completion. Ladder/AMRAP/For Time/Tabata logs carry `judge_by_block_result: true` and `block_result` (time, rounds, rungs) instead. Use this before reviewing a week or deciding on an adjustment — never guess at their performance.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program" },
    },
    required: ["warrior_program_id"],
  },
  handler: async (userClient, input) => {
    // Seen live (2026-09-30): called in parallel with get_user_context
    // before the id was known, with "placeholder" as the id — failed, and
    // had to be called again. Anything that isn't a real id means the
    // athlete's own active program.
    let programId = input.warrior_program_id as string | undefined;
    if (!isUuid(programId)) {
      const { data: auth } = await userClient.auth.getUser();
      const { data: active } = await userClient
        .from("warrior_programs")
        .select("id")
        .eq("warrior_id", auth.user?.id ?? "")
        .eq("status", "active")
        .limit(1);
      programId = (active as Array<{ id: string }> | null)?.[0]?.id;
      if (!programId) return { logs: [], note: "No active program found for this athlete." };
    }
    const { data, error } = await userClient.rpc("get_warrior_progress", {
      p_warrior_program_id: programId,
    });
    if (error) throw new Error(`get_workout_logs failed: ${error.message}`);

    const logs = (data?.logs ?? []) as Array<{
      block_id: string | null;
      block_name?: string | null;
      week_number?: number | null;
      completed_at?: string | null;
      status?: string | null;
      notes?: string | null;
      missed_detail?: string | null;
      rpe?: number | null;
      sets: LoggedSet[];
    }>;
    // Every note the athlete wrote, newest first (the RPC's order), apart
    // from the app's own [LOG] lines — see athleteNotes.ts.
    const athlete_notes = logs.flatMap((l) => {
      const note = athleteNoteFrom(l.notes, l.missed_detail);
      return note
        ? [{ week_number: l.week_number ?? null, block_name: l.block_name ?? null, completed_at: l.completed_at ?? null, status: l.status ?? null, note }]
        : [];
    });
    const blockIds = [...new Set(logs.map((l) => l.block_id).filter((id): id is string => !!id))];
    if (blockIds.length === 0) return { ...data, athlete_notes };

    const [{ data: blockExRows, error: beError }, { data: blockRows, error: bError }] = await Promise.all([
      userClient.from("block_exercises").select("block_id, sets, reps, hold_seconds, exercise_library(name)").in("block_id", blockIds),
      userClient.from("program_blocks").select("id, notes").in("id", blockIds),
    ]);
    if (beError) throw new Error(`get_workout_logs failed loading prescribed sets/reps: ${beError.message}`);
    if (bError) throw new Error(`get_workout_logs failed loading blocks: ${bError.message}`);

    const prescribedByKey = new Map<string, Prescribed>();
    for (const row of (blockExRows ?? []) as any[]) {
      const name: string | undefined = row.exercise_library?.name;
      if (!name) continue;
      prescribedByKey.set(`${row.block_id}::${name.toLowerCase()}`, { sets: row.sets, reps: row.reps, hold_seconds: row.hold_seconds });
    }
    const byResult = new Set(((blockRows ?? []) as Array<{ id: string; notes: string | null }>).filter((b) => judgedByBlockResult(b.notes)).map((b) => b.id));

    const annotatedLogs = logs.map((log) => {
      const byExercise = new Map<string, typeof log.sets>();
      for (const s of log.sets ?? []) {
        const key = (s.exercise_name ?? "").toLowerCase();
        if (!key) continue;
        if (!byExercise.has(key)) byExercise.set(key, []);
        byExercise.get(key)!.push(s);
      }
      const judgeByResult = !!log.block_id && byResult.has(log.block_id);
      const exercises_vs_prescribed = [...byExercise.entries()].map(([nameLower, sets]) => {
        const prescribed = log.block_id ? prescribedByKey.get(`${log.block_id}::${nameLower}`) : undefined;
        const row = compareToPrescription(sets, prescribed, log.rpe);
        return judgeByResult ? { ...row, under_prescribed: false, over_prescribed: false, rpe_mismatch: false } : row;
      });
      if (judgeByResult) {
        return { ...log, athlete_note: athleteNoteFrom(log.notes, log.missed_detail), judge_by_block_result: true, block_result: blockResultFrom(log.notes), exercises_vs_prescribed };
      }
      return { ...log, athlete_note: athleteNoteFrom(log.notes, log.missed_detail), exercises_vs_prescribed };
    });

    return { ...data, logs: annotatedLogs, athlete_notes };
  },
};
