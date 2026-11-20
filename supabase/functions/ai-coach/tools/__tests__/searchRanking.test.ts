// search_exercises returns "contains" matches in no set order, and batch
// mode keeps only 3, so the exact name could be cut. Found live 2026-11-16:
// "Front Lever Hold" came back as Banded / Single Leg / Straddle.
import { rankByName, searchExercises } from "../searchExercises";

const FRONT_LEVER = [
  "Banded front lever hold", "Single Leg Front lever Hold", "Straddle Front Lever Hold", "Front Lever Hold",
  "Tuck Front Lever Hold", "Adance tuck Front Lever Hold", "Half Lay Front Lever Hold",
].map((name, i) => ({ id: `fl-${i}`, name }));

// Real database order from the 2026-11-16 trace: exact name 4th.
function fakeClient(rows: Array<{ id: string; name: string }>) {
  return {
    from: () => {
      let out = rows.slice();
      let max = Infinity;
      const q: any = {
        select: () => q,
        ilike: (_c: string, p: string) => {
          const term = p.replace(/%/g, "").toLowerCase();
          out = out.filter((r) => r.name.toLowerCase().includes(term));
          return q;
        },
        eq: () => q,
        limit: (n: number) => { max = n; return q; },
        then: (ok: (v: unknown) => void) => ok({ data: out.slice(0, max), error: null }),
      };
      return q;
    },
  } as any;
}

describe("rankByName", () => {
  it("puts the exact name first, whatever the case", () => {
    expect(rankByName(FRONT_LEVER, "front lever hold")[0].name).toBe("Front Lever Hold");
  });

  it("then names starting with the term, then whole words, shortest first", () => {
    const rows = [{ name: "Negative Muscle Up" }, { name: "Muscle Up band-assisted" }, { name: "1 Pull Up 1 Muscle Up" }, { name: "Muscle Ups Ladder" }, { name: "Muscle Up" }];
    expect(rankByName(rows, "Muscle Up").map((r) => r.name)).toEqual([
      "Muscle Up", "Muscle Ups Ladder", "Muscle Up band-assisted", "Negative Muscle Up", "1 Pull Up 1 Muscle Up",
    ]);
  });

  it("keeps the original order when nothing tells rows apart", () => {
    const rows = [{ name: "Ring Row A" }, { name: "Ring Row B" }];
    expect(rankByName(rows, "zzz").map((r) => r.name)).toEqual(["Ring Row A", "Ring Row B"]);
  });
});

describe("search_exercises keeps the exact name", () => {
  it("batch mode: the exact name is in the 3, first", async () => {
    const res: any = await searchExercises.handler(fakeClient(FRONT_LEVER), { queries: ["Front Lever Hold"] });
    expect(res.results[0].matches).toHaveLength(3);
    expect(res.results[0].matches[0]).toEqual({ id: "fl-3", name: "Front Lever Hold" });
    expect(res.results[0]).not.toHaveProperty("approximate");
  });

  it("single mode: the exact name comes first", async () => {
    const res: any = await searchExercises.handler(fakeClient(FRONT_LEVER), { query: "Front Lever Hold" });
    expect(res.matches[0].name).toBe("Front Lever Hold");
    expect(res.matches).toHaveLength(7);
  });
});
