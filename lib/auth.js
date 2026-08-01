// Shared auth helpers for the serverless functions (api/login.js, api/ai.js).
// Not routed by Vercel — only files directly under api/ become endpoints.
//
// Tokens are stateless HMAC-signed strings: "<expiryMs>.<base64url(hmac)>".
// No database needed; any warm or cold serverless instance can verify a token
// as long as it shares the same signing secret.

import crypto from 'node:crypto';

// Prefer a dedicated AUTH_SECRET; fall back to APP_PASSWORD so the app works
// with a single env var configured. Setting both is recommended.
export function signingSecret() {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || '';
}

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function signToken(secret, ttlMs = DEFAULT_TTL_MS) {
  const exp = Date.now() + ttlMs;
  const payload = String(exp);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(secret, token) {
  if (!secret || !token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return true;
}

export function bearerFromRequest(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

export function passwordMatches(candidate) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Best-effort in-memory rate limiter. Scoped to a single warm serverless
// instance (state resets on cold start and is not shared across instances),
// so it's a coarse abuse backstop, not a hard guarantee. For strict limits,
// front this with Vercel Edge Middleware or an Upstash/Redis counter.
const buckets = new Map();

export function rateLimit(key, { windowMs, max }) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map doesn't grow unbounded on long-lived instances.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return { allowed: hits.length <= max, remaining: Math.max(0, max - hits.length) };
}

export function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
