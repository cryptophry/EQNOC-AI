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
  // Pre-cookie clients sent the previous token in the body; still accept it
  // so a phone on a cached PWA can sign in / renew after this deploy.
  const presented = tokenFromRequest(req) || (body && typeof body.token === 'string' ? body.token : '');

  // Throttle password guesses only — silent cookie refresh must not share the bucket.
  if (password || !wantRefresh && !presented) {
    const ip = clientIp(req);
    const rl = rateLimit(`login:${ip}`, { windowMs: 60_000, max: 10 });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
      return;
    }
  }

  // Silent renewal: a still-valid cookie (or leftover body token) can be
  // exchanged for a fresh one only when it is inside the last week of its TTL.
  if (wantRefresh || (!password && presented)) {
    const parsed = parseToken(secret, presented);
    if (!parsed) {
      res.setHeader('Set-Cookie', sessionCookie('', { clear: true }));
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    let token = presented;
    if (shouldRenew(parsed)) {
      token = signToken(secret, { iat: parsed.iat });
      res.setHeader('Set-Cookie', sessionCookie(token));
    }
    // `token` kept in the JSON for cached pre-cookie clients.
    res.status(200).json({ ok: true, token });
    return;
  }

  if (!passwordMatches(password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken(secret);
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.status(200).json({ ok: true, token });
}
