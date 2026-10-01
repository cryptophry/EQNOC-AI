import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatSession } from '../services/ai';

// Simulates a corporate proxy that buffers text/event-stream: the response
// "succeeds" but no byte ever reaches the client until it's cancelled.
function hangingSseResponse() {
  const stream = new ReadableStream({
    start() { /* deliberately never enqueue */ },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

describe('stream fallback when a proxy buffers SSE', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('falls back to a non-streamed request and still yields the answer', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (body.stream) return hangingSseResponse();
      return jsonResponse({
        sources: [{ title: 'Aviat Eclipse Manual', label: 'p.39', kind: 'manual', text: '-40.5 to -60 Vdc' }],
        choices: [{ message: { content: 'Eclipse runs -40.5 to -60 Vdc.' } }],
      });
    }));

    const session = createChatSession();
    const chunks: any[] = [];
    const run = (async () => {
      for await (const c of session.sendMessageStream({ message: 'voltage range?' })) chunks.push(c);
    })();

    // Nothing has arrived; push past the first-byte deadline.
    await vi.advanceTimersByTimeAsync(13_000);
    await run;

    // It retried without streaming...
    expect(calls.length).toBe(2);
    expect(calls[0].stream).toBe(true);
    expect(calls[1].stream).toBe(false);
    // ...and the tech still got sources + the answer.
    expect(chunks.some(c => Array.isArray(c.sources))).toBe(true);
    expect(chunks.map(c => c.text || '').join('')).toContain('-40.5 to -60 Vdc');
  });

  it('does NOT fall back when the stream delivers normally', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(': stream-open\n\n'));
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return { ok: true, status: 200, body: stream } as unknown as Response;
    }));

    const session = createChatSession();
    const chunks: any[] = [];
    for await (const c of session.sendMessageStream({ message: 'hi' })) chunks.push(c);

    expect(calls.length).toBe(1);           // no retry
    expect(calls[0].stream).toBe(true);
    expect(chunks.map(c => c.text || '').join('')).toBe('Hello');
  });
});
