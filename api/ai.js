// Vercel serverless function: proxies AI calls to OpenRouter.
// The OpenRouter API key lives ONLY here (server-side env var), never in the browser.
//
// Trust boundary:
//   - Requires a valid session (HttpOnly cookie, or legacy Bearer token)
//   - Ignores client model / tools; both are fixed server-side
//   - Strips client system messages; injects the knowledge base itself
//   - Always sets max_tokens; only accepts data: image URLs
//   - Aborts the upstream request on the handler deadline or client disconnect
//   - Best-effort per-IP rate limiting
//   - Library retrieval is best-effort and never blocks the answer

import { verifyToken, signingSecret, tokenFromRequest, rateLimit, clientIp, bodyByteLength } from '../lib/auth.js';
import { EQNOC_KNOWLEDGE_BASE } from '../lib/knowledgeBase.js';
import { vectorConfigured } from '../lib/vectorStore.js';
import { retrieveLibraryContext } from '../lib/retrieve.js';
import { CHAT_TOOLS } from '../lib/chatTools.js';
import { sanitizeMessages } from '../lib/sanitizeMessages.js';

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content.filter((p) => p?.type === 'text').map((p) => p.text).join(' ');
    }
  }
  return '';
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'x-ai/grok-4.6';
const DEFAULT_VISION_MODEL = 'x-ai/grok-4.6';

function hasImageContent(messages) {
  return Array.isArray(messages) && messages.some(
    (m) => Array.isArray(m?.content) && m.content.some((p) => p?.type === 'image_url')
  );
}

function referer() {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return prod.startsWith('http') ? prod : `https://${prod}`;
  const url = process.env.VERCEL_URL;
  if (url) return `https://${url}`;
  return 'https://eqnoc-ai.vercel.app';
}

const MAX_OUTPUT_TOKENS = 8000;
const DEFAULT_OUTPUT_TOKENS = 4000;
const MAX_MESSAGES = 100;
const MAX_BODY_BYTES = 6 * 1024 * 1024;

// Whole POST, including retrieval and the model stream. Stays under the
// platform maxDuration so a stuck upstream cannot run out the 300s kill.
export const HANDLER_DEADLINE_MS = 60_000;
export const MAX_TOOL_ROUNDS = 4;

// vercel.json sets the same ceiling. Exported here so the route config is
// visible next to the deadline that must finish first.
export const maxDuration = 90;
export const config = { maxDuration: 90 };

export function toolRoundCount(messages) {
  let n = 0;
  for (const m of messages || []) {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) n += 1;
  }
  return n;
}

function sawModelToken(text) {
  return /"content"\s*:\s*"(?:\\.|[^"\\])+"/.test(text)
    || /"arguments"\s*:\s*"(?:\\.|[^"\\])+"/.test(text);
}

function asText(value) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return Buffer.from(value).toString('utf8');
  return String(value);
}

export default async function handler(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const textModel = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const visionModel = process.env.OPENROUTER_VISION_MODEL || DEFAULT_VISION_MODEL;

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      configured: !!apiKey,
      authRequired: true,
      rag: vectorConfigured(),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!apiKey) {
    res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured on the server' });
    return;
  }

  const token = tokenFromRequest(req);
  if (!verifyToken(signingSecret(), token)) {
    res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
    return;
  }

  const ip = clientIp(req);
  const rl = rateLimit(`ai:${ip}`, { windowMs: 60_000, max: 60 });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Slow down and try again shortly.' });
    return;
  }

  let raw = req.body;
  if (bodyByteLength(raw) > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Request too large' });
    return;
  }
  let body = raw;
  if (typeof raw === 'string') {
    try { body = JSON.parse(raw); } catch { body = null; }
  }
  if (!body || !Array.isArray(body.messages)) {
    res.status(400).json({ error: 'Request body must include a messages array' });
    return;
  }

  const messagesIn = sanitizeMessages(body.messages);
  if (messagesIn.length === 0) {
    res.status(400).json({ error: 'No valid messages' });
    return;
  }
  if (messagesIn.length > MAX_MESSAGES) {
    res.status(413).json({ error: `Too many messages (max ${MAX_MESSAGES})` });
    return;
  }

  const started = Date.now();
  let retrievalMs = 0;
  let retrievalStatus = 'off';
  let ttftMs = null;
  let carry = '';
  let logged = false;
  const toolRound = toolRoundCount(messagesIn);
  const capped = toolRound >= MAX_TOOL_ROUNDS;

  const logTiming = () => {
    if (logged) return;
    logged = true;
    const ttft = ttftMs == null ? 'none' : `${ttftMs}ms`;
    console.log(
      `[ai] retrieval=${retrievalMs}ms ${retrievalStatus} ttft=${ttft} toolRound=${toolRound}${capped ? ' capped' : ''} total=${Date.now() - started}ms`
    );
  };

  const observe = (value) => {
    if (ttftMs != null || value == null) return;
    carry += asText(value);
    if (carry.length > 8192) carry = carry.slice(-2048);
    if (sawModelToken(carry)) ttftMs = Date.now() - started;
  };

  let streamingStarted = false;
  const sendError = (status, error) => {
    if (streamingStarted) {
      try { res.write(`data: ${JSON.stringify({ error })}\n\n`); } catch { /* client gone */ }
      try { res.end(); } catch { /* client gone */ }
      return;
    }
    res.status(status).json({ error });
  };

  const streaming = !!body.stream;
  const controller = new AbortController();
  let deadlineHit = false;
  const deadlineTimer = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, HANDLER_DEADLINE_MS);
  const onClose = () => controller.abort();
  req.on('close', onClose);

  try {
    // Prime the SSE stream before any library lookup. The browser gives up
    // and retries without streaming if no byte arrives within 12s; a slow
    // Upstash call used to burn that budget before this comment was written.
    if (streaming) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      res.write(': stream-open\n\n');
      if (typeof res.flush === 'function') res.flush();
      streamingStarted = true;
    }

    let messages = messagesIn;
    let retrievedSources = null;
    if (body.useKnowledgeBase) {
      const t0 = Date.now();
      const systemParts = [EQNOC_KNOWLEDGE_BASE];
      if (vectorConfigured()) {
        const manualCtx = await retrieveLibraryContext(lastUserText(messagesIn));
        retrievalStatus = manualCtx?.status || 'empty';
        if (manualCtx?.prompt) {
          systemParts.push(manualCtx.prompt);
          retrievedSources = manualCtx.sources;
        }
      }
      retrievalMs = Date.now() - t0;
      messages = [{ role: 'system', content: systemParts.join('\n\n---\n\n') }, ...messagesIn];
    }

    if (deadlineHit || controller.signal.aborted) {
      sendError(504, deadlineHit ? 'Request deadline exceeded' : 'Upstream timed out');
      return;
    }

    const model = hasImageContent(messagesIn) ? visionModel : textModel;
    const requested = typeof body.max_tokens === 'number' ? body.max_tokens : DEFAULT_OUTPUT_TOKENS;

    const payload = {
      model,
      messages,
      stream: streaming,
      max_tokens: Math.max(1, Math.min(MAX_OUTPUT_TOKENS, requested)),
    };
    if (body.useKnowledgeBase && !capped) payload.tools = CHAT_TOOLS;
    if (typeof body.temperature === 'number') {
      payload.temperature = Math.max(0, Math.min(2, body.temperature));
    }

    let upstream;
    try {
      upstream = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer(),
          'X-Title': 'NOC Assistant',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err?.name === 'AbortError' || controller.signal.aborted;
      sendError(
        aborted ? 504 : 502,
        aborted
          ? (deadlineHit ? 'Request deadline exceeded' : 'Upstream timed out')
          : `Failed to reach OpenRouter: ${err.message}`,
      );
      return;
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      if (streamingStarted) {
        let error = 'Upstream failed';
        try {
          const parsed = JSON.parse(text);
          const e = parsed?.error;
          error = typeof e === 'string' ? e : (e?.message || text || error);
        } catch { error = text || error; }
        sendError(upstream.status, String(error).slice(0, 500));
        return;
      }
      res.status(upstream.status).setHeader('Content-Type', 'application/json');
      res.end(text);
      return;
    }

    if (streaming) {
      if (retrievedSources && retrievedSources.length > 0) {
        res.write(`data: ${JSON.stringify({ sources: retrievedSources })}\n\n`);
      }
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          observe(value);
          res.write(Buffer.from(value));
        }
      } catch {
        if (ttftMs == null && deadlineHit) {
          try { res.write(`data: ${JSON.stringify({ error: 'Request deadline exceeded' })}\n\n`); } catch { /* client gone */ }
        }
      } finally {
        try { res.end(); } catch { /* client gone */ }
      }
    } else {
      const data = await upstream.json();
      const msg = data?.choices?.[0]?.message;
      if (msg && (msg.content || (Array.isArray(msg.tool_calls) && msg.tool_calls.length))) {
        ttftMs = Date.now() - started;
      }
      if (retrievedSources && retrievedSources.length > 0) data.sources = retrievedSources;
      res.status(200).json(data);
    }
  } finally {
    clearTimeout(deadlineTimer);
    req.off?.('close', onClose);
    logTiming();
  }
}
