// The API returns at most 1,000 rows per request (Supabase "Max rows"), with
// no error when there are more. A list that can grow past that (templates,
// athletes' programs, the exercises of a long program) must page through,
// or it silently misses rows, and a builder save then deletes the rows it
// never loaded.

const PAGE = 1000;
// ids per `.in()` filter: keeps the request URL well under proxy limits
// (a UUID is 36 characters).
const IN_CHUNK = 150;

// `data` is untyped on purpose: this client has no generated DB types, so its
// inferred row shapes (e.g. embedded joins as arrays) never match ours. The
// caller states the row type it selected.
type PageResult = PromiseLike<{ data: any[] | null; error: { message: string } | null }>;

/** Runs `page(from, to)` until a page comes back short. The query must have a
 * stable, unique order (e.g. `.order('id')` last) so pages don't overlap. */
export async function fetchAllRows<T>(page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** Splits `ids` into chunks for `.in()` and concatenates every chunk's rows
 * (each chunk itself paged by fetchAllRows). */
export async function fetchByIds<T>(
  ids: string[],
  page: (chunk: string[], from: number, to: number) => PageResult,
): Promise<T[]> {
  const unique = Array.from(new Set(ids));
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    rows.push(...(await fetchAllRows<T>((from, to) => page(chunk, from, to))));
  }
  return rows;
}
