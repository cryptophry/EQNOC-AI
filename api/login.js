// Vercel serverless function: POST /api/login
// Verifies the shared app password (server-side) and returns a signed token.
// The password never lives in the client bundle — the browser only holds the
// short-lived token this endpoint returns.
//
// Env vars:
//   APP_PASSWORD - required, the shared login password
//   AUTH_SECRET  - optional, HMAC signing secret (falls back to APP_PASSWORD)

import { signToken, signingSecret, passwordMatches, verifyToken, rateLimit, clientIp } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.APP_PASSWORD) {
    res.status(500).json({ error: 'APP_PASSWORD is not configured on the server' });
    return;
  }

  // Throttle brute-force attempts per IP.
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`, { windowMs: 60_000, max: 10 });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const password = body && typeof body.password === 'string' ? body.password : '';
  const existing = body && typeof body.token === 'string' ? body.token : '';

  // Silent renewal: a still-valid token can be exchanged for a fresh one, so
  // active devices never hit expiry mid-use. Expired/invalid tokens (or no
  // token) require the password as before.
  if (!password && existing) {
    if (verifyToken(signingSecret(), existing)) {
      res.status(200).json({ token: signToken(signingSecret()) });
    } else {
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    return;
  }

  if (!passwordMatches(password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken(signingSecret());
  res.status(200).json({ token });
}
