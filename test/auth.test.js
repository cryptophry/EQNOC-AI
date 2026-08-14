import { describe, it, expect } from 'vitest';
import {
  signToken, verifyToken, parseToken, shouldRenew, bearerFromRequest,
  ABSOLUTE_TTL_MS, RENEW_WITHIN_MS,
} from '../lib/auth.js';

describe('auth tokens', () => {
  const secret = 'test-secret';

  it('verifies a freshly signed token', () => {
    const token = signToken(secret);
    expect(verifyToken(secret, token)).toBe(true);
    const parsed = parseToken(secret, token);
    expect(parsed).toBeTruthy();
    expect(parsed.jti).toBeTruthy();
    expect(parsed.iat).toBeLessThanOrEqual(Date.now());
  });

  it('rejects a token signed with a different secret', () => {
    const token = signToken(secret);
    expect(verifyToken('other-secret', token)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = signToken(secret);
    expect(verifyToken(secret, token + 'x')).toBe(false);
  });

  it('rejects a tampered expiry', () => {
    const token = signToken(secret);
    const parts = token.split('.');
    parts[2] = String(Date.now() + 999999999);
    expect(verifyToken(secret, parts.join('.'))).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = signToken(secret, { ttlMs: -1000 });
    expect(verifyToken(secret, token)).toBe(false);
  });

  it('rejects a token older than the absolute lifetime', () => {
    const token = signToken(secret, { iat: Date.now() - ABSOLUTE_TTL_MS - 1000 });
    expect(verifyToken(secret, token)).toBe(false);
  });

  it('renews only in the last week of the TTL', () => {
    const fresh = parseToken(secret, signToken(secret, { ttlMs: RENEW_WITHIN_MS + 60_000 }));
    expect(shouldRenew(fresh)).toBe(false);
    const soon = parseToken(secret, signToken(secret, { ttlMs: 60_000 }));
    expect(shouldRenew(soon)).toBe(true);
  });

  it('preserves iat across a re-issue', () => {
    const first = parseToken(secret, signToken(secret));
    const again = parseToken(secret, signToken(secret, { iat: first.iat }));
    expect(again.iat).toBe(first.iat);
  });

  it('rejects empty / malformed input', () => {
    expect(verifyToken(secret, '')).toBe(false);
    expect(verifyToken(secret, 'nodot')).toBe(false);
    expect(verifyToken('', signToken(secret))).toBe(false);
    expect(verifyToken(secret, '1.2.3.4.5')).toBe(false);
  });

  it('extracts a bearer token from headers', () => {
    expect(bearerFromRequest({ headers: { authorization: 'Bearer abc.def' } })).toBe('abc.def');
    expect(bearerFromRequest({ headers: {} })).toBe('');
  });
});
