// Vercel serverless function: manage equipment manuals for RAG.

import { verifyToken, signingSecret, tokenFromRequest, rateLimit, clientIp, bodyByteLength } from '../lib/auth.js';
import {
  vectorConfigured, upsertChunks, deleteManualVectors, chunkText, rangeChunks,
  getManual, getManuals, upsertManual, deleteManualRecord,
} from '../lib/vectorStore.js';
import { ocrImage } from '../lib/vision.js';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export default async function handler(req, res) {
  if (!vectorConfigured()) {
    res.status(503).json({ error: 'Manual store not configured (UPSTASH_VECTOR_REST_URL/TOKEN)' });
    return;
  }
  if (!verifyToken(signingSecret(), tokenFromRequest(req))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rl = rateLimit(`manuals:${clientIp(req)}`, { windowMs: 60_000, max: 120 });
  if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }

  try {
    if (req.method === 'GET') {
      res.status(200).json({ manuals: await getManuals() });
      return;
    }

    if (bodyByteLength(req.body) > MAX_BODY_BYTES) {
      res.status(413).json({ error: 'Too large' });
      return;
    }
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }

    if (req.method === 'DELETE') {
      const { manualId } = body || {};
      if (!manualId) { res.status(400).json({ error: 'manualId required' }); return; }
      await deleteManualVectors(manualId);
      await deleteManualRecord(manualId);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'POST') {
      const { action } = body || {};

      if (action === 'start') {
        const { manualId, title, total, addedBy, unit, category } = body;
        if (!manualId || !title) { res.status(400).json({ error: 'manualId and title required' }); return; }
        const cat = String(category || 'other').trim().toLowerCase().slice(0, 30) || 'other';
        await upsertManual({
          id: manualId,
          title,
          pages: total || 0,
          chunks: 0,
          status: 'processing',
          type: unit === 'section' ? 'docx' : 'pdf',
          category: cat,
          addedBy: addedBy || null,
          addedAt: new Date().toISOString(),
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'ingest') {
        const { manualId, title, page, text, image, unit } = body;
        if (!manualId || !page) { res.status(400).json({ error: 'manualId and page required' }); return; }
        let pageText = (text || '').trim();
        if (pageText.length < 100 && image) {
          try {
            const ocr = (await ocrImage(image)).trim();
            pageText = (pageText ? pageText + '\n\n' : '') + ocr;
          } catch (e) {
            console.warn('ocr failed p' + page, e.message);
          }
        }
        const chunks = chunkText(pageText);
        if (chunks.length === 0) { res.status(200).json({ ok: true, chunksAdded: 0 }); return; }
        const records = chunks.map((c, i) => ({
          id: `${manualId}#${page}#${i}`,
          data: c,
          metadata: { manualId, title: title || manualId, page, unit: unit || 'page' },
        }));
        await upsertChunks(records);
        res.status(200).json({ ok: true, chunksAdded: records.length });
        return;
      }

      if (action === 'export') {
        const { manualId, cursor } = body;
        if (!manualId) { res.status(400).json({ error: 'manualId required' }); return; }
        const { vectors, nextCursor } = await rangeChunks(`${manualId}#`, cursor || '', 400);
        const chunks = vectors.map((v) => ({
          page: v.metadata?.page ?? 0,
          unit: v.metadata?.unit || 'page',
          text: v.data || '',
        }));
        res.status(200).json({ chunks, nextCursor });
        return;
      }

      if (action === 'rename') {
        const { manualId, title, category } = body;
        const cleanTitle = title !== undefined ? String(title || '').trim().slice(0, 120) : undefined;
        const cleanCat = category !== undefined ? (String(category || '').trim().toLowerCase().slice(0, 30) || 'other') : undefined;
        if (!manualId || (cleanTitle === undefined && cleanCat === undefined) || cleanTitle === '') {
          res.status(400).json({ error: 'manualId and a title or category required' }); return;
        }
        const m = await getManual(manualId);
        if (!m) { res.status(404).json({ error: 'Not found' }); return; }
        if (cleanTitle !== undefined) m.title = cleanTitle;
        if (cleanCat !== undefined) m.category = cleanCat;
        await upsertManual(m);
        res.status(200).json({ ok: true, title: m.title, category: m.category || 'other' });
        return;
      }

      if (action === 'finalize') {
        const { manualId, chunks } = body;
        const m = await getManual(manualId);
        if (m) {
          m.status = 'ready';
          if (typeof chunks === 'number') m.chunks = chunks;
          await upsertManual(m);
        }
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('manuals error', e);
    res.status(500).json({ error: e.message || 'Manuals error' });
  }
}
