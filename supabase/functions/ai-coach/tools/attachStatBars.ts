import { ToolDefinition } from "./types.ts";

// Design handoff (assets/design_handoff_leap_coach_chat) rich block "a)
// stat bars". Same principle as propose_*/buildProgramAction: the model
// signals intent, the server resolves the real numbers — never trusting a
// model-supplied score for something the database already knows. Reads
// statics_tier/power_points/one_mm_points fresh via get_my_profile (the
// same SECURITY DEFINER RPC get_user_context already uses for its own
// self-access read), not anything the model passed in.
export const attachStatBars: ToolDefinition = {
  name: "attach_stat_bars",
  description:
    "Attach a visual comparison of the athlete's three discipline scores (Static, Power, 1MM) under your reply. Call this when discussing their overall discipline balance or which one is lagging — never describe these numbers in prose instead, attach the block. Values are read fresh from their real profile, you never supply them yourself.",
  input_schema: {
    type: "object",
    properties: {
      emphasize: {
        type: "string",
        enum: ["static", "power", "one_min_max"],
        description: "Optional — which row to visually highlight, usually the weakest one you're discussing.",
      },
    },
  },
  handler: async (userClient, input) => {
    const { data: profile, error } = await userClient.rpc("get_my_profile").single();
    if (error || !profile) throw new Error("Could not read profile for stat bars.");

    const p = profile as { statics_tier?: number | null; power_points?: number | null; one_mm_points?: number | null };
    const rows = [
      { key: "static", label: "STATIC", value: Number(p.statics_tier ?? 0), color: "#8b5cf6" },
      { key: "power", label: "POWER", value: Number(p.power_points ?? 0), color: "#FC5454" },
      { key: "one_min_max", label: "1MM", value: Number(p.one_mm_points ?? 0), color: "#f97316" },
    ];
    // No absolute scale exists for these three scores in this app today —
    // rather than invent an arbitrary max, the bars are relative to the
    // highest of the three shown, same as any honest comparison chart.
    const max = Math.max(...rows.map((r) => r.value), 1);
    const emphasize = typeof input.emphasize === "string" ? input.emphasize : null;

    return {
      type: "stat_bars",
      max,
      rows: rows.map((r) => ({ ...r, emphasize: r.key === emphasize })),
    };
  },
};
