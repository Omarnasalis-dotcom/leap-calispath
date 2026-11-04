import { programSource } from "../getUserContext";

describe("programSource", () => {
  it("tells AI Coach, library and human-coach programs apart", () => {
    expect(programSource("00000000-0000-0000-0000-000000000002")).toBe("ai_coach");
    expect(programSource("00000000-0000-0000-0000-000000000001")).toBe("library");
    expect(programSource("c0ffee00-1111-4222-8333-444455556666")).toBe("coach");
  });
});
