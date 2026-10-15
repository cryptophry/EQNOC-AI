// Liveness probe. No auth and no upstream calls — stays fast when the model
// or the vector store is unavailable.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.status(200).json({ ok: true });
}
