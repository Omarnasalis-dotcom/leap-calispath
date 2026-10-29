import { lastUserText, traceTool } from "../turnLog";

describe("traceTool", () => {
  it("keeps a successful call's input and result", () => {
    const t = traceTool("get_workout_logs", { warrior_program_id: "abc" }, 120, { result: { logs: [] } });
    expect(t).toEqual({
      name: "get_workout_logs",
      input: '{"warrior_program_id":"abc"}',
      ok: true,
      error: null,
      result: '{"logs":[]}',
      ms: 120,
    });
  });

  it("keeps a failed call's error and no result", () => {
    const t = traceTool("propose_add_day", {}, 40, { error: "Unknown exercise: Ring Rows" });
    expect(t.ok).toBe(false);
    expect(t.error).toBe("Unknown exercise: Ring Rows");
    expect(t.result).toBeNull();
  });

  it("cuts a very large result and says how much was cut", () => {
    const t = traceTool("get_program_structure", {}, 10, { result: { blob: "x".repeat(10_000) } });
    expect(t.result!.length).toBeLessThan(6100);
    expect(t.result).toMatch(/… \[\d+ more chars\]$/);
  });
});

describe("lastUserText", () => {
  it("returns the newest user message", () => {
    expect(
      lastUserText([
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "review my week" },
      ]),
    ).toBe("review my week");
  });

  it("joins text blocks and ignores the rest", () => {
    expect(
      lastUserText([{ role: "user", content: [{ type: "text", text: "hi" }, { type: "image" }, { type: "text", text: "coach" }] }]),
    ).toBe("hi\ncoach");
  });

  it("returns null with no user message", () => {
    expect(lastUserText([{ role: "assistant", content: "hello" }])).toBeNull();
  });
});
