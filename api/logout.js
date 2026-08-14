// Ends the session by expiring the HttpOnly cookie.

import { sessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }));
  res.status(200).json({ ok: true });
}
