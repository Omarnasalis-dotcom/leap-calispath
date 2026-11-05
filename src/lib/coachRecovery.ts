// Collecting an AI Coach answer after the connection drops mid-turn
// (supabase/migrations/20261104120000_ai_coach_results.sql). Found live
// 2026-11-04: a phone disconnected near the end of a 34s Day 1 build, the
// athlete saw "Something went wrong" and the finished card was lost. The
// server now keeps every answer for a day under an id the app makes up per
// message; CoachScreen asks for it with ai_coach_get_result when the stream
// fails or the app returns from the background mid-turn. Kept free of React
// and Supabase so it is testable from Jest.

// ai-coach stops starting new model turns at 100s and the platform cuts a
// function off at 150s, so nothing can still be coming after this.
export const RESULT_WAIT_MS = 170_000;
// The server saves a 'running' row before the turn starts. If none appears
// within this, the message never reached the server: stop waiting.
export const NO_ROW_GIVE_UP_MS = 15_000;
export const POLL_INTERVAL_MS = 3_000;
// A message left in flight when the app closed is collected on the next
// open only within this window (the server keeps it for a day).
export const RESUME_WINDOW_MS = 60 * 60 * 1000;

// RFC 4122 v4 shape. Not a secret: the server only ever returns a row to
// the user who made it.
export function newClientRequestId(random: () => number = Math.random): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  const variant = ((Math.floor(random() * 4) + 8)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

export type StoredRow = { status: 'running' | 'done' | 'failed'; payload: unknown } | null;

export type Recovery =
  | { kind: 'done'; payload: unknown }
  // The server says the turn failed, or it can no longer be running.
  | { kind: 'failed' }
  // No row ever seen: the message may never have reached the server.
  | { kind: 'unknown' }
  // Stopped waiting with no signal: the server may well have the answer, so
  // the caller keeps the in-flight marker and the next chat open collects it.
  | { kind: 'offline' };

export interface PollDeps {
  fetchRow: () => Promise<StoredRow>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  // True once the result no longer matters (chat cleared, screen closed).
  isCancelled?: () => boolean;
}

// Asks for the stored answer until it is done, failed, or can't arrive any
// more. Always asks at least once, so a message from a closed app is still
// collected long after its turn ended.
export async function pollForResult(startedAt: number, deps: PollDeps): Promise<Recovery> {
  const pollStart = deps.now();
  let seenRow = false;
  let lookupFailed = false;
  for (;;) {
    if (deps.isCancelled?.()) return { kind: 'unknown' };
    let row: StoredRow = null;
    try {
      row = await deps.fetchRow();
      lookupFailed = false;
    } catch {
      // Still offline: no answer from the server, so nothing can be concluded.
      lookupFailed = true;
    }
    if (row?.status === 'done') return { kind: 'done', payload: row.payload };
    if (row?.status === 'failed') return { kind: 'failed' };
    if (row) seenRow = true;
    const now = deps.now();
    if (now - startedAt >= RESULT_WAIT_MS) {
      if (lookupFailed) return { kind: 'offline' };
      return seenRow ? { kind: 'failed' } : { kind: 'unknown' };
    }
    if (!seenRow && now - pollStart >= NO_ROW_GIVE_UP_MS) return lookupFailed ? { kind: 'offline' } : { kind: 'unknown' };
    await deps.sleep(POLL_INTERVAL_MS);
  }
}

// An error the server answered (HTTP status, or the stream's own error
// event): the turn really failed, there is nothing to collect. A flag, not
// an Error subclass: instanceof on transpiled Error subclasses is unreliable.
export function coachServerError(message: string): Error {
  return Object.assign(new Error(message), { coachServerError: true });
}

export function isCoachServerError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { coachServerError?: unknown }).coachServerError === true;
}

export interface DeliverDeps<T> {
  call: () => Promise<T>;
  recover: () => Promise<Recovery>;
  toResult: (payload: unknown) => T;
  // Registers a callback for "the app came back from the background";
  // returns the unsubscribe.
  onWake: (wake: () => void) => () => void;
  onRecovering?: () => void;
}

// Runs the streamed call; the stored answer is the fallback. Whichever
// arrives first is used and the other is ignored, so an answer is never
// shown twice.
// - Stream answers: used as before.
// - Stream breaks (network): the stored answer is collected; the original
//   error is thrown only when there is none.
// - App returns from the background mid-turn: the stored answer is
//   collected alongside the stream, which may be stuck after iOS cut it.
export function deliverWithRecovery<T>(deps: DeliverDeps<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let recovering: Promise<Recovery> | null = null;
    let callFailed: unknown = null;
    let unsubscribe = () => {};
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      fn();
    };
    const useStored = (payload: unknown) => {
      let result: T;
      try {
        result = deps.toResult(payload);
      } catch (err) {
        return finish(() => reject(err));
      }
      finish(() => resolve(result));
    };
    const startRecovery = () => {
      if (!recovering) {
        deps.onRecovering?.();
        recovering = deps.recover().catch((): Recovery => ({ kind: 'unknown' }));
      }
      return recovering;
    };
    unsubscribe = deps.onWake(() => {
      if (settled) return;
      startRecovery().then((r) => {
        if (r.kind === 'done') return useStored(r.payload);
        if (r.kind === 'failed') return finish(() => reject(callFailed ?? new Error('Coach turn failed')));
        // unknown: keep waiting for the stream, and let a later wake ask again
        recovering = null;
        if (callFailed) finish(() => reject(callFailed));
      });
    });
    deps.call().then(
      (result) => finish(() => resolve(result)),
      (err) => {
        callFailed = err;
        if (isCoachServerError(err)) return finish(() => reject(err));
        startRecovery().then((r) => {
          if (r.kind === 'done') useStored(r.payload);
          else finish(() => reject(err));
        });
      },
    );
  });
}

export interface InflightMarker {
  id: string;
  startedAt: number;
  userMessage: string;
}

// When the chat opens with a message still marked in flight: how many
// trailing messages to drop before adding the collected answer (the error
// bubble shown in its place, if any), or null when the conversation has
// moved on or the marker is too old.
export function resumeTrim(
  marker: InflightMarker,
  messages: Array<{ role: string; content: string }>,
  errorText: string,
  now: number,
): number | null {
  if (now - marker.startedAt > RESUME_WINDOW_MS) return null;
  const last = messages[messages.length - 1];
  if (last?.role === 'user' && last.content === marker.userMessage) return 0;
  const prev = messages[messages.length - 2];
  if (last?.role === 'assistant' && last.content === errorText && prev?.role === 'user' && prev.content === marker.userMessage) return 1;
  return null;
}
