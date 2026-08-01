// Vercel serverless function: proxies AI calls to OpenRouter.
// The OpenRouter API key lives ONLY here (server-side env var), never in the browser.
//
// Env vars (set in Vercel project settings, or .env.local for `npm run dev:api`):
//   OPENROUTER_API_KEY  - required
//   OPENROUTER_MODEL    - optional, defaults to anthropic/claude-sonnet-4.5

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';

export default async function handler(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  // Health check used by the UI's ONLINE/OFFLINE indicator
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, configured: !!apiKey, model });
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

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || !Array.isArray(body.messages)) {
    res.status(400).json({ error: 'Request body must include a messages array' });
    return;
  }

  const payload = {
    model: body.model || model,
    messages: body.messages,
    stream: !!body.stream,
  };
  if (Array.isArray(body.tools) && body.tools.length > 0) payload.tools = body.tools;
  if (typeof body.temperature === 'number') payload.temperature = body.temperature;
  if (typeof body.max_tokens === 'number') payload.max_tokens = body.max_tokens;

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
    });
  } catch (err) {
    res.status(502).json({ error: `Failed to reach OpenRouter: ${err.message}` });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', 'application/json');
    res.end(text);
    return;
  }

  if (payload.stream) {
    // Pass the SSE stream straight through to the browser
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
    } finally {
      res.end();
    }
  } else {
    const data = await upstream.json();
    res.status(200).json(data);
  }
}
