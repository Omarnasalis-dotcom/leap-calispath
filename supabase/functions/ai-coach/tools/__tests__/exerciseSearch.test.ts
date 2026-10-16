// Jest coverage for the word-match fallback used by search_exercises and by
// resolveExerciseIds' "did you mean" suggestions (audit 2026-10-16: "dumbbell
// biceps curl" was reported as not in the library, and the suggestion was
// "Burpees Over Dumbbell"). The fake client below runs the same
// select/ilike/in/limit chain against real library names.
import { findByWords, findNearestByWords, resolveExerciseIds, searchWords } from "../blockHelpers";

const LIBRARY = [
  "Banded Biceps Curl", "Biceps Curl", "Burpees Over Dumbbell", "DB Bench Press", "DB Lateral Raise",
  "Hammer Curls", "Incline DB Bench Press", "Leg curl", "Ring Curls", "Pull Ups (Normal Grip)",
  "Scapula Pulls", "Barbell Hip Thrusts", "Toes To KB",
  "Muscle Up", "Negative Muscle Up", "Muscle Up band-assisted", "Banded Pull Ups",
].map((name, i) => ({ id: `id-${i}`, name }));

function likeToRegex(pattern: string): RegExp {
  const body = pattern.split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}$`, "i");
}

function fakeClient() {
  return {
    from: () => {
      let rows = LIBRARY.slice();
      let max = Infinity;
      const q: any = {
        select: () => q,
        ilike: (_col: string, pattern: string) => { rows = rows.filter((r) => likeToRegex(pattern).test(r.name)); return q; },
        in: (_col: string, names: string[]) => { rows = rows.filter((r) => names.includes(r.name)); return q; },
        limit: (n: number) => { max = n; return q; },
        then: (resolve: (v: unknown) => void) => resolve({ data: rows.slice(0, max), error: null }),
      };
      return q;
    },
  };
}

describe("searchWords", () => {
  it("drops equipment and load words and plural s", () => {
    expect(searchWords("Heavy Dumbbell Biceps Curls")).toEqual(["bicep", "curl"]);
    expect(searchWords("DB bench press")).toEqual(["bench", "pres"]);
  });
  it("is empty when only ignored words are given", () => {
    expect(searchWords("dumbbell")).toEqual([]);
  });
  it("ignores punctuation in library-style names", () => {
    expect(searchWords("Pull Ups (Normal Grip)")).toEqual(["pull", "ups", "normal", "grip"]);
  });
});

describe("findByWords", () => {
  it("finds Biceps Curl for a dumbbell biceps curl request", async () => {
    const rows = await findByWords(fakeClient(), searchWords("Dumbbell Biceps Curl"), "id, name", 3);
    expect(rows.map((r) => r.name)).toEqual(["Banded Biceps Curl", "Biceps Curl"]);
  });
  it("finds every curl for 'dumbbell curls'", async () => {
    const rows = await findByWords(fakeClient(), searchWords("dumbbell curls"), "id, name", 10);
    expect(rows.map((r) => r.name)).toEqual(["Banded Biceps Curl", "Biceps Curl", "Hammer Curls", "Leg curl", "Ring Curls"]);
  });
  it("finds DB Bench Press for 'dumbbell bench press'", async () => {
    const rows = await findByWords(fakeClient(), searchWords("dumbbell bench press"), "id, name", 3);
    expect(rows.map((r) => r.name)).toEqual(["DB Bench Press", "Incline DB Bench Press"]);
  });
  it("returns nothing for no words", async () => {
    expect(await findByWords(fakeClient(), [], "id, name", 3)).toEqual([]);
  });
});

describe("resolveExerciseIds suggestions", () => {
  const block = (name: string) => [{ day_name: "PULL DAY", block_name: "Accessories", exercises: [{ name }] }] as never[];

  it("still resolves exact names, case-insensitively", async () => {
    const ids = await resolveExerciseIds(fakeClient(), block("biceps curl"));
    expect(ids.get("biceps curl")).toBe("id-1");
  });

  it("suggests Biceps Curl, not Burpees Over Dumbbell, for an unknown dumbbell curl", async () => {
    await expect(resolveExerciseIds(fakeClient(), block("Dumbbell Biceps Curl"))).rejects.toThrow(
      /"Dumbbell Biceps Curl" — did you mean: Banded Biceps Curl, Biceps Curl\?/
    );
  });

  it("keeps the old longest-word suggestion when no words match", async () => {
    await expect(resolveExerciseIds(fakeClient(), block("Dumbbell Snatch"))).rejects.toThrow(/did you mean: Burpees Over Dumbbell\?/);
  });

  it("keeps the same not-in-library message", async () => {
    await expect(resolveExerciseIds(fakeClient(), block("Zzz Nothing"))).rejects.toThrow(
      /These exercises are not in the library, so the program was not built: "Zzz Nothing" — no close match/
    );
  });
});

// 2026-10-16: the coach wrote a muscle-up name the library didn't have, and
// "every word must match" found nothing to suggest.
describe("muscle-up band-assisted and one-word-off names", () => {
  it("reads banded as band", () => {
    expect(searchWords("Banded Muscle Up")).toEqual(["band", "muscle", "up"]);
  });

  it("finds Muscle Up band-assisted for 'Banded Muscle Up'", async () => {
    const rows = await findNearestByWords(fakeClient(), searchWords("Banded Muscle Up"), "id, name", 3);
    expect(rows.map((r) => r.name)).toEqual(["Muscle Up band-assisted"]);
  });

  it("lets one word miss when nothing matches every word", async () => {
    const rows = await findNearestByWords(fakeClient(), searchWords("Muscle Up band assisted easy"), "id, name", 3);
    expect(rows.map((r) => r.name)).toEqual(["Muscle Up band-assisted"]);
  });

  it("still prefers a match on every word", async () => {
    const rows = await findNearestByWords(fakeClient(), searchWords("dumbbell biceps curl"), "id, name", 3);
    expect(rows.map((r) => r.name)).toEqual(["Banded Biceps Curl", "Biceps Curl"]);
  });

  it("the not-in-library message suggests the band-assisted muscle-up", async () => {
    const block = [{ day_name: "PULL DAY", block_name: "Skills", exercises: [{ name: "Banded Muscle Up" }] }] as never[];
    await expect(resolveExerciseIds(fakeClient(), block)).rejects.toThrow(/did you mean: Muscle Up band-assisted\?/);
  });

  it("resolves the real name exactly", async () => {
    const block = [{ day_name: "PULL DAY", block_name: "Skills", exercises: [{ name: "Muscle Up band-assisted" }] }] as never[];
    const ids = await resolveExerciseIds(fakeClient(), block);
    expect(ids.get("muscle up band-assisted")).toBeDefined();
  });
});
