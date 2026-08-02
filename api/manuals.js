// Vercel serverless function: manage equipment manuals for RAG.
//   GET    /api/manuals              -> list manuals (from the manifest)
//   POST   /api/manuals {action:...} -> start | ingest (a page) | finalize
//   DELETE /api/manuals {manualId}   -> remove a manual's vectors + manifest entry
//
// The browser parses the PDF (pdf.js): it sends each page as text, or — for
// scanned pages with no selectable text — as an image, which we OCR here with
// the vision model. All chunks land in Upstash Vector; retrieval happens in api/ai.js.

import { verifyToken, signingSecret, bearerFromRequest, rateLimit, clientIp } from '../lib/auth.js';
import {
  vectorConfigured, upsertChunks, deleteManualVectors, getManuals, saveManuals, rangeChunks,
} from '../lib/vectorStore.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'anthropic/claude-haiku-4.5';
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function chunkText(text, words = 150, overlap = 25) {
  const w = (text || '').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < w.length; i += words - overlap) {
    const seg = w.slice(i, i + words).join(' ');
    if (seg.length > 40) out.push(seg);
    if (i + words >= w.length) break;
  }
  return out;
}

async function ocrImage(dataUrl) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'This is a page or embedded screenshot from an equipment manual or a team guide. Transcribe ALL visible text and tables accurately as clean plain text (keep tables readable, one row per line). If the image is a screenshot, diagram or photo rather than a page of text, ALSO add a short line describing what it shows (e.g. which screen/menu/dialog, or what a diagram depicts). Output only the transcription and that description.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`OCR ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (!vectorConfigured()) {
    res.status(503).json({ error: 'Manual store not configured (UPSTASH_VECTOR_REST_URL/TOKEN)' });
    return;
  }
  // --- Auth ---
  if (!verifyToken(signingSecret(), bearerFromRequest(req))) {
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

    let body = req.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) { res.status(413).json({ error: 'Too large' }); return; }
      body = JSON.parse(body);
    }

    if (req.method === 'DELETE') {
      const { manualId } = body || {};
      if (!manualId) { res.status(400).json({ error: 'manualId required' }); return; }
      await deleteManualVectors(manualId);
      await saveManuals((await getManuals()).filter((m) => m.id !== manualId));
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'POST') {
      const { action } = body || {};

      if (action === 'start') {
        const { manualId, title, total, addedBy, unit, category } = body;
        if (!manualId || !title) { res.status(400).json({ error: 'manualId and title required' }); return; }
        const cat = String(category || 'other').trim().toLowerCase().slice(0, 30) || 'other';
        const manuals = (await getManuals()).filter((m) => m.id !== manualId);
        manuals.unshift({ id: manualId, title, pages: total || 0, chunks: 0, status: 'processing', type: unit === 'section' ? 'docx' : 'pdf', category: cat, addedBy: addedBy || null, addedAt: new Date().toISOString() });
        await saveManuals(manuals);
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'ingest') {
        const { manualId, title, page, text, image, unit } = body;
        if (!manualId || !page) { res.status(400).json({ error: 'manualId and page required' }); return; }
        let pageText = (text || '').trim();
        if (pageText.length < 100 && image) {
          // Scanned PDF page or an embedded guide screenshot — OCR/describe it and
          // keep any caption/heading we already have for context.
          try { const ocr = (await ocrImage(image)).trim(); pageText = (pageText ? pageText + '\n\n' : '') + ocr; } catch (e) { console.warn('ocr failed p'+page, e.message); }
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

      // Export a manual's stored chunks so the client can keep it offline.
      // Cursor-paginated; the client loops until nextCursor is empty.
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
        const manuals = await getManuals();
        const m = manuals.find((x) => x.id === manualId);
        if (!m) { res.status(404).json({ error: 'Not found' }); return; }
        if (cleanTitle !== undefined) m.title = cleanTitle;
        if (cleanCat !== undefined) m.category = cleanCat;
        await saveManuals(manuals);
        res.status(200).json({ ok: true, title: m.title, category: m.category || 'other' });
        return;
      }

      if (action === 'finalize') {
        const { manualId, chunks } = body;
        const manuals = await getManuals();
        const m = manuals.find((x) => x.id === manualId);
        if (m) { m.status = 'ready'; if (typeof chunks === 'number') m.chunks = chunks; await saveManuals(manuals); }
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
