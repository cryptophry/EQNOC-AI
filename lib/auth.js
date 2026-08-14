// Shared auth helpers for the serverless functions.
// Not routed by Vercel — only files directly under api/ become endpoints.
//
// Tokens are stateless HMAC-signed strings:
//   v2.<iatMs>.<expMs>.<jti>.<base64url(hmac)>
// Any warm or cold isolate can verify as long as it shares AUTH_SECRET.
//
// Production requires AUTH_SECRET (do not sign with APP_PASSWORD). Locally
// we still fall back to APP_PASSWORD so `npm run dev` works with one env var.

import crypto from 'node:crypto';

export const TOKEN_COOKIE = 'eqnoc_sess';
export const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days from first issue
export const RENEW_WITHIN_MS = 7 * 24 * 60 * 60 * 1000; // refresh only in the last week

function isProd() {
  return !!(process.env.VERCEL || process.env.NODE_ENV === 'production');
}

export function signingSecret() {
  const dedicated = process.env.AUTH_SECRET || '';
  if (dedicated) return dedicated;
  if (isProd()) return '';
  return process.env.APP_PASSWORD || '';
}

function hmac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function newJti() {
  return crypto.randomBytes(16).toString('base64url');
}

export function signToken(secret, opts = {}) {
  const now = Date.now();
  const iat = Number.isFinite(opts.iat) ? opts.iat : now;
  const ttlMs = Number.isFinite(opts.ttlMs) ? opts.ttlMs : DEFAULT_TTL_MS;
  const exp = now + ttlMs;
  const jti = opts.jti || newJti();
  const payload = `v2.${iat}.${exp}.${jti}`;
  return `${payload}.${hmac(secret, payload)}`;
}

export function parseToken(secret, token) {
  if (!secret || !token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts[0] !== 'v2' || parts.length !== 5) return null;
  const payload = parts.slice(0, 4).join('.');
  const sig = parts[4];
  const expected = hmac(secret, payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const iat = Number(parts[1]);
  const exp = Number(parts[2]);
  const jti = parts[3];
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || !jti) return null;
  const now = Date.now();
  if (now > exp) return null;
  if (now - iat > ABSOLUTE_TTL_MS) return null;
  return { iat, exp, jti };
}

export function verifyToken(secret, token) {
  return !!parseToken(secret, token);
}

export function shouldRenew(parsed) {
  if (!parsed) return false;
  return parsed.exp - Date.now() <= RENEW_WITHIN_MS;
}

export function bearerFromRequest(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

export function readCookie(req, name) {
  const header = req.headers?.cookie || req.headers?.Cookie || '';
  if (!header || typeof header !== 'string') return '';
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return '';
}

export function tokenFromRequest(req) {
  return readCookie(req, TOKEN_COOKIE) || bearerFromRequest(req);
}

export function sessionCookie(token, { clear = false } = {}) {
  const secure = isProd();
  const flags = `HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/`;
  if (clear) return `${TOKEN_COOKIE}=; ${flags}; Max-Age=0`;
  return `${TOKEN_COOKIE}=${token}; ${flags}; Max-Age=${Math.floor(DEFAULT_TTL_MS / 1000)}`;
}

export function passwordMatches(candidate) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Best-effort in-memory rate limiter. Scoped to a single warm isolate.
const buckets = new Map();

export function rateLimit(key, { windowMs, max }) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
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

export function bodyByteLength(body) {
  if (body == null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if (Buffer.isBuffer(body)) return body.length;
  try { return Buffer.byteLength(JSON.stringify(body), 'utf8'); } catch { return 0; }
}
