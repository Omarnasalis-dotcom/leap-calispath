import { ToolDefinition } from "./types.ts";
import { isUuid, parseConceptNotes } from "./blockHelpers.ts";
import { athleteNoteFrom } from "./athleteNotes.ts";

type LoggedSet = { exercise_name: string | null; reps_completed: number | null; hold_seconds?: number | null; weight_used?: number | null };
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
  const weights = sets.map((s) => s.weight_used ?? null);
  return {
    exercise_name: sets[0]?.exercise_name ?? null,
    sets_prescribed: setsPrescribed,
    sets_logged: sets.length,
    reps_prescribed: prescribed?.reps ?? null,
    reps_logged: repsLogged,
    ...(holdsLogged.length > 0 || prescribed?.hold_seconds != null
      ? { hold_prescribed: prescribed?.hold_seconds ?? null, holds_logged: holdsLogged }
      : {}),
    ...(weights.some((w) => (w ?? 0) > 0) ? { weights_logged: weights } : {}),
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

type RawLog = {
  block_id: string | null;
  block_name?: string | null;
  week_number?: number | null;
  completed_at?: string | null;
  status?: string | null;
  notes?: string | null;
  rating?: number | null;
  feel?: string | null;
  rpe?: number | null;
  missed_reason?: string | null;
  missed_detail?: string | null;
  session_seconds?: number | null;
  sets?: LoggedSet[];
};
type BlockExRow = { block_id: string; sets: number | null; reps: number | null; hold_seconds: number | null; exercise_library?: { name?: string | null } | null };

// The last few logged weeks go in full; older weeks as one line per
// exercise. A full result was ~120k chars (~30k tokens) at week 5 and grew
// ~24k a week, re-read on every call (owner's chat 2026-10-29: 4 calls).
// Three weeks covers the latest review, "same numbers 2+ weeks in a row"
// and the block names a week build reuses (system-prompt.ts §12, §19).
export const RECENT_WEEKS = 3;

const compact = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;

// What the tool hands the model, built from get_warrior_progress plus the
// blocks' prescriptions. Order matters: athlete_notes first, so they're
// read before 100+ set rows and survive the chat review's clipped copy
// (turnLog.ts keeps 6000 chars; they used to sit past char 114,000). The
// raw per-set rows are folded into exercises_vs_prescribed (reps, holds,
// kg per set), and ids and the raw notes column (= athlete_note +
// block_result) are left out: nothing the coach reads is lost.
export function shapeWorkoutLogs(
  data: { logs?: RawLog[]; [key: string]: unknown } | null,
  blockExRows: BlockExRow[],
  blockRows: Array<{ id: string; notes: string | null }>,
) {
  const logs = data?.logs ?? [];
  // Every note the athlete wrote, newest first (the RPC's order), apart
  // from the app's own [LOG] lines — see athleteNotes.ts.
  const athlete_notes = logs.flatMap((l) => {
    const note = athleteNoteFrom(l.notes, l.missed_detail);
    return note
      ? [{ week_number: l.week_number ?? null, block_name: l.block_name ?? null, completed_at: l.completed_at ?? null, status: l.status ?? null, note }]
      : [];
  });

  // Circuits and supersets write each exercise as 1 set and keep the round
  // count on the block, and the app logs one row per round: compare against
  // the rounds, or every finished circuit reads as extra sets (and one round
  // of three never reads as short).
  const roundsByBlock = new Map<string, number>();
  for (const b of blockRows) {
    const { metadata } = parseConceptNotes(b.notes);
    const rounds = Number(metadata.rounds);
    if ((metadata.structure === "circuit" || metadata.structure === "superset") && Number.isInteger(rounds) && rounds > 0) {
      roundsByBlock.set(b.id, rounds);
    }
  }
  const prescribedByKey = new Map<string, Prescribed>();
  for (const row of blockExRows) {
    const name = row.exercise_library?.name;
    if (!name) continue;
    prescribedByKey.set(`${row.block_id}::${name.toLowerCase()}`, { sets: roundsByBlock.get(row.block_id) ?? row.sets, reps: row.reps, hold_seconds: row.hold_seconds });
  }
  const byResult = new Set(blockRows.filter((b) => judgedByBlockResult(b.notes)).map((b) => b.id));

  const weeks = [...new Set(logs.map((l) => l.week_number).filter((w): w is number => typeof w === "number"))].sort((a, b) => b - a);
  const recent = new Set(weeks.slice(0, RECENT_WEEKS));

  const exercisesOf = (log: RawLog) => {
    const byExercise = new Map<string, LoggedSet[]>();
    for (const s of log.sets ?? []) {
      const key = (s.exercise_name ?? "").toLowerCase();
      if (!key) continue;
      if (!byExercise.has(key)) byExercise.set(key, []);
      byExercise.get(key)!.push(s);
    }
    const judgeByResult = !!log.block_id && byResult.has(log.block_id);
    const rows = [...byExercise.entries()].map(([nameLower, sets]) => {
      const prescribed = log.block_id ? prescribedByKey.get(`${log.block_id}::${nameLower}`) : undefined;
      const row = compareToPrescription(sets, prescribed, log.rpe);
      return judgeByResult ? { ...row, under_prescribed: false, over_prescribed: false, rpe_mismatch: false } : row;
    });
    return { judgeByResult, rows };
  };

  const recentLogs: Record<string, unknown>[] = [];
  const olderWeeks: Record<string, unknown>[] = [];
  for (const log of logs) {
    const { judgeByResult, rows } = exercisesOf(log);
    const athlete_note = athleteNoteFrom(log.notes, log.missed_detail);
    const block_result = blockResultFrom(log.notes);
    const base = {
      week_number: log.week_number,
      block_name: log.block_name,
      status: log.status,
      feel: log.feel,
      rpe: log.rpe,
      missed_reason: log.missed_reason,
      block_result: block_result.length > 0 ? block_result : null,
      judge_by_block_result: judgeByResult || null,
    };
    // A log whose block is gone has no week: kept in full, it's rare.
    if (typeof log.week_number !== "number" || recent.has(log.week_number)) {
      recentLogs.push(compact({
        ...base,
        completed_at: log.completed_at,
        rating: log.rating,
        session_seconds: log.session_seconds,
        missed_detail: log.missed_detail && log.missed_detail.trim() !== athlete_note ? log.missed_detail : null,
        athlete_note,
        exercises_vs_prescribed: rows,
      }));
    } else {
      // The note itself is in athlete_notes above.
      olderWeeks.push(compact({
        ...base,
        exercises: rows.map((r) => {
          const kg = (r.weights_logged ?? []).filter((w): w is number => (w ?? 0) > 0);
          return compact({
            exercise_name: r.exercise_name,
            sets_logged: r.sets_logged,
            best_reps: r.reps_logged.length > 0 ? Math.max(...r.reps_logged) : null,
            best_hold: r.holds_logged && r.holds_logged.length > 0 ? Math.max(...r.holds_logged) : null,
            top_kg: kg.length > 0 ? Math.max(...kg) : null,
            under_prescribed: r.under_prescribed || null,
            over_prescribed: r.over_prescribed || null,
          });
        }),
      }));
    }
  }

  const { logs: _logs, ...rest } = data ?? {};
  return {
    athlete_notes,
    recent_weeks: [...recent].sort((a, b) => a - b),
    logs: recentLogs,
    ...(olderWeeks.length > 0 ? { older_weeks: olderWeeks } : {}),
    ...rest,
  };
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
    "Get the athlete's actual logged performance (sets/reps/weight/hold completed, RPE, feel, pain notes, bodyweight trend) for their active program, block by block, week by week. athlete_notes (first) lists every note the athlete wrote, all weeks, in their own words, apart from the app's [LOG] lines. The last 3 logged weeks (recent_weeks) come in full in logs, each with its athlete_note and block_result; older weeks come as one short line per exercise in older_weeks (sets, best reps/hold, top kg, RPE, feel, missed reason). Each logged exercise in logs carries `under_prescribed`, `over_prescribed` and `rpe_mismatch`, computed against what the block actually prescribes (reps or hold seconds), so a session marked 'completed' with fewer sets or lower reps than written is never mistaken for full completion. Ladder/AMRAP/For Time/Tabata logs carry `judge_by_block_result: true` and `block_result` (time, rounds, rungs) instead. Use this before reviewing a week or deciding on an adjustment — never guess at their performance.",
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

    const logs = (data?.logs ?? []) as RawLog[];
    const blockIds = [...new Set(logs.map((l) => l.block_id).filter((id): id is string => !!id))];
    if (blockIds.length === 0) return shapeWorkoutLogs(data, [], []);

    const [{ data: blockExRows, error: beError }, { data: blockRows, error: bError }] = await Promise.all([
      userClient.from("block_exercises").select("block_id, sets, reps, hold_seconds, exercise_library(name)").in("block_id", blockIds),
      userClient.from("program_blocks").select("id, notes").in("id", blockIds),
    ]);
    if (beError) throw new Error(`get_workout_logs failed loading prescribed sets/reps: ${beError.message}`);
    if (bError) throw new Error(`get_workout_logs failed loading blocks: ${bError.message}`);

    return shapeWorkoutLogs(data, (blockExRows ?? []) as BlockExRow[], (blockRows ?? []) as Array<{ id: string; notes: string | null }>);
  },
};
