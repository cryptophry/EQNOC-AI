import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { HANDLER_DEADLINE_MS, MAX_TOOL_ROUNDS, toolRoundCount } from '../api/ai.js';
import { signToken } from '../lib/auth.js';
import { UPSTASH_QUERY_TIMEOUT_MS, resetVectorCircuit } from '../lib/vectorStore.js';

const SECRET = 'test-secret';

function mockRes() {
  const writes = [];
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    writes,
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    json(obj) { this.body = obj; this.ended = true; },
    write(data) { writes.push(String(data)); return true; },
    end(data) {
      if (data != null && data !== '') writes.push(String(data));
      this.ended = true;
    },
  };
}

let ip = 10;
function authedReq(body) {
  ip += 1;
  return {
    method: 'POST',
    body,
    headers: {
      authorization: `Bearer ${signToken(SECRET)}`,
      'x-forwarded-for': `203.0.113.${ip}`,
    },
    socket: {},
    on() {},
    off() {},
  };
}

function emptyVector() {
  return { ok: true, status: 200, text: async () => JSON.stringify({ result: [] }) };
}

function modelJson(content = 'answer') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  };
}

function sseResponse(payload) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream, text: async () => '', json: async () => payload };
}

function toolHistory(rounds) {
  const messages = [];
  for (let i = 0; i < rounds; i++) {
    messages.push({ role: 'user', content: `question ${i}` });
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: `c${i}`,
        type: 'function',
        function: { name: 'set_alarm', arguments: '{"message":"check","type":"RELATIVE_MINUTES","timeValue":"5"}' },
      }],
    });
    messages.push({ role: 'tool', tool_call_id: `c${i}`, content: 'ok' });
  }
  messages.push({ role: 'user', content: 'what next?' });
  return messages;
}

describe('POST /api/ai bounds retrieval and the request', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    process.env.OPENROUTER_API_KEY = 'sk-test';
    process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.example';
    process.env.UPSTASH_VECTOR_REST_TOKEN = 'test-token';
    delete process.env.OPENROUTER_MODEL;
    resetVectorCircuit();
    vi.useRealTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    resetVectorCircuit();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counts assistant tool-call rounds', () => {
    expect(toolRoundCount(toolHistory(0).slice(0, 1))).toBe(0);
    expect(toolRoundCount(toolHistory(MAX_TOOL_ROUNDS))).toBe(MAX_TOOL_ROUNDS);
  });

  it('writes the stream keep-alive before any Upstash or model call', async () => {
    const order = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn((url) => {
      order.push(`fetch:${url}`);
      if (String(url).includes('vector.example')) {
        return gate.then(() => emptyVector());
      }
      return Promise.resolve(sseResponse({ choices: [{ delta: { content: 'Hi' } }] }));
    }));

    const res = mockRes();
    const write = res.write.bind(res);
    res.write = (data) => {
      order.push(`write:${String(data)}`);
      return write(data);
    };

    const done = handler(authedReq({
      messages: [{ role: 'user', content: 'voltage?' }],
      stream: true,
      useKnowledgeBase: true,
    }), res);

    const openAt = order.findIndex((e) => e.includes('stream-open'));
    const vectorAt = order.findIndex((e) => e.startsWith('fetch:') && e.includes('vector.example'));
    expect(openAt).toBeGreaterThanOrEqual(0);
    expect(vectorAt).toBeGreaterThan(openAt);
    expect(order.some((e) => e.includes('openrouter.ai'))).toBe(false);

    release();
    await done;
    expect(order.some((e) => e.includes('openrouter.ai'))).toBe(true);
    expect(res.writes.join('')).toContain('Hi');
    const line = console.log.mock.calls.map((c) => c[0]).find((l) => String(l).startsWith('[ai]'));
    expect(line).toMatch(/retrieval=\d+ms empty ttft=\d+ms toolRound=0 total=\d+ms/);
  });

  it('answers without knowledge-base results when Upstash times out', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url, init) => {
      if (String(url).includes('vector.example')) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return Promise.resolve(modelJson('from the model'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = mockRes();
    const done = handler(authedReq({
      messages: [{ role: 'user', content: 'voltage?' }],
      stream: false,
      useKnowledgeBase: true,
    }), res);
    await vi.advanceTimersByTimeAsync(UPSTASH_QUERY_TIMEOUT_MS);
    await done;

    expect(res.statusCode).toBe(200);
    expect(res.body.choices[0].message.content).toBe('from the model');
    expect(res.body.sources).toBeUndefined();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('openrouter.ai'))).toBe(true);
    const line = console.log.mock.calls.map((c) => c[0]).find((l) => String(l).startsWith('[ai]'));
    expect(line).toMatch(/retrieval=\d+ms timeout ttft=\d+ms toolRound=0 total=\d+ms/);
  });

  it('does not call Upstash on the next turn while the circuit is open', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('vector.example')) {
        return { ok: false, status: 503, text: async () => 'vector store backend is currently unavailable' };
      }
      return modelJson('still answered');
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = mockRes();
    await handler(authedReq({
      messages: [{ role: 'user', content: 'first?' }],
      stream: false,
      useKnowledgeBase: true,
    }), first);
    expect(first.body.choices[0].message.content).toBe('still answered');
    const upstashAfterFirst = fetchMock.mock.calls.filter((c) => String(c[0]).includes('vector.example')).length;
    expect(upstashAfterFirst).toBeGreaterThan(0);

    const second = mockRes();
    await handler(authedReq({
      messages: [{ role: 'user', content: 'second?' }],
      stream: false,
      useKnowledgeBase: true,
    }), second);
    expect(second.body.choices[0].message.content).toBe('still answered');
    const upstashAfterSecond = fetchMock.mock.calls.filter((c) => String(c[0]).includes('vector.example')).length;
    expect(upstashAfterSecond).toBe(upstashAfterFirst);
    const line = console.log.mock.calls.map((c) => c[0]).find((l) => String(l).includes('skipped'));
    expect(line).toMatch(/retrieval=\d+ms skipped/);
  });

  it('stops offering tools after the round cap', async () => {
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).includes('openrouter.ai')) bodies.push(JSON.parse(init.body));
      return modelJson('ok');
    }));

    await handler(authedReq({
      messages: toolHistory(MAX_TOOL_ROUNDS - 1),
      stream: false,
      useKnowledgeBase: true,
    }), mockRes());
    expect(bodies[0].tools?.length).toBeGreaterThan(0);

    await handler(authedReq({
      messages: toolHistory(MAX_TOOL_ROUNDS),
      stream: false,
      useKnowledgeBase: true,
    }), mockRes());
    expect(bodies[1].tools).toBeUndefined();
    const line = console.log.mock.calls.map((c) => c[0]).find((l) => String(l).includes('capped'));
    expect(line).toMatch(new RegExp(`toolRound=${MAX_TOOL_ROUNDS} capped`));
  });

  it('aborts the upstream call at the handler deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      if (String(url).includes('vector.example')) return Promise.resolve(emptyVector());
      return new Promise((_resolve, reject) => {
        const fail = () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (init?.signal?.aborted) fail();
        else init?.signal?.addEventListener('abort', fail, { once: true });
      });
    }));

    const res = mockRes();
    const done = handler(authedReq({
      messages: [{ role: 'user', content: 'hang?' }],
      stream: false,
      useKnowledgeBase: true,
    }), res);
    await vi.advanceTimersByTimeAsync(HANDLER_DEADLINE_MS);
    await done;

    expect(res.statusCode).toBe(504);
    expect(res.body.error).toMatch(/deadline/i);
    const line = console.log.mock.calls.map((c) => c[0]).find((l) => String(l).startsWith('[ai]'));
    expect(line).toMatch(/ttft=none/);
    expect(line).toMatch(/total=\d+ms/);
  });
});
