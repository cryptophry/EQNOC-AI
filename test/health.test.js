import { describe, expect, it, vi } from 'vitest';
import handler from '../api/health.js';

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; },
  };
}

describe('GET /api/health', () => {
  it('returns ok without calling anything else', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects other methods', async () => {
    const res = mockRes();
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });
});
