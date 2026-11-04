import { createEventSink, finalRow, parseClientRequestId } from "../resultRecovery";

describe("parseClientRequestId", () => {
  it("accepts a uuid and lowercases it", () => {
    expect(parseClientRequestId("3F6C0FBA-6B21-49F8-8FCB-4F0E98115CB4")).toBe("3f6c0fba-6b21-49f8-8fcb-4f0e98115cb4");
  });

  it("ignores a missing id (older app builds)", () => {
    expect(parseClientRequestId(undefined)).toBeNull();
    expect(parseClientRequestId(null)).toBeNull();
  });

  it("ignores anything that is not a uuid", () => {
    expect(parseClientRequestId("")).toBeNull();
    expect(parseClientRequestId("abc")).toBeNull();
    expect(parseClientRequestId(42)).toBeNull();
    expect(parseClientRequestId("3f6c0fba-6b21-49f8-8fcb-4f0e98115cb4; drop table")).toBeNull();
  });
});

describe("createEventSink", () => {
  it("writes SSE events while the phone is connected", () => {
    const written: string[] = [];
    const sink = createEventSink((text) => written.push(text));
    expect(sink.write("stage", { verb: "BUILDING" })).toBe(true);
    expect(sink.write("final", { reply: "Day 1 is ready" })).toBe(true);
    expect(written).toEqual([
      'event: stage\ndata: {"verb":"BUILDING"}\n\n',
      'event: final\ndata: {"reply":"Day 1 is ready"}\n\n',
    ]);
    expect(sink.isOpen).toBe(true);
  });

  it("drops writes once the stream throws, instead of ending the run", () => {
    let calls = 0;
    const sink = createEventSink(() => {
      calls++;
      throw new TypeError("The stream controller cannot close or enqueue");
    });
    expect(() => sink.write("stage", {})).not.toThrow();
    expect(sink.isOpen).toBe(false);
    expect(sink.write("final", { reply: "x" })).toBe(false);
    expect(calls).toBe(1);
  });

  it("drops writes after the stream is cancelled", () => {
    const written: string[] = [];
    const sink = createEventSink((text) => written.push(text));
    sink.close();
    expect(sink.write("final", { reply: "x" })).toBe(false);
    expect(written).toEqual([]);
  });

  it("still throws on a payload that can't be serialized (a real bug, not a disconnect)", () => {
    const sink = createEventSink(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => sink.write("final", circular)).toThrow();
    expect(sink.isOpen).toBe(true);
  });
});

describe("finalRow", () => {
  it("stores the final event as sent", () => {
    const payload = { reply: "Day 1 is ready", programAction: { type: "create" } };
    expect(finalRow(payload)).toEqual({ status: "done", payload });
  });

  it("marks a turn that ended without a final event as failed", () => {
    expect(finalRow(null)).toEqual({ status: "failed", payload: null });
  });
});
