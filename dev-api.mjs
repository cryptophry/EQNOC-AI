// Local dev server for the /api serverless functions.
// Vercel runs api/*.js in production; this shim runs the same handlers locally.
// Usage: npm run dev:api  (alongside npm run dev — vite proxies /api here)

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import aiHandler from './api/ai.js';
import loginHandler from './api/login.js';
import manualsHandler from './api/manuals.js';
import photosHandler from './api/photos.js';

// Load .env.local into process.env (no dotenv dependency needed)
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = process.env.API_PORT || 8787;

const routes = {
  '/api/ai': aiHandler,
  '/api/login': loginHandler,
  '/api/manuals': manualsHandler,
  '/api/photos': photosHandler,
};

createServer(async (req, res) => {
  const path = (req.url || '').split('?')[0];
  const handler = routes[path];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Collect body
  let raw = '';
  for await (const chunk of req) raw += chunk;

  // Minimal Vercel-style req/res shim
  const shimReq = {
    method: req.method,
    url: req.url,
    body: raw || undefined,
    headers: req.headers,
    socket: req.socket,
    on: (...a) => req.on(...a),
    off: (...a) => req.off(...a),
  };
  const shimRes = {
    _status: 200,
    status(code) { this._status = code; return this; },
    setHeader(k, v) { res.setHeader(k, v); return this; },
    json(obj) { res.writeHead(this._status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); },
    write(data) { if (!res.headersSent) res.writeHead(this._status); res.write(data); },
    end(data) { if (!res.headersSent) res.writeHead(this._status); res.end(data); },
  };

  try {
    await handler(shimReq, shimRes);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); }
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, () => {
  console.log(`[dev-api] /api/ai + /api/login on http://localhost:${PORT}`);
  console.log(`[dev-api] OPENROUTER_API_KEY ${process.env.OPENROUTER_API_KEY ? 'loaded' : 'MISSING'} | APP_PASSWORD ${process.env.APP_PASSWORD ? 'set' : 'MISSING'}`);
});
