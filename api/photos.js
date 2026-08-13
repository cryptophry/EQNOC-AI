// Vercel serverless function: manage "reference images" for RAG.
// (photos, wiring/circuit diagrams, sketches — any image a tech wants remembered)
//   GET    /api/photos              -> list photos (from the __photos__ manifest)
//   POST   /api/photos {action:...} -> ingest (a single photo)
//   DELETE /api/photos {photoId}    -> remove a photo's vectors + manifest entry
//
// A photo is a standalone image (nameplate, fault display, wiring label, etc.).
// The browser downscales it and sends it as a data URL; we run the vision model
// to transcribe visible text AND describe the equipment, then embed that text
// into Upstash Vector. Photo chunks share the default namespace with manual
// chunks, so retrieval in api/ai.js surfaces both together.

import { verifyToken, signingSecret, bearerFromRequest, rateLimit, clientIp } from '../lib/auth.js';
import {
  vectorConfigured, upsertChunks, deleteVectorsByPrefix, getPhotos, savePhotos,
} from '../lib/vectorStore.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'x-ai/grok-4.6';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask the vision model to both transcribe text and describe the photo, so the
// stored record answers "what does it say?" and "what is it?" later.
// Retries transient upstream errors (429/5xx) — field networks and OpenRouter
// both hiccup, and a dropped photo would be silently lost otherwise.
async function describeImage(dataUrl, note) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const hint = note ? `\n\nThe technician's note about this photo: "${note}". Use it for context.` : '';
  const payload = JSON.stringify({
    model: VISION_MODEL,
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'This is a reference image saved by a telecom technician — it may be a photo (e.g. a nameplate, fault display or label), a wiring/circuit diagram, or a hand sketch. Do two things in plain text:\n1) TRANSCRIPTION: transcribe ALL visible text exactly — nameplate/rating-plate data, model and part numbers, serial numbers, meter/display readings, labels, warnings, connector/port/pin markings, and any callouts or annotations on a diagram.\n2) DESCRIPTION: briefly and factually describe what the image shows. For a photo: equipment type, make/model if identifiable, visible condition, indicator/LED states. For a diagram or sketch: what it depicts (e.g. alarm circuit wiring), and each labelled component and how things connect (from/to, terminal/pin numbers, wire colours).\nDo not speculate beyond what is visible. Output only the transcription and description.' + hint },
      { type: 'image_url', image_url: { url: dataUrl } },
    ] }],
  });
  let lastErr = 'Vision error';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(600 * attempt);
    let res;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: payload,
      });
    } catch (e) { lastErr = e.message; continue; }
    if (res.ok) {
      const j = await res.json();
      return j.choices?.[0]?.message?.content || '';
    }
    lastErr = `Vision ${res.status}`;
    if (res.status !== 429 && res.status < 500) break; // client error — don't retry
  }
  throw new Error(lastErr);
}

export default async function handler(req, res) {
  if (!vectorConfigured()) {
    res.status(503).json({ error: 'Photo store not configured (UPSTASH_VECTOR_REST_URL/TOKEN)' });
    return;
  }
  // --- Auth ---
  if (!verifyToken(signingSecret(), bearerFromRequest(req))) {
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

    let body = req.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) { res.status(413).json({ error: 'Image too large' }); return; }
      body = JSON.parse(body);
    }

    if (req.method === 'DELETE') {
      const { photoId } = body || {};
      if (!photoId) { res.status(400).json({ error: 'photoId required' }); return; }
      await deleteVectorsByPrefix(`${photoId}#`);
      await savePhotos((await getPhotos()).filter((p) => p.id !== photoId));
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'POST') {
      const { action } = body || {};

      if (action === 'ingest') {
        const { photoId, title, image, note, addedBy } = body;
        if (!photoId || !image) { res.status(400).json({ error: 'photoId and image required' }); return; }
        const site = String(body.site || '').trim().slice(0, 60);

        let visionText = '';
        try { visionText = (await describeImage(image, note)).trim(); }
        catch (e) { res.status(502).json({ error: `Vision read failed: ${e.message}` }); return; }

        const label = (title || note || 'Reference image').trim();
        // The site name is embedded INTO the stored text so semantic retrieval
        // finds this image when a tech asks about the site by name.
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
        const photos = (await getPhotos()).filter((p) => p.id !== photoId);
        photos.unshift({
          id: photoId,
          title: label,
          site: site || null,
          summary,
          chunks: records.length,
          status: records.length ? 'ready' : 'empty',
          addedBy: addedBy || null,
          addedAt: new Date().toISOString(),
        });
        await savePhotos(photos);
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
        const photos = await getPhotos();
        const p = photos.find((x) => x.id === photoId);
        if (!p) { res.status(404).json({ error: 'Not found' }); return; }
        if (cleanTitle !== undefined) p.title = cleanTitle;
        if (cleanSite !== undefined) p.site = cleanSite || null;
        await savePhotos(photos);
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
