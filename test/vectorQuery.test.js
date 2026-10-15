import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UPSTASH_CIRCUIT_MS,
  UPSTASH_QUERY_TIMEOUT_MS,
  getManuals,
  queryChunks,
  rangeChunks,
  resetVectorCircuit,
  upsertChunks,
  vectorCircuitOpen,
} from '../lib/vectorStore.js';

function okJson(obj) {
  return { ok: true, status: 200, text: async () => JSON.stringify(obj) };
}

describe('Upstash query timeout and circuit breaker', () => {
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

  it('aborts a hung query at the timeout and opens the circuit', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      const fail = () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (init?.signal?.aborted) fail();
      else init?.signal?.addEventListener('abort', fail, { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = queryChunks('site voltage', 4);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(UPSTASH_QUERY_TIMEOUT_MS);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(vectorCircuitOpen()).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('timeout'))).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('test-token'))).toBe(false);

    fetchMock.mockClear();
    await expect(queryChunks('again')).rejects.toMatchObject({ code: 'circuit' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes the circuit after the cooldown and allows another query', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })));

    const pending = queryChunks('first');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(UPSTASH_QUERY_TIMEOUT_MS);
    await assertion;

    await vi.advanceTimersByTimeAsync(UPSTASH_CIRCUIT_MS - 1);
    expect(vectorCircuitOpen()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(vectorCircuitOpen()).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => okJson({ result: [{ id: 'a', data: 'text', score: 0.9 }] })));
    await expect(queryChunks('later')).resolves.toEqual([{ id: 'a', data: 'text', score: 0.9 }]);
  });

  it('opens the circuit on HTTP 5xx and on network errors, not on 4xx', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'unavailable' }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(queryChunks('x')).rejects.toMatchObject({ status: 503, code: 'http' });
    expect(vectorCircuitOpen()).toBe(true);
    fetchMock.mockClear();
    await expect(rangeChunks('manual#', '', 10)).rejects.toMatchObject({ code: 'circuit' });
    expect(fetchMock).not.toHaveBeenCalled();

    resetVectorCircuit();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(queryChunks('y')).rejects.toMatchObject({ code: 'network' });
    expect(vectorCircuitOpen()).toBe(true);

    resetVectorCircuit();
    const badRequest = vi.fn(async () => ({ ok: false, status: 400, text: async () => 'bad query' }));
    vi.stubGlobal('fetch', badRequest);
    await expect(queryChunks('z')).rejects.toMatchObject({ status: 400 });
    expect(vectorCircuitOpen()).toBe(false);
    await expect(queryChunks('z2')).rejects.toMatchObject({ status: 400 });
    expect(badRequest).toHaveBeenCalledTimes(2);
  });

  it('times out manuals/photos range reads the same way', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })));

    const pending = rangeChunks('photo#', '', 24);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(UPSTASH_QUERY_TIMEOUT_MS);
    await assertion;
    expect(vectorCircuitOpen()).toBe(true);
  });

  it('does not apply the short timeout to upserts', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((resolve) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; });
      setTimeout(() => resolve(okJson({})), 4_000);
    })));

    const pending = upsertChunks([{ id: 'a', data: 'a chunk of manual text' }]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(aborted).toBe(false);
    expect(vectorCircuitOpen()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({});
  });

  it('fails a manuals listing fast when Upstash returns 503', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getManuals()).resolves.toEqual([]);
    expect(vectorCircuitOpen()).toBe(true);
    expect(fetchMock.mock.calls.length).toBeLessThan(5);
  });
});
