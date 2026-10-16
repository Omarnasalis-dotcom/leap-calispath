// The system prompt is one template literal: a raw backtick inside it ends
// the string, and the deployed function then fails to start (caught by
// deno check on 2026-10-16, missed by Jest because nothing imported it).
// Loading it here makes that a test failure, plus a few markers that must
// survive any rewording.
import { SYSTEM_PROMPT } from "../../system-prompt";

describe("system prompt", () => {
  it("loads as one complete string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(50_000);
    expect(SYSTEM_PROMPT.trimEnd().endsWith("The best program is the one the athlete actually completes.")).toBe(true);
  });

  it("names library exercises the server can resolve", () => {
    expect(SYSTEM_PROMPT).toContain("`Muscle Up band-assisted`");
    expect(SYSTEM_PROMPT).not.toContain('There is no "Banded Muscle Up" entry');
  });
});
