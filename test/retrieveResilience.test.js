import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveLibraryContext } from '../lib/retrieve.js';
import { UPSTASH_QUERY_TIMEOUT_MS, resetVectorCircuit, vectorCircuitOpen } from '../lib/vectorStore.js';

describe('library retrieval fails open', () => {
  beforeEach(() => {
    process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.example';
    process.env.UPSTASH_VECTOR_REST_TOKEN = 'test-token';
    resetVectorCircuit();
    vi.useRealTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    resetVectorCircuit();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('still returns excerpts when Upstash answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      const body = u.includes('/query-data')
        ? {
            result: [{
              id: 'm1#1',
              data: 'Nominal voltage is -48 Vdc.',
              score: 0.91,
              metadata: { manualId: 'm1', title: 'Rectifier manual', page: 4 },
            }],
          }
        : { result: u.includes('/range') ? { vectors: [], nextCursor: '' } : [] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }));

    const ctx = await retrieveLibraryContext('User Query: what is the nominal voltage?');
    expect(ctx.status).toBe('ok');
    expect(ctx.prompt).toContain('-48 Vdc');
    expect(ctx.sources[0].title).toBe('Rectifier manual');
  });

  it('returns no excerpts when a query times out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })));

    const pending = retrieveLibraryContext('User Query: what is the nominal voltage?');
    await vi.advanceTimersByTimeAsync(UPSTASH_QUERY_TIMEOUT_MS);
    const ctx = await pending;
    expect(ctx.prompt).toBeUndefined();
    expect(ctx.status).toBe('timeout');
    expect(vectorCircuitOpen()).toBe(true);
  });

  it('skips Upstash while the circuit is open', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'unavailable' }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await retrieveLibraryContext('User Query: site alarm?');
    expect(first.status).toBe('error');
    expect(first.prompt).toBeUndefined();
    const callsAfterFailure = fetchMock.mock.calls.length;
    expect(callsAfterFailure).toBeGreaterThan(0);

    const second = await retrieveLibraryContext('User Query: site alarm again?');
    expect(second).toEqual({ status: 'skipped' });
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFailure);
  });
});
