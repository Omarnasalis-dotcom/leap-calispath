import {
  coachServerError,
  deliverWithRecovery,
  isCoachServerError,
  newClientRequestId,
  pollForResult,
  Recovery,
  RESULT_WAIT_MS,
  RESUME_WINDOW_MS,
  resumeTrim,
  StoredRow,
} from '../coachRecovery';

const flush = () => new Promise((r) => setImmediate(r));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A fake clock: sleep() advances it, so polling runs instantly.
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, advance: (ms: number) => { t += ms; } };
}

describe('newClientRequestId', () => {
  it('makes a v4 uuid the server accepts', () => {
    const id = newClientRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('makes a different id each time', () => {
    expect(newClientRequestId()).not.toBe(newClientRequestId());
  });
});

describe('pollForResult', () => {
  it('returns the stored answer once the turn is done', async () => {
    const c = clock();
    const rows: StoredRow[] = [{ status: 'running', payload: null }, { status: 'running', payload: null }, { status: 'done', payload: { reply: 'Day 1' } }];
    const r = await pollForResult(c.now(), { fetchRow: async () => rows.shift() ?? null, sleep: c.sleep, now: c.now });
    expect(r).toEqual({ kind: 'done', payload: { reply: 'Day 1' } });
  });

  it('stops at once when the server says the turn failed', async () => {
    const c = clock();
    const fetchRow = jest.fn(async (): Promise<StoredRow> => ({ status: 'failed', payload: null }));
    expect(await pollForResult(c.now(), { fetchRow, sleep: c.sleep, now: c.now })).toEqual({ kind: 'failed' });
    expect(fetchRow).toHaveBeenCalledTimes(1);
  });

  it('gives up quickly when no row ever appears (message never reached the server)', async () => {
    const c = clock();
    const start = c.now();
    const r = await pollForResult(start, { fetchRow: async () => null, sleep: c.sleep, now: c.now });
    expect(r).toEqual({ kind: 'unknown' });
    expect(c.now() - start).toBeLessThan(20_000);
  });

  it('stops waiting quickly while offline, but says so: the answer may be on the server', async () => {
    const c = clock();
    const start = c.now();
    const r = await pollForResult(start, { fetchRow: async () => { throw new Error('Network request failed'); }, sleep: c.sleep, now: c.now });
    expect(r).toEqual({ kind: 'offline' });
    expect(c.now() - start).toBeLessThan(20_000);
  });

  it('reports no row, not offline, when the signal came back and the server has nothing', async () => {
    const c = clock();
    let calls = 0;
    const fetchRow = async (): Promise<StoredRow> => { calls += 1; if (calls < 3) throw new Error('offline'); return null; };
    expect(await pollForResult(c.now(), { fetchRow, sleep: c.sleep, now: c.now })).toEqual({ kind: 'unknown' });
  });

  it('does not call a turn failed when the signal is gone at the time limit', async () => {
    const c = clock();
    const start = c.now();
    const rows: StoredRow[] = [{ status: 'running', payload: null }];
    const fetchRow = async (): Promise<StoredRow> => { if (rows.length) return rows.shift()!; throw new Error('offline'); };
    expect(await pollForResult(start, { fetchRow, sleep: c.sleep, now: c.now })).toEqual({ kind: 'offline' });
    expect(c.now() - start).toBeGreaterThanOrEqual(RESULT_WAIT_MS);
  });

  it('stays offline, after one ask, when reopened long after with still no signal', async () => {
    const c = clock();
    const fetchRow = jest.fn(async (): Promise<StoredRow> => { throw new Error('offline'); });
    expect(await pollForResult(c.now() - 30 * 60 * 1000, { fetchRow, sleep: c.sleep, now: c.now })).toEqual({ kind: 'offline' });
    expect(fetchRow).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting while the server is still building, then gives up after the platform limit', async () => {
    const c = clock();
    const start = c.now();
    const r = await pollForResult(start, { fetchRow: async () => ({ status: 'running', payload: null }), sleep: c.sleep, now: c.now });
    expect(r).toEqual({ kind: 'failed' });
    expect(c.now() - start).toBeGreaterThanOrEqual(RESULT_WAIT_MS);
  });

  it('rides out a dropped lookup once the row has been seen', async () => {
    const c = clock();
    const rows: Array<StoredRow | Error> = [{ status: 'running', payload: null }, new Error('offline'), { status: 'done', payload: 'x' }];
    const fetchRow = async () => { const next = rows.shift(); if (next instanceof Error) throw next; return next ?? null; };
    expect(await pollForResult(c.now(), { fetchRow, sleep: c.sleep, now: c.now })).toEqual({ kind: 'done', payload: 'x' });
  });

  it('still asks once for a message from long ago (app was closed)', async () => {
    const c = clock();
    const startedAt = c.now() - 30 * 60 * 1000;
    const fetchRow = jest.fn(async (): Promise<StoredRow> => ({ status: 'done', payload: 'late' }));
    expect(await pollForResult(startedAt, { fetchRow, sleep: c.sleep, now: c.now })).toEqual({ kind: 'done', payload: 'late' });
  });

  it('stops when the result no longer matters', async () => {
    const c = clock();
    const fetchRow = jest.fn(async (): Promise<StoredRow> => ({ status: 'running', payload: null }));
    expect(await pollForResult(c.now(), { fetchRow, sleep: c.sleep, now: c.now, isCancelled: () => true })).toEqual({ kind: 'unknown' });
    expect(fetchRow).not.toHaveBeenCalled();
  });
});

describe('deliverWithRecovery', () => {
  function setup(opts: { recover?: () => Promise<Recovery> } = {}) {
    const call = deferred<string>();
    let wake: () => void = () => {};
    const unsubscribe = jest.fn();
    const recover = jest.fn(opts.recover ?? (async (): Promise<Recovery> => ({ kind: 'done', payload: 'stored' })));
    const onRecovering = jest.fn();
    const p = deliverWithRecovery<string>({
      call: () => call.promise,
      recover,
      toResult: (payload) => `from-store:${String(payload)}`,
      onWake: (w) => { wake = w; return unsubscribe; },
      onRecovering,
    });
    return { call, wake: () => wake(), recover, unsubscribe, onRecovering, p };
  }

  it('uses the streamed answer when nothing goes wrong, without asking the store', async () => {
    const s = setup();
    s.call.resolve('streamed');
    await expect(s.p).resolves.toBe('streamed');
    expect(s.recover).not.toHaveBeenCalled();
    expect(s.unsubscribe).toHaveBeenCalled();
  });

  it('collects the stored answer when the stream breaks', async () => {
    const s = setup();
    s.call.reject(new Error('Network request failed'));
    await expect(s.p).resolves.toBe('from-store:stored');
    expect(s.onRecovering).toHaveBeenCalledTimes(1);
  });

  it('throws the original error when the stream breaks and nothing was stored', async () => {
    const s = setup({ recover: async () => ({ kind: 'unknown' }) });
    const err = new Error('Network request failed');
    s.call.reject(err);
    await expect(s.p).rejects.toBe(err);
  });

  it('shows the original error when the lookups ran out offline', async () => {
    const s = setup({ recover: async () => ({ kind: 'offline' }) });
    const err = new Error('Network request failed');
    s.call.reject(err);
    await expect(s.p).rejects.toBe(err);
  });

  it('keeps waiting for the stream when a wake finds no signal', async () => {
    const s = setup({ recover: async () => ({ kind: 'offline' }) });
    s.wake();
    await flush();
    s.call.resolve('streamed');
    await expect(s.p).resolves.toBe('streamed');
  });

  it('does not wait on the store for an error the server itself answered', async () => {
    const s = setup();
    const err = coachServerError('500');
    s.call.reject(err);
    await expect(s.p).rejects.toBe(err);
    expect(s.recover).not.toHaveBeenCalled();
  });

  it('collects the stored answer on return from the background while the stream is stuck', async () => {
    const s = setup();
    s.wake();
    await expect(s.p).resolves.toBe('from-store:stored');
    // The stream finishing later changes nothing.
    s.call.resolve('streamed-late');
    await flush();
  });

  it('keeps the streamed answer if it wins the race after a wake', async () => {
    const stored = deferred<Recovery>();
    const s = setup({ recover: () => stored.promise });
    s.wake();
    s.call.resolve('streamed');
    await expect(s.p).resolves.toBe('streamed');
    stored.resolve({ kind: 'done', payload: 'stored' });
    await flush();
  });

  it('keeps waiting for the stream when the store has nothing on wake', async () => {
    const s = setup({ recover: async () => ({ kind: 'unknown' }) });
    s.wake();
    await flush();
    s.call.resolve('streamed');
    await expect(s.p).resolves.toBe('streamed');
  });

  it('asks again on a later wake after the store had nothing', async () => {
    const results: Recovery[] = [{ kind: 'unknown' }, { kind: 'done', payload: 'second' }];
    const s = setup({ recover: async () => results.shift()! });
    s.wake();
    await flush();
    s.wake();
    await expect(s.p).resolves.toBe('from-store:second');
    expect(s.recover).toHaveBeenCalledTimes(2);
  });

  it('ends with an error on wake when the server says the turn failed', async () => {
    const s = setup({ recover: async () => ({ kind: 'failed' }) });
    s.wake();
    await expect(s.p).rejects.toThrow('Coach turn failed');
  });

  it('only asks the store once when a wake and a broken stream overlap', async () => {
    const stored = deferred<Recovery>();
    const s = setup({ recover: () => stored.promise });
    s.wake();
    s.call.reject(new Error('Network request failed'));
    await flush();
    stored.resolve({ kind: 'done', payload: 'once' });
    await expect(s.p).resolves.toBe('from-store:once');
    expect(s.recover).toHaveBeenCalledTimes(1);
  });

  it('turns a malformed stored answer into an error instead of hanging', async () => {
    const call = deferred<string>();
    const p = deliverWithRecovery<string>({
      call: () => call.promise,
      recover: async () => ({ kind: 'done', payload: null }),
      toResult: () => { throw new Error('bad payload'); },
      onWake: () => () => {},
    });
    call.reject(new Error('Network request failed'));
    await expect(p).rejects.toThrow('bad payload');
  });

  it('treats a lookup that throws as nothing stored', async () => {
    const s = setup({ recover: async () => { throw new Error('rpc down'); } });
    const err = new Error('Network request failed');
    s.call.reject(err);
    await expect(s.p).rejects.toBe(err);
  });
});

describe('isCoachServerError', () => {
  it('tells server-answered errors from network errors', () => {
    expect(isCoachServerError(coachServerError('x'))).toBe(true);
    expect(isCoachServerError(new Error('Network request failed'))).toBe(false);
    expect(isCoachServerError(null)).toBe(false);
  });
});

describe('resumeTrim', () => {
  const marker = { id: 'a', startedAt: 1_000, userMessage: 'Let’s try it' };
  const ERR = 'Something went wrong reaching your coach. Try again in a moment.';

  it('adds the answer after the waiting message (app closed mid-turn)', () => {
    expect(resumeTrim(marker, [{ role: 'assistant', content: 'Day 1?' }, { role: 'user', content: 'Let’s try it' }], ERR, 2_000)).toBe(0);
  });

  it('replaces the error bubble shown in its place', () => {
    expect(resumeTrim(marker, [{ role: 'user', content: 'Let’s try it' }, { role: 'assistant', content: ERR }], ERR, 2_000)).toBe(1);
  });

  it('leaves a conversation that moved on alone', () => {
    expect(resumeTrim(marker, [{ role: 'user', content: 'Let’s try it' }, { role: 'assistant', content: 'Here you go' }], ERR, 2_000)).toBeNull();
    expect(resumeTrim(marker, [{ role: 'user', content: 'something else' }], ERR, 2_000)).toBeNull();
    expect(resumeTrim(marker, [], ERR, 2_000)).toBeNull();
  });

  it('ignores a marker older than the resume window', () => {
    expect(resumeTrim(marker, [{ role: 'user', content: 'Let’s try it' }], ERR, 1_000 + RESUME_WINDOW_MS + 1)).toBeNull();
  });
});
