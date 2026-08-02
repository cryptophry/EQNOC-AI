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
// Model routing: a cheap text-only model handles ordinary chat, but if a
// request contains a pasted image the proxy automatically upgrades that turn to
// a vision-capable model — so photo/screenshot analysis works without paying
// vision prices on every text message.
//
// Env vars:
//   OPENROUTER_API_KEY    - required
//   OPENROUTER_MODEL      - optional text model, defaults to deepseek/deepseek-v4-flash-0731
//   OPENROUTER_VISION_MODEL - optional model used only when an image is present,
//                             defaults to anthropic/claude-haiku-4.5
//   APP_PASSWORD          - required (used to sign/verify auth tokens; see lib/auth.js)
//   AUTH_SECRET           - optional, HMAC signing secret (falls back to APP_PASSWORD)

import { verifyToken, signingSecret, bearerFromRequest, rateLimit, clientIp } from '../lib/auth.js';
import { EQNOC_KNOWLEDGE_BASE } from '../lib/knowledgeBase.js';
import { vectorConfigured, queryChunks } from '../lib/vectorStore.js';

const RETRIEVE_TOP_K = 6;
const RETRIEVE_MIN_SCORE = 0.35; // ignore weak matches so general chat isn't polluted

// Pull the latest user question text out of the messages (handles multimodal content).
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

// Query the manual store and format grounded excerpts to inject into the prompt.
async function retrieveManualContext(messages) {
  const query = lastUserText(messages).trim();
  if (!query) return null;
  let hits;
  try {
    hits = await queryChunks(query, RETRIEVE_TOP_K);
  } catch (e) {
    console.warn('manual retrieval failed', e.message);
    return null;
  }
  const good = (hits || []).filter((h) => (h.score ?? 0) >= RETRIEVE_MIN_SCORE && h.data);
  if (good.length === 0) return null;
  const excerpts = good
    .map((h, i) => {
      let src;
      if (h.metadata?.kind === 'reference') {
        src = `${h.metadata?.title || 'Reference image'} — reference image`;
      } else if (h.metadata?.unit === 'section') {
        src = `${h.metadata?.title || 'Guide'}, §${h.metadata?.page ?? '?'}`;
      } else {
        src = `${h.metadata?.title || 'Manual'}, p.${h.metadata?.page ?? '?'}`;
      }
      return `[${i + 1}] (${src})\n${h.data}`;
    })
    .join('\n\n');
  return `RELEVANT MANUAL / GUIDE / REFERENCE-IMAGE EXCERPTS (retrieved for this question — prefer these over general knowledge, and CITE the source shown in each bracket: (Title, p.X) for manuals, (Title, §X) for guides, (Title — reference image) for images):\n\n${excerpts}`;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-0731';
const DEFAULT_VISION_MODEL = 'anthropic/claude-haiku-4.5';

// True if any message carries image content (OpenAI-format image_url parts).
function hasImageContent(messages) {
  return Array.isArray(messages) && messages.some(
    (m) => Array.isArray(m?.content) && m.content.some((p) => p?.type === 'image_url')
  );
}

// Guardrails
const MAX_OUTPUT_TOKENS = 8000;    // server ceiling for max_tokens
const MAX_MESSAGES = 100;          // conversation length cap per request
const MAX_BODY_BYTES = 6 * 1024 * 1024; // ~6MB (allows a couple of pasted images)
const UPSTREAM_TIMEOUT_MS = 90_000;

export default async function handler(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const textModel = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const visionModel = process.env.OPENROUTER_VISION_MODEL || DEFAULT_VISION_MODEL;

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
    const systemParts = [EQNOC_KNOWLEDGE_BASE];
    // Retrieve relevant manual excerpts (RAG) if the manual store is configured.
    if (vectorConfigured()) {
      const manualCtx = await retrieveManualContext(body.messages);
      if (manualCtx) systemParts.push(manualCtx);
    }
    messages = [{ role: 'system', content: systemParts.join('\n\n---\n\n') }, ...messages];
  }

  // --- Pick the model server-side: upgrade to the vision model only when the
  // request actually contains an image (clients never choose the model). ---
  const model = hasImageContent(body.messages) ? visionModel : textModel;

  // --- Build payload: model is server-controlled, max_tokens clamped ---
  const payload = {
    model,
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
