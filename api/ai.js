// Vercel serverless function: proxies AI calls to OpenRouter.
// The OpenRouter API key lives ONLY here (server-side env var), never in the browser.
//
// Trust boundary:
//   - Requires a valid session (HttpOnly cookie, or legacy Bearer token)
//   - Ignores client model / tools; both are fixed server-side
//   - Strips client system messages; injects the knowledge base itself
//   - Always sets max_tokens; only accepts data: image URLs
//   - Aborts the upstream request on timeout or client disconnect
//   - Best-effort per-IP rate limiting

import { verifyToken, signingSecret, tokenFromRequest, rateLimit, clientIp, bodyByteLength } from '../lib/auth.js';
import { EQNOC_KNOWLEDGE_BASE } from '../lib/knowledgeBase.js';
import { vectorConfigured, queryChunks, getTitleMap } from '../lib/vectorStore.js';
import { CHAT_TOOLS } from '../lib/chatTools.js';
import { sanitizeMessages } from '../lib/sanitizeMessages.js';

const RETRIEVE_TOP_K = 6;
const RETRIEVE_MIN_SCORE = 0.35;

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

async function retrieveManualContext(messages) {
  const query = lastUserText(messages).trim();
  if (!query) return null;
  let hits, titleMap;
  try {
    [hits, titleMap] = await Promise.all([queryChunks(query, RETRIEVE_TOP_K), getTitleMap()]);
  } catch (e) {
    console.warn('manual retrieval failed', e.message);
    return null;
  }
  const good = (hits || []).filter((h) => (h.score ?? 0) >= RETRIEVE_MIN_SCORE && h.data);
  if (good.length === 0) return null;

  const sources = good.map((h) => {
    const kind = h.metadata?.kind === 'reference' ? 'image' : (h.metadata?.unit === 'section' ? 'guide' : 'manual');
    const title = (titleMap && titleMap[h.metadata?.manualId])
      || h.metadata?.title
      || (kind === 'image' ? 'Reference image' : kind === 'guide' ? 'Guide' : 'Manual');
    const site = h.metadata?.site ? String(h.metadata.site) : '';
    const label = kind === 'image'
      ? (site ? `reference image · ${site}` : 'reference image')
      : (kind === 'guide' ? `§${h.metadata?.page ?? '?'}` : `p.${h.metadata?.page ?? '?'}`);
    return { title, label, kind, text: h.data };
  });

  const excerpts = sources
    .map((s, i) => `[${i + 1}] (${s.kind === 'image' ? `${s.title} — ${s.label}` : `${s.title}, ${s.label}`})\n${s.text}`)
    .join('\n\n');
  const prompt = `RELEVANT MANUAL / GUIDE / REFERENCE-IMAGE EXCERPTS (retrieved for this question — prefer these over general knowledge, and CITE the source shown in each bracket: (Title, p.X) for manuals, (Title, §X) for guides, (Title — reference image) for images):\n\n${excerpts}`;
  return { prompt, sources };
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
const UPSTREAM_TIMEOUT_MS = 90_000;

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

  let messages = messagesIn;
  let retrievedSources = null;
  if (body.useKnowledgeBase) {
    const systemParts = [EQNOC_KNOWLEDGE_BASE];
    if (vectorConfigured()) {
      const manualCtx = await retrieveManualContext(messagesIn);
      if (manualCtx) { systemParts.push(manualCtx.prompt); retrievedSources = manualCtx.sources; }
    }
    messages = [{ role: 'system', content: systemParts.join('\n\n---\n\n') }, ...messagesIn];
  }

  const model = hasImageContent(messagesIn) ? visionModel : textModel;
  const requested = typeof body.max_tokens === 'number' ? body.max_tokens : DEFAULT_OUTPUT_TOKENS;

  const payload = {
    model,
    messages,
    stream: !!body.stream,
    max_tokens: Math.max(1, Math.min(MAX_OUTPUT_TOKENS, requested)),
  };
  if (body.useKnowledgeBase) payload.tools = CHAT_TOOLS;
  if (typeof body.temperature === 'number') {
    payload.temperature = Math.max(0, Math.min(2, body.temperature));
  }

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
        'HTTP-Referer': referer(),
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
    if (retrievedSources && retrievedSources.length > 0) {
      res.write(`data: ${JSON.stringify({ sources: retrievedSources })}\n\n`);
    }
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch {
      // client disconnect or upstream abort
    } finally {
      clearTimeout(timeout);
      req.off?.('close', onClose);
      res.end();
    }
  } else {
    clearTimeout(timeout);
    req.off?.('close', onClose);
    const data = await upstream.json();
    if (retrievedSources && retrievedSources.length > 0) data.sources = retrievedSources;
    res.status(200).json(data);
  }
}
