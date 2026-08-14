// Vercel serverless function: manage "reference images" for RAG.

import { verifyToken, signingSecret, tokenFromRequest, rateLimit, clientIp, bodyByteLength } from '../lib/auth.js';
import {
  vectorConfigured, upsertChunks, deleteVectorsByPrefix, chunkText,
  getPhoto, getPhotos, upsertPhoto, deletePhotoRecord,
} from '../lib/vectorStore.js';
import { describeImage } from '../lib/vision.js';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export default async function handler(req, res) {
  if (!vectorConfigured()) {
    res.status(503).json({ error: 'Photo store not configured (UPSTASH_VECTOR_REST_URL/TOKEN)' });
    return;
  }
  if (!verifyToken(signingSecret(), tokenFromRequest(req))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rl = rateLimit(`photos:${clientIp(req)}`, { windowMs: 60_000, max: 120 });
  if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }

  try {
    if (req.method === 'GET') {
      res.status(200).json({ photos: await getPhotos() });
      return;
    }

    if (bodyByteLength(req.body) > MAX_BODY_BYTES) {
      res.status(413).json({ error: 'Image too large' });
      return;
    }
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }

    if (req.method === 'DELETE') {
      const { photoId } = body || {};
      if (!photoId) { res.status(400).json({ error: 'photoId required' }); return; }
      await deleteVectorsByPrefix(`${photoId}#`);
      await deletePhotoRecord(photoId);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'POST') {
      const { action } = body || {};

      if (action === 'ingest') {
        const { photoId, title, image, note } = body;
        if (!photoId || !image) { res.status(400).json({ error: 'photoId and image required' }); return; }
        const site = String(body.site || '').trim().slice(0, 60);

        let visionText = '';
        try { visionText = (await describeImage(image, note)).trim(); }
        catch (e) { res.status(502).json({ error: `Vision read failed: ${e.message}` }); return; }

        const label = (title || note || 'Reference image').trim();
        const body_ = [site ? `Site: ${site}` : '', note ? `Note: ${note}` : '', visionText].filter(Boolean).join('\n\n');
        const full = `${label}\n\n${body_}`.trim();
        const chunks = chunkText(full);
        const records = chunks.map((c, i) => ({
          id: `${photoId}#${i}`,
          data: c,
          metadata: { manualId: photoId, title: label, kind: 'reference', ...(site ? { site } : {}) },
        }));
        if (records.length) await upsertChunks(records);

        const summary = visionText.replace(/\s+/g, ' ').slice(0, 160);
        await upsertPhoto({
          id: photoId,
          title: label,
          site: site || null,
          summary,
          chunks: records.length,
          status: records.length ? 'ready' : 'empty',
          addedBy: null,
          addedAt: new Date().toISOString(),
        });
        res.status(200).json({ ok: true, chunksAdded: records.length, summary });
        return;
      }

      if (action === 'rename') {
        const { photoId, title, site } = body;
        const cleanTitle = title !== undefined ? String(title || '').trim().slice(0, 120) : undefined;
        const cleanSite = site !== undefined ? String(site || '').trim().slice(0, 60) : undefined;
        if (!photoId || (cleanTitle === undefined && cleanSite === undefined) || cleanTitle === '') {
          res.status(400).json({ error: 'photoId and a title or site required' }); return;
        }
        const p = await getPhoto(photoId);
        if (!p) { res.status(404).json({ error: 'Not found' }); return; }
        if (cleanTitle !== undefined) p.title = cleanTitle;
        if (cleanSite !== undefined) p.site = cleanSite || null;
        await upsertPhoto(p);
        res.status(200).json({ ok: true, title: p.title, site: p.site ?? null });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('photos error', e);
    res.status(500).json({ error: e.message || 'Photos error' });
  }
}
