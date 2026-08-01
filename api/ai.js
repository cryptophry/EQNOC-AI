// Vercel serverless function: proxies AI calls to OpenRouter.
// The OpenRouter API key lives ONLY here (server-side env var), never in the browser.
//
// Hardening (Phase 1):
//   - Requires a valid auth token (from POST /api/login) on every AI request
//   - Ignores the client's requested model — the model is fixed server-side
//   - Clamps max_tokens and caps message count / payload size
//   - Aborts the upstream request on timeout or client disconnect
//   - Best-effort per-IP rate limiting
//
// Env vars:
//   OPENROUTER_API_KEY - required
//   OPENROUTER_MODEL   - optional, defaults to anthropic/claude-haiku-4.5
//   APP_PASSWORD       - required (used to sign/verify auth tokens; see lib/auth.js)
//   AUTH_SECRET        - optional, HMAC signing secret (falls back to APP_PASSWORD)

import { verifyToken, signingSecret, bearerFromRequest, rateLimit, clientIp } from '../lib/auth.js';
import { EQNOC_KNOWLEDGE_BASE } from '../lib/knowledgeBase.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

// Guardrails
const MAX_OUTPUT_TOKENS = 8000;    // server ceiling for max_tokens
const MAX_MESSAGES = 100;          // conversation length cap per request
const MAX_BODY_BYTES = 6 * 1024 * 1024; // ~6MB (allows a couple of pasted images)
const UPSTREAM_TIMEOUT_MS = 90_000;

export default async function handler(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  // Health check used by the UI's ONLINE/OFFLINE indicator (public, no secrets).
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, configured: !!apiKey, authRequired: true });
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

  // --- Auth gate ---
  const token = bearerFromRequest(req);
  if (!verifyToken(signingSecret(), token)) {
    res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
    return;
  }

  // --- Rate limit (per IP, best-effort) ---
  const ip = clientIp(req);
  const rl = rateLimit(`ai:${ip}`, { windowMs: 60_000, max: 60 });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Slow down and try again shortly.' });
    return;
  }

  // --- Parse + validate body ---
  let raw = req.body;
  let body = raw;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      res.status(413).json({ error: 'Request too large' });
      return;
    }
    try { body = JSON.parse(raw); } catch { body = null; }
  }
  if (!body || !Array.isArray(body.messages)) {
    res.status(400).json({ error: 'Request body must include a messages array' });
    return;
  }
  if (body.messages.length > MAX_MESSAGES) {
    res.status(413).json({ error: `Too many messages (max ${MAX_MESSAGES})` });
    return;
  }

  // --- Inject the knowledge-base system prompt server-side when requested ---
  // (chat sessions set useKnowledgeBase; one-shot utility calls don't need it.)
  let messages = body.messages;
  if (body.useKnowledgeBase) {
    messages = [{ role: 'system', content: EQNOC_KNOWLEDGE_BASE }, ...messages];
  }

  // --- Build payload: model is server-controlled, max_tokens clamped ---
  const payload = {
    model, // deliberately ignore body.model — clients cannot pick the model
    messages,
    stream: !!body.stream,
  };
  if (Array.isArray(body.tools) && body.tools.length > 0) payload.tools = body.tools;
  if (typeof body.temperature === 'number') {
    payload.temperature = Math.max(0, Math.min(2, body.temperature));
  }
  if (typeof body.max_tokens === 'number') {
    payload.max_tokens = Math.max(1, Math.min(MAX_OUTPUT_TOKENS, body.max_tokens));
  }

  // --- Upstream request with timeout + client-disconnect abort ---
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const onClose = () => controller.abort();
  req.on('close', onClose);

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://noc-assistant.com',
        'X-Title': 'NOC Assistant',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    req.off?.('close', onClose);
    const aborted = err?.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted ? 'Upstream timed out' : `Failed to reach OpenRouter: ${err.message}`,
    });
    return;
  }

  if (!upstream.ok) {
    clearTimeout(timeout);
    req.off?.('close', onClose);
    const text = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', 'application/json');
    res.end(text);
    return;
  }

  if (payload.stream) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch {
      // client disconnect or upstream abort — stop quietly
    } finally {
      clearTimeout(timeout);
      req.off?.('close', onClose);
      res.end();
    }
  } else {
    clearTimeout(timeout);
    req.off?.('close', onClose);
    const data = await upstream.json();
    res.status(200).json(data);
  }
}
