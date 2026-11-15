// Matches exercise names from an imported file against the exercise library.
// Pure (no database), so it is unit-tested directly.
// Verbatim mirror of src/lib/exerciseNameMatch.ts — keep in sync manually.

export interface LibraryExerciseName {
  id: string;
  name: string;
  /** Demo video, so the coach can check a suggestion before picking it. */
  youtube_url?: string | null;
}

// Lower case, punctuation as spaces, single spaces, and a plural "s" dropped
// from each word: "High Pull Ups" and "high  pull-up" both become
// "high pull up". "ss" endings stay ("press").
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length >= 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/** The library row an imported name means without asking the coach: the same
 * name ignoring case and outer spaces first, then the same normalized name
 * (spacing, punctuation, plural "s"). Null when only a guess would match. */
export function findLibraryMatch(
  name: string,
  library: LibraryExerciseName[]
): LibraryExerciseName | null {
  const exact = name.trim().toLowerCase();
  const byExact = library.find((row) => row.name.trim().toLowerCase() === exact);
  if (byExact) return byExact;
  const norm = normalizeExerciseName(name);
  if (!norm) return null;
  return library.find((row) => normalizeExerciseName(row.name) === norm) ?? null;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// 1 for the same word, less for a near spelling ("childe"/"child",
// "bridg"/"bridge"), 0 otherwise.
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const shorter = Math.min(a.length, b.length);
  const d = editDistance(a, b);
  if ((d <= 1 && shorter >= 4) || (d <= 2 && shorter >= 7)) return 0.8;
  if (shorter >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.7;
  return 0;
}

/** Library names close to an imported name the library does not have, best
 * first, for the coach to pick from. Scores word by word so a missing or extra
 * word ("Incline DB Press" / "Incline DB Bench Press") and a small typo
 * ("Child Pose" / "Childe Pose") both qualify. */
export function suggestLibraryExercises(
  name: string,
  library: LibraryExerciseName[],
  limit = 3
): LibraryExerciseName[] {
  const words = normalizeExerciseName(name).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<{ row: LibraryExerciseName; score: number; lengthGap: number }> = [];
  for (const row of library) {
    const rowWords = normalizeExerciseName(row.name).split(' ').filter(Boolean);
    if (rowWords.length === 0) continue;
    let total = 0;
    for (const w of words) {
      let best = 0;
      for (const rw of rowWords) best = Math.max(best, wordSimilarity(w, rw));
      total += best;
    }
    const score = total / Math.max(words.length, rowWords.length);
    if (score >= 0.5) scored.push({ row, score, lengthGap: Math.abs(rowWords.length - words.length) });
  }
  scored.sort((a, b) => b.score - a.score || a.lengthGap - b.lengthGap || a.row.name.localeCompare(b.row.name));
  const seen = new Set<string>();
  const out: LibraryExerciseName[] = [];
  for (const { row } of scored) {
    // Two library rows with the same name (prod has two "Deadlift"s) would be
    // two identical buttons; show the name once.
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
