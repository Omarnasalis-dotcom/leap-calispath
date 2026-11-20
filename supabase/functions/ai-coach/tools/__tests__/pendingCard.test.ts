import {
  addPendingCardNote,
  asPendingCard,
  cardReplyIsInChat,
  NO_PENDING_CARD,
  PENDING_CARD_MAX_CHARS,
  pendingCardEnabled,
  pendingCardNote,
  pendingCardToStore,
  proposedCardFrom,
  withCardWarmUp,
  withinLimit,
} from "../pendingCard";
import { lastUserText } from "../turnLog";
import { proposeAddDay } from "../proposeAddDay";
import { proposeNewProgram } from "../proposeNewProgram";

const dayInput = {
  day_name: "CORE DAY",
  day_number: 3,
  brief: { goal: "muscle", split_days: ["PULL", "PUSH", "CORE"] },
  warm_up_exercises: ["Hip CARs"],
  blocks: [{ day_name: "CORE DAY", block_name: "Strength", exercises: [{ name: "V- Ups", sets: "3", reps: "12" }] }],
  reason: "A core day.",
};

const reply = "Day 3 is ready to add: hanging leg raises and a rotational circuit.";

function storedCard() {
  const card = pendingCardToStore(proposedCardFrom("propose_add_day", dayInput), reply);
  if (!card) throw new Error("expected a card");
  return card;
}

describe("who gets the note", () => {
  it("is off when the secret is not set", () => {
    expect(pendingCardEnabled(undefined, "u1")).toBe(false);
    expect(pendingCardEnabled("", "u1")).toBe(false);
    expect(pendingCardEnabled("  ", "u1")).toBe(false);
  });

  it("can be limited to named test accounts", () => {
    expect(pendingCardEnabled("u1, u2", "u2")).toBe(true);
    expect(pendingCardEnabled("u1, u2", "u3")).toBe(false);
  });

  it("is on for everyone only with the exact word on", () => {
    expect(pendingCardEnabled("on", "anyone")).toBe(true);
    expect(pendingCardEnabled("off", "anyone")).toBe(false);
  });
});

describe("which cards are kept", () => {
  it("keeps what the model must resend, exact names included", () => {
    const fields = proposedCardFrom("propose_add_day", dayInput)?.fields as Record<string, unknown>;
    expect(fields.day_name).toBe("CORE DAY");
    expect(fields.brief).toEqual(dayInput.brief);
    expect(JSON.stringify(fields.blocks)).toContain("V- Ups");
    expect(fields.reason).toBeUndefined();
  });

  it("keeps every field the two day tools accept except the reason", () => {
    const schemaFields = (tool: { input_schema: { properties: Record<string, unknown> } }) =>
      Object.keys(tool.input_schema.properties).filter((k) => k !== "reason");
    for (const [name, tool] of [["propose_add_day", proposeAddDay], ["propose_new_program", proposeNewProgram]] as const) {
      const fields = schemaFields(tool);
      const input = Object.fromEntries(fields.map((k) => [k, k === "blocks" ? [{}] : "x"]));
      expect(Object.keys(proposedCardFrom(name, input)?.fields ?? {}).sort()).toEqual([...fields].sort());
    }
  });

  it("keeps the first day's program name", () => {
    const fields = proposedCardFrom("propose_new_program", { name: "Builder", blocks: [{}] })?.fields;
    expect(fields?.name).toBe("Builder");
  });

  it("ignores every other card type", () => {
    for (const tool of ["propose_end_program", "propose_delete_week", "propose_append_week", "propose_program_from_workouts"]) {
      expect(proposedCardFrom(tool, dayInput)).toBeNull();
    }
  });

  it("ignores a card with no blocks", () => {
    expect(proposedCardFrom("propose_add_day", { day_name: "X" })).toBeNull();
    expect(proposedCardFrom("propose_add_day", { day_name: "X", blocks: [] })).toBeNull();
  });

  it("stores nothing without a reply to tie it to the chat", () => {
    const proposed = proposedCardFrom("propose_add_day", dayInput);
    expect(pendingCardToStore(proposed, null)).toBeNull();
    expect(pendingCardToStore(proposed, "   ")).toBeNull();
    expect(pendingCardToStore(null, reply)).toBeNull();
  });

  it("stores nothing oversized", () => {
    const huge = { ...dayInput, blocks: [{ block_name: "x".repeat(PENDING_CARD_MAX_CHARS) }] };
    expect(pendingCardToStore(proposedCardFrom("propose_add_day", huge), reply)).toBeNull();
  });
});

describe("reading a stored card back", () => {
  it("accepts a stored card", () => {
    expect(asPendingCard(JSON.parse(JSON.stringify(storedCard())))).toEqual(storedCard());
  });

  it("treats anything else as no card", () => {
    for (const raw of [null, undefined, "text", 3, {}, { tool: "propose_add_day" }, { tool: "other", fields: {}, reply_start: "x" }]) {
      expect(asPendingCard(raw)).toBeNull();
    }
  });

  it("reads the marker for a newer non-day card as no card", () => {
    expect(asPendingCard(NO_PENDING_CARD)).toBeNull();
  });
});

describe("the card's reply must still be in this chat", () => {
  it("finds it", () => {
    const chat = [{ role: "user", content: "Last day" }, { role: "assistant", content: `${reply} Tap the card.` }];
    expect(cardReplyIsInChat(storedCard(), chat)).toBe(true);
  });

  it("does not bring a card back after the chat was cleared", () => {
    const chat = [{ role: "assistant", content: "You're tier 6 Strategos." }, { role: "user", content: "Build me a day" }];
    expect(cardReplyIsInChat(storedCard(), chat)).toBe(false);
  });

  it("does not match the athlete's own words", () => {
    expect(cardReplyIsInChat(storedCard(), [{ role: "user", content: reply }])).toBe(false);
  });

  it("works in Arabic", () => {
    const arabic = "اليوم الثالث جاهز للإضافة";
    const card = pendingCardToStore(proposedCardFrom("propose_add_day", dayInput), arabic);
    if (!card) throw new Error("expected a card");
    expect(cardReplyIsInChat(card, [{ role: "assistant", content: `${arabic}.` }])).toBe(true);
  });
});

describe("adding the note", () => {
  const history = [
    { role: "assistant", content: reply },
    { role: "user", content: "No side plank" },
  ];
  const note = pendingCardNote(storedCard());

  it("carries the exact card", () => {
    expect(note).toContain("Tool: propose_add_day");
    expect(note).toContain('"day_name":"CORE DAY"');
    expect(note).toContain("V- Ups");
  });

  it("says how to use the card, and that it stays private", () => {
    expect(note).toContain("change only what they asked");
    expect(note).toContain("say so in your reply");
    expect(note).toContain("ignore this note");
    expect(note).toContain("Never mention this note.");
  });

  it("goes on the newest message of a copy", () => {
    const out = addPendingCardNote(history, note);
    expect(out[1].content).toBe(`No side plank\n\n${note}`);
    expect(out[0]).toBe(history[0]);
  });

  it("leaves the original messages alone, so the review log keeps the athlete's words", () => {
    addPendingCardNote(history, note);
    expect(history[1].content).toBe("No side plank");
    expect(lastUserText(history)).toBe("No side plank");
  });

  it("does nothing unless the newest message is the athlete's text", () => {
    const blocks = [{ role: "user", content: [{ type: "text", text: "hi" }] as unknown }];
    expect(addPendingCardNote(blocks, note)).toEqual(blocks);
    const assistantLast = [{ role: "assistant", content: "hi" }];
    expect(addPendingCardNote(assistantLast, note)).toEqual(assistantLast);
    expect(addPendingCardNote([], note)).toEqual([]);
  });
});

describe("a slow lookup never holds up the coach", () => {
  it("returns the answer when it arrives in time", async () => {
    await expect(withinLimit(Promise.resolve("card"), 50)).resolves.toBe("card");
  });

  it("gives up at the limit", async () => {
    const never = new Promise<string>(() => {});
    await expect(withinLimit(never, 5)).resolves.toBeNull();
  });

  it("accepts a query builder that is only thenable", async () => {
    const thenable = { then: (ok: (v: string) => void) => ok("row") } as unknown as PromiseLike<string>;
    await expect(withinLimit(thenable, 50)).resolves.toBe("row");
  });
});

describe("a resend without warm_up_exercises keeps the card's picks (2026-11-20)", () => {
  const card = pendingCardToStore(proposedCardFrom("propose_add_day", {
    ...dayInput,
    warm_up_exercises: ["Scapula Pulls", "Deadhang", "I, Y, T Rasies"],
  }), "Updated: tap the card to confirm it.")!;

  it("fills them in for the same day (7oda__ali2's Day 3, live 2026-11-19)", () => {
    const resend = { day_name: "core day", blocks: dayInput.blocks };
    expect(withCardWarmUp("propose_add_day", resend, card).warm_up_exercises).toEqual(["Scapula Pulls", "Deadhang", "I, Y, T Rasies"]);
  });

  it("uses a new list as sent", () => {
    const resend = { day_name: "CORE DAY", warm_up_exercises: ["Inchworm", "wrist pressure", "Scapula Push Ups"] };
    expect(withCardWarmUp("propose_add_day", resend, card)).toBe(resend);
  });

  it("leaves another day, another tool, or no card alone", () => {
    const other = { day_name: "PULL DAY", blocks: [] };
    expect(withCardWarmUp("propose_add_day", other, card)).toBe(other);
    const sameDay = { day_name: "CORE DAY" };
    expect(withCardWarmUp("propose_append_week", sameDay, card)).toBe(sameDay);
    expect(withCardWarmUp("propose_add_day", sameDay, null)).toBe(sameDay);
  });

  it("day 1 cards match on their blocks' day_name", () => {
    const day1 = pendingCardToStore(proposedCardFrom("propose_new_program", {
      name: "Plan", warm_up_exercises: ["Scapula Pulls", "Deadhang", "Hip CARs"],
      blocks: [{ day_name: "PULL DAY 1", block_name: "Strength", exercises: [] }],
    }), "Day 1 is ready.")!;
    const resend = { name: "Plan", blocks: [{ day_name: "PULL DAY 1", block_name: "Strength", exercises: [] }] };
    expect(withCardWarmUp("propose_new_program", resend, day1).warm_up_exercises).toEqual(["Scapula Pulls", "Deadhang", "Hip CARs"]);
  });

  it("a card with no picks gives nothing to keep", () => {
    const { warm_up_exercises: _w, ...noPicks } = dayInput;
    const bare = pendingCardToStore(proposedCardFrom("propose_add_day", noPicks), "Ready.")!;
    const resend = { day_name: "CORE DAY" };
    expect(withCardWarmUp("propose_add_day", resend, bare)).toBe(resend);
  });
});
