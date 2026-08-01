import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, bearerFromRequest } from '../lib/auth.js';

describe('auth tokens', () => {
  const secret = 'test-secret';

  it('verifies a freshly signed token', () => {
    const token = signToken(secret);
    expect(verifyToken(secret, token)).toBe(true);
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
    const sig = token.split('.')[1];
    const forged = `${Date.now() + 999999}.${sig}`;
    expect(verifyToken(secret, forged)).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = signToken(secret, -1000); // already expired
    expect(verifyToken(secret, token)).toBe(false);
  });

  it('rejects empty / malformed input', () => {
    expect(verifyToken(secret, '')).toBe(false);
    expect(verifyToken(secret, 'nodot')).toBe(false);
    expect(verifyToken('', signToken(secret))).toBe(false);
  });

  it('extracts a bearer token from headers', () => {
    expect(bearerFromRequest({ headers: { authorization: 'Bearer abc.def' } })).toBe('abc.def');
    expect(bearerFromRequest({ headers: {} })).toBe('');
  });
});
