/**
 * Turns a Supabase/Postgrest error into user-facing copy, distinguishing a
 * stale/anon-fallback auth token (see NativeStorageAdapter in supabase.ts)
 * and a request timeout from a genuine failure, so it's diagnosable from a
 * bug report without needing device logs.
 */
export function describeSubmitError(error: any, fallback: string): string {
  if (error?.name === 'AbortError') {
    return 'Network request timed out. Please check your connection and try again.';
  }

  if (isTransientNetworkError(error)) {
    return 'Network request failed. Please check your connection and try again.';
  }

  const code = error?.code;
  const message = String(error?.message || '').toLowerCase();
  const isStaleAuth =
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    code === '42501' ||
    message.includes('jwt') ||
    message.includes('json web token');

  if (isStaleAuth) {
    return 'Your session needs a moment to refresh. Please try again.';
  }

  return error?.message || fallback;
}

/**
 * True for a raw transport-level failure (RN's fetch/XHR polyfill throws a
 * plain TypeError with no HTTP response at all) as opposed to an aborted
 * request or a server-side rejection. This is the well-known RN behavior
 * where the first request after a period of socket inactivity fails outright
 * and an immediate retry succeeds — not a real connectivity problem.
 */
function isTransientNetworkError(error: any): boolean {
  if (!error || error.name === 'AbortError') return false;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('network request failed') || message.includes('network error');
}

/**
 * Retries a submission (up to 3 more times, with backoff) if it fails on a
 * transient transport-level error (see isTransientNetworkError) before
 * surfacing it to the user. Sized for a real-world dead spot — spotty gym
 * Wi-Fi/cellular during a workout — rather than just the single-flake "first
 * request after idle" case: 4 attempts total, ~5.5s of added wait in the
 * worst case before giving up. Safe to use here because every submission
 * call site this wraps is guarded server-side by an upsert, a cooldown, or a
 * "only if improved" check, so re-sending an identical payload after a
 * connection that never reached the server is not destructive.
 *
 * Logs each attempt (dev-only) so a run that still fails after exhausting
 * retries is diagnosable from device logs — how many attempts actually
 * fired and how far apart — instead of a single ambiguous final error.
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
  attempt = 1
): Promise<T> {
  try {
    const result = await fn();
    if (__DEV__ && attempt > 1) {
      console.log(`[withNetworkRetry] succeeded on attempt ${attempt}`);
    }
    return result;
  } catch (error: any) {
    if (retries > 0 && isTransientNetworkError(error)) {
      if (__DEV__) {
        console.log(`[withNetworkRetry] attempt ${attempt} failed (${error?.message}), retrying in ${delayMs}ms — ${retries} left`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return withNetworkRetry(fn, retries - 1, delayMs * 2, attempt + 1);
    }
    if (__DEV__ && attempt > 1) {
      console.log(`[withNetworkRetry] gave up after ${attempt} attempts`);
    }
    throw error;
  }
}
