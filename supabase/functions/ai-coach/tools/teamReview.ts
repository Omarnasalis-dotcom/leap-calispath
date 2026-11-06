// The Leap team can review a week the AI Coach built (20261106190000), editing
// exercises directly. Their edits sit in the program, so get_program_structure
// already shows them; this tells the model that they were made on purpose. It
// only appears for athletes who have a review, so every other chat is
// unchanged. Facts only: the model still decides what to say.

export interface ProgramReviewRow {
  week_number: number;
  status: string;
  outcome: string | null;
  reverted_at: string | null;
  revert_skipped?: number | null;
  changes?: Array<{
    kind?: string | null;
    block_name?: string | null;
    exercise_before?: string | null;
    exercise_after?: string | null;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string | null;
  }>;
}

const FIELDS = ["sets", "reps", "hold_seconds", "rest_seconds"] as const;

function describe(change: NonNullable<ProgramReviewRow["changes"]>[number]): string {
  const before = change.before ?? {};
  const after = change.after ?? {};
  if (change.kind && change.kind !== "exercise") {
    const settings = Object.keys(after)
      .filter((key) => String(before[key] ?? "") !== String(after[key] ?? ""))
      .map((key) => `${key} ${before[key] ?? "none"} -> ${after[key] ?? "none"}`);
    return `${change.block_name}: ${settings.join(", ")}`;
  }
  const parts = FIELDS
    .filter((f) => before[f] !== after[f])
    .map((f) => `${f} ${before[f] ?? "none"} -> ${after[f] ?? "none"}`);
  if (change.exercise_before !== change.exercise_after) {
    parts.unshift(`swapped to ${change.exercise_after}`);
  }
  if (before.notes !== after.notes) parts.push("notes changed");
  return `${change.exercise_before}: ${parts.join(", ") || "updated"}`;
}

export function teamReviewFact(reviews: ProgramReviewRow[] | null | undefined): { week_number: number; state: string; note: string } | null {
  const latest = reviews?.[0];
  if (!latest) return null;
  const week = latest.week_number;

  if (latest.status === "open") {
    return {
      week_number: week,
      state: "in_review",
      note: `The athlete asked the Leap team to review week ${week}. They usually answer within 48 hours. Keep coaching as normal.`,
    };
  }
  if (latest.outcome === "accurate") {
    return { week_number: week, state: "no_changes", note: `The Leap team reviewed week ${week} and changed nothing.` };
  }
  if (latest.reverted_at) {
    return {
      week_number: week,
      state: "reverted",
      note: `The Leap team changed week ${week}, and the athlete chose to go back to the original.${latest.revert_skipped ? ` ${latest.revert_skipped} change(s) stayed, as those blocks were already logged or had changed since.` : ""} Respect that choice.`,
    };
  }
  const changes = (latest.changes ?? []).map(describe).join("; ");
  return {
    week_number: week,
    state: "changed",
    note: `The Leap team edited week ${week} on purpose: ${changes}. get_program_structure shows the current plan, which replaces anything earlier in this chat. Build on it, and only undo it if the athlete asks.`,
  };
}
