// Vercel serverless function: POST /api/login
// Verifies the shared app password (server-side) and sets an HttpOnly session cookie.
// The password never lives in the client bundle — the browser only holds a
// non-secret "signed in" flag; the token itself is not readable by JS.

import {
  signToken, signingSecret, passwordMatches, parseToken, shouldRenew,
  rateLimit, clientIp, tokenFromRequest, sessionCookie,
} from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.APP_PASSWORD) {
    res.status(500).json({ error: 'APP_PASSWORD is not configured on the server' });
    return;
  }
  const secret = signingSecret();
  if (!secret) {
    res.status(500).json({ error: 'AUTH_SECRET is not configured on the server' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const password = body && typeof body.password === 'string' ? body.password : '';
  const wantRefresh = !!(body && body.refresh);

  // Throttle password guesses only — silent cookie refresh must not share the bucket.
  if (!wantRefresh) {
    const ip = clientIp(req);
    const rl = rateLimit(`login:${ip}`, { windowMs: 60_000, max: 10 });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
      return;
    }
  }

  // Silent renewal: a still-valid cookie can be exchanged for a fresh one
  // only when it is inside the last week of its TTL. Absolute lifetime is
  // capped at 90 days from first issue (iat is preserved across renewals).
  if (wantRefresh || (!password && tokenFromRequest(req))) {
    const parsed = parseToken(secret, tokenFromRequest(req));
    if (!parsed) {
      res.setHeader('Set-Cookie', sessionCookie('', { clear: true }));
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    if (shouldRenew(parsed)) {
      const token = signToken(secret, { iat: parsed.iat });
      res.setHeader('Set-Cookie', sessionCookie(token));
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (!passwordMatches(password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken(secret);
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.status(200).json({ ok: true });
}
